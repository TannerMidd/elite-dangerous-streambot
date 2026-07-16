// ============================================================================
// Elite Dangerous -> Streamer.bot global variables — fully standalone.
//
// This single C# sub-action reads the Elite Dangerous journal itself on a
// background thread and publishes live globals (edSystem, edJumps,
// edLandingGearDown, ...) directly via CPH.SetGlobalVar. No external app
// required. (If you run the Elite Streambot app's variable sync, use one or
// the other — both at once just writes the same values twice.)
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
// ============================================================================
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    // ---- settings ----------------------------------------------------------
    private const string Prefix = "ed";     // variable name prefix
    private const int PollMs = 1000;        // journal/status poll interval
    private const string JournalDirOverride = ""; // set to a full path to override auto-detect

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

    private string _cmdr = "", _ship = "", _shipName = "", _system = "", _station = "", _lastEvent = "";
    private bool _docked;
    private long _jumps, _credits, _bounties, _bountyEarnings, _missions, _deaths,
                 _interdictions, _scans, _firstDiscoveries;
    private double _distanceLy;
    private long _flags = -1;              // -1 = Status.json not read yet
    private double _fuel = -1;
    private long _balance = -1;

    private readonly Dictionary<string, string> _pushed = new Dictionary<string, string>();

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

    // ---- journal event -> session state -------------------------------------
    private void ApplyLine(string line)
    {
        JObject e;
        try { e = JObject.Parse(line); }
        catch { return; }                        // partial/corrupt line

        string evt = (string)e["event"];
        if (string.IsNullOrEmpty(evt)) return;
        _lastEvent = evt;

        switch (evt)
        {
            case "LoadGame":
                _cmdr = Str(e, "Commander", _cmdr);
                _ship = Str(e, "Ship_Localised", Str(e, "Ship", _ship));
                _shipName = Str(e, "ShipName", _shipName);
                _balance = Num(e, "Credits", _balance);
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

    private static string Str(JObject o, string key, string fallback)
    {
        string v = (string)o[key];
        return string.IsNullOrEmpty(v) ? fallback : v;
    }

    private static long Num(JObject o, string key, long fallback)
    {
        return (long?)o[key] ?? fallback;
    }

    // ---- Status.json (live ship state) --------------------------------------
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

        _flags = (long?)o["Flags"] ?? _flags;
        var fuel = o["Fuel"] == null ? null : (double?)o["Fuel"]["FuelMain"];
        if (fuel.HasValue) _fuel = fuel.Value;
        _balance = (long?)o["Balance"] ?? _balance;
    }

    private bool Flag(int bit)
    {
        return _flags >= 0 && (_flags & (1L << bit)) != 0;
    }

    // ---- publish only what changed -------------------------------------------
    private void Publish()
    {
        var vars = new Dictionary<string, object>
        {
            { Prefix + "Cmdr", _cmdr },
            { Prefix + "Ship", _ship },
            { Prefix + "ShipName", _shipName },
            { Prefix + "System", _system },
            { Prefix + "Station", _station },
            { Prefix + "Jumps", _jumps },
            { Prefix + "DistanceLy", Math.Round(_distanceLy, 1) },
            { Prefix + "CreditsEarned", _credits },
            { Prefix + "Bounties", _bounties },
            { Prefix + "BountyEarnings", _bountyEarnings },
            { Prefix + "MissionsCompleted", _missions },
            { Prefix + "Deaths", _deaths },
            { Prefix + "Interdictions", _interdictions },
            { Prefix + "BodiesScanned", _scans },
            { Prefix + "FirstDiscoveries", _firstDiscoveries },
            { Prefix + "LastEvent", _lastEvent },
        };
        if (_fuel >= 0) vars[Prefix + "FuelLevel"] = Math.Round(_fuel, 1);
        if (_balance >= 0) vars[Prefix + "Balance"] = _balance;

        // Ship-state flags only once Status.json has actually been read —
        // never publish a misleading "false" for state we haven't observed.
        if (_flags >= 0)
        {
            vars[Prefix + "Docked"] = Flag(0);
            vars[Prefix + "Landed"] = Flag(1);
            vars[Prefix + "LandingGearDown"] = Flag(2);
            vars[Prefix + "ShieldsUp"] = Flag(3);
            vars[Prefix + "Supercruise"] = Flag(4);
            vars[Prefix + "HardpointsDeployed"] = Flag(6);
            vars[Prefix + "ScoopingFuel"] = Flag(11);
            vars[Prefix + "FsdCharging"] = Flag(17);
            vars[Prefix + "LowFuel"] = Flag(19);
            vars[Prefix + "Overheating"] = Flag(20);
            vars[Prefix + "InDanger"] = Flag(22);
        }

        foreach (var kv in vars)
        {
            string s = Convert.ToString(kv.Value);
            string prev;
            if (_pushed.TryGetValue(kv.Key, out prev) && prev == s) continue;
            CPH.SetGlobalVar(kv.Key, kv.Value, true);
            _pushed[kv.Key] = s;
        }
    }
}
