// ============================================================================
// Elite Dangerous -> Streamer.bot global variables — fully standalone.
//
// This single C# sub-action reads the Elite Dangerous journal itself on a
// background thread and publishes globals directly via CPH.SetGlobalVar.
// No external app required.
//
// COVERAGE — everything the game writes:
//   1. EVERY journal event is mirrored automatically (no allow-list):
//        edEvt<Name>Count           how many this session   (edEvtFSDJumpCount)
//        edEvt<Name>Last            timestamp of the latest  (edEvtFSDJumpLast)
//        edEvt<Name>_<Field>        every field of the latest occurrence,
//                                   nested objects flattened with underscores
//                                   (edEvtFSDJump_StarSystem, edEvtDocked_StationName,
//                                    edEvtLoadout_FuelCapacity_Main, ...)
//      Events added in future game patches appear automatically.
//   2. Complete Status.json state: all 32 ship flags, all Flags2 on-foot
//      flags, pips, fire group, GUI focus (+ name), fuel, cargo, legal state,
//      balance, altitude/lat/long/heading, body, destination, oxygen, health,
//      temperature, selected weapon, gravity.
//   3. Curated session aggregates for convenience: edJumps, edCreditsEarned,
//      edBounties, edDeaths, edSystem, edStation, edLastEvent, ...
//
// SETUP (once):
//   1. Actions tab -> right-click -> Add -> name it "ED Journal Watcher".
//   2. Sub-Actions -> right-click -> Core -> C# -> Execute C# Code.
//   3. Paste this entire file, click Compile (should say OK), then Save.
//   4. Right-click the action's Triggers pane -> Core -> Application ->
//      "Streamer.bot Started" so it starts automatically with Streamer.bot.
//   5. Start it now: right-click the action -> Test Action.
//
// Watch the variables under (x) Global Variables -> Persisted Globals.
// After editing this code, restart Streamer.bot so the old watcher thread
// isn't left running alongside the new one.
// (If you also run the Elite Streambot app's variable sync, use one or the
//  other — not both.)
// ============================================================================
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    // ---- settings ----------------------------------------------------------
    private const string Prefix = "ed";      // variable name prefix
    private const int PollMs = 1000;         // journal/status poll interval
    private const string JournalDirOverride = ""; // full path to override auto-detect

    // Mirroring every event is the default. If a spammy event ever bothers
    // you (e.g. "Music"), list it here to skip its per-field mirror
    // (aggregates and edLastEvent still see it).
    private static readonly string[] MirrorExclude = { };

    private const int MaxVariables = 5000;   // safety cap on distinct globals
    private const int MaxValueLen = 400;     // long strings/arrays truncated to this
    private const int MaxFlattenDepth = 2;   // nested objects flattened this deep

    // ---- lifecycle ---------------------------------------------------------
    private static Thread _worker;
    private static volatile bool _running;

    public bool Execute()
    {
        if (_running)
        {
            CPH.LogInfo("[ED] Journal watcher is already running.");
            return true;
        }
        _running = true;
        _worker = new Thread(Loop) { IsBackground = true, Name = "EDJournalWatcher" };
        _worker.Start();
        CPH.LogInfo("[ED] Journal watcher started.");
        return true;
    }

    // Called by Streamer.bot when the code is recompiled or the app closes.
    public void Dispose()
    {
        _running = false;
        CPH.LogInfo("[ED] Journal watcher stopping.");
    }

    // ---- state -------------------------------------------------------------
    private string _dir;
    private string _file;
    private long _offset;

    // curated aggregates
    private string _cmdr = "", _ship = "", _shipName = "", _system = "", _station = "", _lastEvent = "";
    private bool _docked;
    private long _jumps, _credits, _bounties, _bountyEarnings, _missions, _deaths,
                 _interdictions, _scans, _firstDiscoveries;
    private double _distanceLy;

    // desired variable state (accumulated) vs what has been written to SB
    private readonly Dictionary<string, object> _pending = new Dictionary<string, object>();
    private readonly Dictionary<string, string> _pushed = new Dictionary<string, string>();
    private readonly Dictionary<string, long> _eventCounts = new Dictionary<string, long>();
    private bool _capWarned;

    // ---- main loop ----------------------------------------------------------
    private void Loop()
    {
        _dir = JournalDirOverride.Length > 0
            ? JournalDirOverride
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                           "Saved Games", "Frontier Developments", "Elite Dangerous");

        if (!Directory.Exists(_dir))
            CPH.LogWarn("[ED] Journal folder not found yet: " + _dir + " (will keep checking)");

        while (_running)
        {
            try
            {
                // Newest journal wins; a brand-new file is read from the top,
                // which on first pass doubles as the session-rebuild replay.
                string newest = FindNewestJournal();
                if (newest != null && newest != _file)
                {
                    _file = newest;
                    _offset = 0;
                    CPH.LogInfo("[ED] Tailing " + Path.GetFileName(_file));
                }
                if (_file != null) ReadNewLines();
                ReadStatus();
                BuildAggregates();
                Publish();
            }
            catch (Exception ex)
            {
                CPH.LogWarn("[ED] " + ex.Message);
            }
            Thread.Sleep(PollMs);
        }
    }

    private string FindNewestJournal()
    {
        if (!Directory.Exists(_dir)) return null;
        return Directory.GetFiles(_dir, "Journal.*.log")
                        .OrderByDescending(File.GetLastWriteTimeUtc)
                        .FirstOrDefault();
    }

    /// Reads bytes appended since last poll; only complete lines are consumed.
    /// FileShare.ReadWrite is required — the game keeps the journal open.
    private void ReadNewLines()
    {
        var fi = new FileInfo(_file);
        if (!fi.Exists) return;
        if (fi.Length < _offset) _offset = 0;   // truncated/replaced in place
        if (fi.Length == _offset) return;

        byte[] buf;
        using (var fs = new FileStream(_file, FileMode.Open, FileAccess.Read,
                                       FileShare.ReadWrite | FileShare.Delete))
        {
            fs.Seek(_offset, SeekOrigin.Begin);
            buf = new byte[fs.Length - _offset];
            int read = fs.Read(buf, 0, buf.Length);
            if (read <= 0) return;
            if (read < buf.Length) Array.Resize(ref buf, read);
        }

        int lastNl = Array.LastIndexOf(buf, (byte)'\n');
        if (lastNl < 0) return;                 // no complete line yet
        _offset += lastNl + 1;

        string text = Encoding.UTF8.GetString(buf, 0, lastNl + 1);
        foreach (string raw in text.Split('\n'))
        {
            string line = raw.Trim();
            if (line.Length > 0) ApplyLine(line);
        }
    }

    // ---- journal event -> mirror + aggregates --------------------------------
    private void ApplyLine(string line)
    {
        JObject e;
        try { e = JObject.Parse(line); }
        catch { return; }                        // partial/corrupt line

        string evt = (string)e["event"];
        if (string.IsNullOrEmpty(evt)) return;
        _lastEvent = evt;

        MirrorEvent(evt, e);
        Aggregate(evt, e);
    }

    /// The complete-coverage layer: reflect ANY event into variables.
    private void MirrorEvent(string evt, JObject e)
    {
        string name = Sanitize(evt);
        string baseKey = Prefix + "Evt" + name;

        long count;
        _eventCounts.TryGetValue(evt, out count);
        count++;
        _eventCounts[evt] = count;
        Set(baseKey + "Count", count);
        Set(baseKey + "Last", Str(e, "timestamp", ""));

        if (MirrorExclude.Contains(evt)) return;
        foreach (var prop in e.Properties())
        {
            if (prop.Name == "event" || prop.Name == "timestamp") continue;
            Flatten(baseKey + "_" + Sanitize(prop.Name), prop.Value, 0);
        }
    }

    /// Flatten any JSON value into variables. Objects flatten with underscores
    /// up to MaxFlattenDepth; deeper structures and arrays become JSON strings
    /// (arrays also get a Count); long values are truncated.
    private void Flatten(string key, JToken v, int depth)
    {
        if (key.Length > 100) return;
        switch (v.Type)
        {
            case JTokenType.Object:
                if (depth >= MaxFlattenDepth)
                {
                    Set(key, Truncate(v.ToString(Formatting.None)));
                    return;
                }
                foreach (var p in ((JObject)v).Properties())
                    Flatten(key + "_" + Sanitize(p.Name), p.Value, depth + 1);
                break;
            case JTokenType.Array:
                var arr = (JArray)v;
                Set(key + "Count", (long)arr.Count);
                Set(key, Truncate(v.ToString(Formatting.None)));
                break;
            case JTokenType.Boolean:
                Set(key, (bool)v);
                break;
            case JTokenType.Integer:
                Set(key, (long)v);
                break;
            case JTokenType.Float:
                Set(key, Math.Round((double)v, 4));
                break;
            case JTokenType.Null:
            case JTokenType.Undefined:
                break;
            default:
                Set(key, Truncate(v.ToString()));
                break;
        }
    }

    /// Curated session aggregates (running totals across the session).
    private void Aggregate(string evt, JObject e)
    {
        switch (evt)
        {
            case "LoadGame":
                _cmdr = Str(e, "Commander", _cmdr);
                _ship = Str(e, "Ship_Localised", Str(e, "Ship", _ship));
                _shipName = Str(e, "ShipName", _shipName);
                break;
            case "Commander":
                _cmdr = Str(e, "Name", _cmdr);
                break;
            case "Loadout":
                _ship = Str(e, "Ship", _ship);
                _shipName = Str(e, "ShipName", _shipName);
                break;
            case "Location":
            case "CarrierJump":
                _system = Str(e, "StarSystem", _system);
                _docked = (bool?)e["Docked"] ?? false;
                _station = _docked ? Str(e, "StationName", "") : "";
                break;
            case "FSDJump":
                _jumps++;
                _distanceLy += (double?)e["JumpDist"] ?? 0;
                _system = Str(e, "StarSystem", _system);
                _station = "";
                _docked = false;
                break;
            case "Docked":
                _docked = true;
                _station = Str(e, "StationName", _station);
                _system = Str(e, "StarSystem", _system);
                break;
            case "Undocked":
                _docked = false;
                _station = "";
                break;
            case "Bounty":
                long reward = Num(e, "TotalReward", Num(e, "Reward", 0));
                _bounties++;
                _bountyEarnings += reward;
                _credits += reward;
                break;
            case "RedeemVoucher":
                _credits += Num(e, "Amount", 0);
                break;
            case "MissionCompleted":
                _missions++;
                _credits += Num(e, "Reward", 0);
                break;
            case "MarketSell":
                _credits += Num(e, "TotalSale", 0);
                break;
            case "SellExplorationData":
            case "MultiSellExplorationData":
                long earn = Num(e, "TotalEarnings", 0);
                _credits += earn > 0 ? earn : Num(e, "BaseValue", 0) + Num(e, "Bonus", 0);
                break;
            case "Died":
                _deaths++;
                break;
            case "Interdicted":
                _interdictions++;
                break;
            case "Scan":
                _scans++;
                if ((bool?)e["WasDiscovered"] == false) _firstDiscoveries++;
                break;
        }
    }

    private void BuildAggregates()
    {
        Set(Prefix + "Cmdr", _cmdr);
        Set(Prefix + "Ship", _ship);
        Set(Prefix + "ShipName", _shipName);
        Set(Prefix + "System", _system);
        Set(Prefix + "Station", _station);
        Set(Prefix + "Docked", _docked);
        Set(Prefix + "Jumps", _jumps);
        Set(Prefix + "DistanceLy", Math.Round(_distanceLy, 1));
        Set(Prefix + "CreditsEarned", _credits);
        Set(Prefix + "Bounties", _bounties);
        Set(Prefix + "BountyEarnings", _bountyEarnings);
        Set(Prefix + "MissionsCompleted", _missions);
        Set(Prefix + "Deaths", _deaths);
        Set(Prefix + "Interdictions", _interdictions);
        Set(Prefix + "BodiesScanned", _scans);
        Set(Prefix + "FirstDiscoveries", _firstDiscoveries);
        Set(Prefix + "LastEvent", _lastEvent);
    }

    // ---- Status.json — complete live state -----------------------------------
    private static readonly string[] FlagNames =
    {
        "Docked", "Landed", "LandingGearDown", "ShieldsUp", "Supercruise",
        "FlightAssistOff", "HardpointsDeployed", "InWing", "LightsOn",
        "CargoScoopDeployed", "SilentRunning", "ScoopingFuel", "SrvHandbrake",
        "SrvUsingTurretView", "SrvTurretRetracted", "SrvDriveAssist",
        "FsdMassLocked", "FsdCharging", "FsdCooldown", "LowFuel", "Overheating",
        "HasLatLong", "InDanger", "BeingInterdicted", "InMainShip", "InFighter",
        "InSRV", "AnalysisMode", "NightVision", "AltitudeFromAverageRadius",
        "FsdJump", "SrvHighBeam",
    };

    private static readonly string[] Flags2Names =
    {
        "OnFoot", "InTaxi", "InMulticrew", "OnFootInStation", "OnFootOnPlanet",
        "AimDownSight", "LowOxygen", "LowHealth", "Cold", "Hot", "VeryCold",
        "VeryHot", "GlideMode", "OnFootInHangar", "OnFootSocialSpace",
        "OnFootExterior", "BreathableAtmosphere", "TelepresenceMulticrew",
        "PhysicalMulticrew", "FsdHyperdriveCharging",
    };

    private static readonly string[] GuiFocusNames =
    {
        "NoFocus", "InternalPanel", "ExternalPanel", "CommsPanel", "RolePanel",
        "StationServices", "GalaxyMap", "SystemMap", "Orrery", "FSS", "SAA", "Codex",
    };

    private void ReadStatus()
    {
        string f = Path.Combine(_dir, "Status.json");
        if (!File.Exists(f)) return;
        string raw;
        using (var fs = new FileStream(f, FileMode.Open, FileAccess.Read,
                                       FileShare.ReadWrite | FileShare.Delete))
        using (var sr = new StreamReader(fs))
            raw = sr.ReadToEnd();
        if (string.IsNullOrWhiteSpace(raw)) return;   // game writes non-atomically

        JObject o;
        try { o = JObject.Parse(raw); }
        catch { return; }

        // Every ship flag, by name
        long? flags = (long?)o["Flags"];
        if (flags.HasValue)
            for (int i = 0; i < FlagNames.Length; i++)
                Set(Prefix + FlagNames[i], (flags.Value & (1L << i)) != 0);

        // Every on-foot flag (Odyssey), by name
        long? flags2 = (long?)o["Flags2"];
        if (flags2.HasValue)
            for (int i = 0; i < Flags2Names.Length; i++)
                Set(Prefix + Flags2Names[i], (flags2.Value & (1L << i)) != 0);

        // Pips (half-pips in the file -> shown as 0-4 with .5 steps)
        var pips = o["Pips"] as JArray;
        if (pips != null && pips.Count == 3)
        {
            Set(Prefix + "PipsSys", (double)(long)pips[0] / 2.0);
            Set(Prefix + "PipsEng", (double)(long)pips[1] / 2.0);
            Set(Prefix + "PipsWep", (double)(long)pips[2] / 2.0);
        }

        long? fireGroup = (long?)o["FireGroup"];
        if (fireGroup.HasValue) Set(Prefix + "FireGroup", fireGroup.Value);

        long? gui = (long?)o["GuiFocus"];
        if (gui.HasValue)
        {
            Set(Prefix + "GuiFocus", gui.Value);
            Set(Prefix + "GuiFocusName",
                gui.Value >= 0 && gui.Value < GuiFocusNames.Length
                    ? GuiFocusNames[gui.Value] : "Unknown");
        }

        var fuel = o["Fuel"] as JObject;
        if (fuel != null)
        {
            double? main = (double?)fuel["FuelMain"];
            double? res = (double?)fuel["FuelReservoir"];
            if (main.HasValue) Set(Prefix + "FuelLevel", Math.Round(main.Value, 2));
            if (res.HasValue) Set(Prefix + "FuelReservoir", Math.Round(res.Value, 2));
        }

        SetIfNum(o, "Cargo", Prefix + "CargoTons");
        SetIfStr(o, "LegalState", Prefix + "LegalState");
        SetIfNum(o, "Balance", Prefix + "Balance");
        SetIfNum(o, "Altitude", Prefix + "Altitude");
        SetIfNum(o, "Latitude", Prefix + "Latitude");
        SetIfNum(o, "Longitude", Prefix + "Longitude");
        SetIfNum(o, "Heading", Prefix + "Heading");
        SetIfStr(o, "BodyName", Prefix + "BodyName");
        SetIfNum(o, "PlanetRadius", Prefix + "PlanetRadius");
        SetIfNum(o, "Oxygen", Prefix + "Oxygen");
        SetIfNum(o, "Health", Prefix + "Health");
        SetIfNum(o, "Temperature", Prefix + "Temperature");
        SetIfStr(o, "SelectedWeapon", Prefix + "SelectedWeapon");
        SetIfNum(o, "Gravity", Prefix + "Gravity");

        var dest = o["Destination"] as JObject;
        if (dest != null)
        {
            SetIfNum(dest, "System", Prefix + "DestinationSystem");
            SetIfNum(dest, "Body", Prefix + "DestinationBody");
            SetIfStr(dest, "Name", Prefix + "DestinationName");
        }
    }

    // ---- publish only what changed -------------------------------------------
    private void Publish()
    {
        foreach (var kv in _pending)
        {
            string s = Convert.ToString(kv.Value);
            string prev;
            if (_pushed.TryGetValue(kv.Key, out prev) && prev == s) continue;
            CPH.SetGlobalVar(kv.Key, kv.Value, true);
            _pushed[kv.Key] = s;
        }
    }

    // ---- helpers ---------------------------------------------------------------
    private void Set(string key, object value)
    {
        if (_pending.Count >= MaxVariables && !_pending.ContainsKey(key))
        {
            if (!_capWarned)
            {
                _capWarned = true;
                CPH.LogWarn("[ED] Variable cap (" + MaxVariables + ") reached; new names are being skipped.");
            }
            return;
        }
        _pending[key] = value;
    }

    private void SetIfNum(JObject o, string field, string key)
    {
        double? v = (double?)o[field];
        if (v.HasValue) Set(key, Math.Round(v.Value, 4));
    }

    private void SetIfStr(JObject o, string field, string key)
    {
        string v = (string)o[field];
        if (!string.IsNullOrEmpty(v)) Set(key, v);
    }

    private static string Sanitize(string name)
    {
        var sb = new StringBuilder(name.Length);
        foreach (char c in name)
            if (char.IsLetterOrDigit(c) || c == '_') sb.Append(c);
        return sb.ToString();
    }

    private static string Truncate(string s)
    {
        return s.Length <= MaxValueLen ? s : s.Substring(0, MaxValueLen);
    }

    private static string Str(JObject o, string key, string fallback)
    {
        string v = (string)o[key];
        return string.IsNullOrEmpty(v) ? fallback : v;
    }

    private static long Num(JObject o, string key, long fallback)
    {
        return (long?)o[key] ?? fallback;
    }
}
