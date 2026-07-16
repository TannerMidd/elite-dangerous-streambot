// ============================================================================
// Elite Dangerous -> Streamer.bot — the complete standalone journal watcher.
//
// One C# sub-action. No external app, and no extra assembly references —
// this file deliberately uses only types Streamer.bot's C# compiler can see
// by default (no LINQ, no HashSet, no FileSystemWatcher), so it compiles
// with a plain paste.
//
// It reads the Elite Dangerous journal and companion files on a background
// worker and gives you BOTH:
//
//   NATIVE TRIGGERS (bind actions in Streamer.bot's own trigger menu)
//     Elite Dangerous > Any Journal Event          every live journal line
//     Elite Dangerous > Journal Events > <Name>    one trigger per event type
//                                                  (FSDJump, Docked, Bounty, ...
//                                                  registered automatically as
//                                                  each type is first seen)
//     Elite Dangerous > Ship State > <Flag> On/Off one trigger per flag edge
//                                                  (LandingGearDown Off -> your
//                                                  "press L" action, natively)
//     Elite Dangerous > Any Ship Flag Changed      every flag transition
//     Elite Dangerous > Companion File Updated     Cargo/NavRoute/Market/... changed
//     Elite Dangerous > Watcher Status             started/stopped/errors
//   Trigger arguments carry the data: %edEventName%, %edEventJson%, and every
//   event field as %edEvent_<Field>%; flag triggers carry %edFlag%/%edValue%.
//
//   GLOBAL VARIABLES (live state, under (x) Global Variables -> Persisted)
//     - Every journal event mirrored: edEvt<Name>Count / edEvt<Name>Last /
//       edEvt<Name>_<Field> for every field of the latest occurrence.
//       Stale fields from a previous occurrence are unset automatically.
//     - Complete Status.json: all 32 ship flags + all on-foot flags by name,
//       pips, fire group, GUI focus (+name), fuel, cargo, legal state,
//       balance, lat/long/heading/altitude, body, oxygen/health/temperature,
//       selected weapon, gravity, destination.
//     - Companion files: Cargo.json, NavRoute.json, Market.json, Backpack.json,
//       ShipLocker.json, ModulesInfo.json, ... flattened as edFile<Name>_<Field>,
//       plus navigation state (edNavTargetSystem, edNavRemainingJumps, ...).
//     - Session aggregates: edJumps, edCreditsEarned, edBounties, edDeaths,
//       edMissionsCompleted, edFirstDiscoveries, edSystem, edStation, ...
//
//   ROBUSTNESS
//     - Checkpoint/resume: the exact byte position survives Streamer.bot
//       restarts — no reprocessing, no duplicate trigger storms. First run
//       hydrates state from the newest journal WITHOUT firing triggers.
//     - Scans once per second; journal rollover drains the old file before
//       switching to the new one; mid-write files are retried.
//     - A large offline backlog (Streamer.bot closed while you played)
//       updates variables but suppresses the trigger flood.
//
// SETUP (once):
//   1. Actions tab -> right-click -> Add -> name it "ED Journal Watcher".
//   2. Sub-Actions -> right-click -> Core -> C# -> Execute C# Code.
//   3. Paste this entire file, click Compile (should say OK).
//   4. In the sub-action's settings tick "Precompile on Application Start"
//      (this makes Init() run when Streamer.bot starts, which registers the
//      triggers and starts the watcher automatically).
//   5. Save. Start it right now with right-click -> Test Action, or just
//      restart Streamer.bot.
//
// OPTIONAL CONFIG (persisted globals, create them under (x) Global Variables):
//   edConfigJournalDir   full path, overrides auto-detection
//   edConfigAutoStart    set false to require a manual start
//
// CONTROL (Core -> C# -> Execute C# Method on this sub-action):
//   StartWatcher / StopWatcher / ResetState / TestVariables
//
// After editing this code, restart Streamer.bot so the old worker is gone.
// (If you also run the Elite Streambot app's variable sync, use one or the
//  other — not both.)
// ============================================================================
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    // ---- settings ----------------------------------------------------------
    private const string Prefix = "ed";       // prefix for every variable
    private const int ScanMs = 1000;          // journal/status scan interval
    private const int MaxVariables = 5000;    // cap on distinct globals
    private const int MaxValueLen = 400;      // long strings/arrays truncated/skipped
    private const int MaxJsonArg = 4000;      // event JSON length passed to triggers
    private const int MaxLiveBacklog = 200;   // > this many pending lines: vars only, no trigger flood

    // Event types whose per-field variable mirror is skipped (triggers/counts
    // still fire). Empty by default: everything is mirrored.
    private static readonly string[] MirrorExclude = { };

    // Trigger ids (stable — renaming breaks users' bound actions)
    private const string TrigAnyEvent = "ed.journal.event";
    private const string TrigEventPrefix = "ed.evt.";
    private const string TrigAnyFlag = "ed.flag.changed";
    private const string TrigFlagPrefix = "ed.flag.";
    private const string TrigCompanion = "ed.companion.updated";
    private const string TrigStatus = "ed.watcher.status";

    private static readonly Guid SavedGamesGuid =
        new Guid("4C5C32FF-BB9D-43B0-B5B4-2D72E54EAAA4");

    // ---- lifecycle ---------------------------------------------------------
    private static Thread _worker;
    private static volatile bool _running;
    private static AutoResetEvent _wake;
    private readonly object _lifecycle = new object();

    public void Init()
    {
        RegisterStaticTriggers();
        LoadRegistries();
        ReRegisterDynamicTriggers();

        bool? auto = null;
        try { auto = CPH.GetGlobalVar<bool?>(Prefix + "ConfigAutoStart", true); }
        catch { }
        if (auto ?? true) StartWatcher();
        else CPH.LogInfo("[ED] Watcher loaded; auto-start is disabled (edConfigAutoStart=false).");
    }

    public bool Execute()
    {
        return StartWatcher();
    }

    public void Dispose()
    {
        StopWatcher();
    }

    public bool StartWatcher()
    {
        lock (_lifecycle)
        {
            if (_running)
            {
                CPH.LogInfo("[ED] Journal watcher is already running.");
                return true;
            }
            _running = true;
            _wake = new AutoResetEvent(false);
            _worker = new Thread(Loop);
            _worker.IsBackground = true;
            _worker.Name = "EDJournalWatcher";
            _worker.Start();
        }
        CPH.LogInfo("[ED] Journal watcher started.");
        return true;
    }

    public bool StopWatcher()
    {
        Thread worker;
        lock (_lifecycle)
        {
            if (!_running) return true;
            _running = false;
            worker = _worker;
            if (_wake != null) { try { _wake.Set(); } catch { } }
        }
        if (worker != null && worker.IsAlive) worker.Join(3000);
        lock (_lifecycle)
        {
            if (_wake != null) { try { _wake.Dispose(); } catch { } _wake = null; }
            _worker = null;
        }
        FireStatus("stopped", "Watcher stopped.");
        CPH.LogInfo("[ED] Journal watcher stopped.");
        return true;
    }

    /// Forget everything: unset every variable this watcher ever created,
    /// clear the checkpoint, and start fresh (rehydrates without triggers).
    public bool ResetState()
    {
        StopWatcher();
        var names = new List<string>(_allNames.Keys);
        foreach (string name in names) UnsetVar(name);
        _allNames.Clear();
        _eventTypes.Clear();
        _typeFields.Clear();
        _pending.Clear();
        _pushed.Clear();
        UnsetVar(Prefix + "RuntimeVarNamesJson");
        UnsetVar(Prefix + "RuntimeEventTypesJson");
        UnsetVar(Prefix + "RuntimeFlagTriggersJson");
        UnsetVar(Prefix + "RuntimeJournalDir");
        UnsetVar(Prefix + "RuntimeJournalFile");
        UnsetVar(Prefix + "RuntimeJournalPos");
        _file = null;
        _offset = 0;
        CPH.LogInfo("[ED] State reset; the current journal will rehydrate without firing triggers.");
        return StartWatcher();
    }

    /// Log a quick summary of the most useful variables.
    public bool TestVariables()
    {
        var sb = new StringBuilder();
        sb.AppendLine("[ED] Watcher variables:");
        string[] keys =
        {
            Prefix + "Cmdr", Prefix + "Ship", Prefix + "System", Prefix + "Station",
            Prefix + "Docked", Prefix + "Supercruise", Prefix + "LandingGearDown",
            Prefix + "Jumps", Prefix + "CreditsEarned", Prefix + "FuelLevel",
            Prefix + "NavTargetSystem", Prefix + "LastEvent",
        };
        lock (_stateLock)
        {
            foreach (string k in keys)
            {
                object v;
                sb.Append("  ").Append(k).Append(" = ")
                  .AppendLine(_pending.TryGetValue(k, out v) && v != null ? Convert.ToString(v) : "<unset>");
            }
            sb.Append("  running=").Append(_running)
              .Append(", variables=").Append(_pending.Count)
              .Append(", eventTypes=").Append(_eventTypes.Count);
        }
        CPH.LogInfo(sb.ToString());
        return true;
    }

    // ---- state -------------------------------------------------------------
    private readonly object _stateLock = new object();
    private string _dir;
    private string _file;
    private long _offset;
    private bool _hydrating;          // true while replaying pre-existing lines (no triggers)
    private bool _statusBaseline;     // first Status.json read sets the baseline silently
    private bool _companionBaseline;  // first companion scan is silent
    private bool _dirWarned;

    // curated aggregates
    private string _cmdr = "", _ship = "", _shipName = "", _system = "", _station = "", _lastEvent = "";
    private bool _docked;
    private long _jumps, _credits, _bounties, _bountyEarnings, _missions, _deaths,
                 _interdictions, _scans, _firstDiscoveries;
    private double _distanceLy;

    // publishing (Dictionary<string,bool> stands in for a string set — the
    // default Streamer.bot compile has no HashSet reference)
    private readonly Dictionary<string, object> _pending = new Dictionary<string, object>(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _pushed = new Dictionary<string, string>(StringComparer.Ordinal);
    private readonly Dictionary<string, bool> _allNames = new Dictionary<string, bool>(StringComparer.Ordinal);
    private bool _namesDirty;
    private bool _capWarned;

    // mirrors & triggers
    private readonly Dictionary<string, long> _eventCounts = new Dictionary<string, long>(StringComparer.Ordinal);
    private readonly Dictionary<string, Dictionary<string, bool>> _typeFields = new Dictionary<string, Dictionary<string, bool>>(StringComparer.Ordinal);
    private readonly Dictionary<string, bool> _eventTypes = new Dictionary<string, bool>(StringComparer.Ordinal);
    private long _lastFlags = -1, _lastFlags2 = -1;

    // companion files
    private readonly Dictionary<string, long[]> _companionSigs = new Dictionary<string, long[]>(StringComparer.OrdinalIgnoreCase);

    // ---- trigger registration ------------------------------------------------
    private void RegisterStaticTriggers()
    {
        try
        {
            CPH.RegisterCustomTrigger("Any Journal Event", TrigAnyEvent, new[] { "Elite Dangerous" });
            CPH.RegisterCustomTrigger("Any Ship Flag Changed", TrigAnyFlag, new[] { "Elite Dangerous", "Ship State" });
            CPH.RegisterCustomTrigger("Companion File Updated", TrigCompanion, new[] { "Elite Dangerous" });
            CPH.RegisterCustomTrigger("Watcher Status", TrigStatus, new[] { "Elite Dangerous" });
        }
        catch (Exception ex)
        {
            CPH.LogWarn("[ED] Trigger registration failed: " + ex.Message);
        }

        // Every ship-state edge is registered up front so all of them are
        // bindable in the trigger menu immediately — you should not have to
        // toggle your landing gear once before "LandingGearDown Off" exists.
        for (int i = 0; i < FlagNames.Length; i++) RegisterFlagEdges(FlagNames[i]);
        for (int i = 0; i < Flags2Names.Length; i++) RegisterFlagEdges(Flags2Names[i]);
    }

    private void RegisterFlagEdges(string flag)
    {
        SafeRegister(flag + " On", TrigFlagPrefix + flag + ".on", new[] { "Elite Dangerous", "Ship State" });
        SafeRegister(flag + " Off", TrigFlagPrefix + flag + ".off", new[] { "Elite Dangerous", "Ship State" });
    }

    private void ReRegisterDynamicTriggers()
    {
        foreach (string type in _eventTypes.Keys)
            SafeRegister(type, TrigEventPrefix + type, new[] { "Elite Dangerous", "Journal Events" });
    }

    private void SafeRegister(string name, string id, string[] category)
    {
        try { CPH.RegisterCustomTrigger(name, id, category); }
        catch (Exception ex) { CPH.LogDebug("[ED] RegisterCustomTrigger " + id + ": " + ex.Message); }
    }

    private void SafeFire(string id, Dictionary<string, object> args)
    {
        try { CPH.TriggerCodeEvent(id, args); }
        catch (Exception ex) { CPH.LogDebug("[ED] TriggerCodeEvent " + id + ": " + ex.Message); }
    }

    private void FireStatus(string status, string message)
    {
        var args = new Dictionary<string, object>(StringComparer.Ordinal);
        args[Prefix + "Status"] = status;
        args[Prefix + "Message"] = message;
        args[Prefix + "JournalFile"] = _file == null ? "" : Path.GetFileName(_file);
        SafeFire(TrigStatus, args);
    }

    // ---- main loop ------------------------------------------------------------
    private void Loop()
    {
        _dir = ResolveJournalDir();
        LoadCheckpoint();
        FireStatus("started", "Watcher started: " + _dir);

        while (_running)
        {
            try
            {
                if (!Directory.Exists(_dir))
                {
                    if (!_dirWarned)
                    {
                        _dirWarned = true;
                        CPH.LogWarn("[ED] Journal folder not found yet: " + _dir);
                        FireStatus("error", "Journal folder not found: " + _dir);
                    }
                }
                else
                {
                    _dirWarned = false;
                    lock (_stateLock)
                    {
                        ProcessJournal();
                        ReadStatusFile();
                        ScanCompanions();
                        BuildAggregates();
                        SaveCheckpoint();
                    }
                    Publish();
                }
            }
            catch (Exception ex)
            {
                CPH.LogWarn("[ED] Watcher recovered from: " + ex.Message);
            }

            AutoResetEvent wake = _wake;
            if (wake == null) break;
            try { wake.WaitOne(ScanMs); }
            catch (ObjectDisposedException) { break; }
        }
    }

    // ---- journal directory / checkpoint ----------------------------------------
    private string ResolveJournalDir()
    {
        string configured = null;
        try { configured = CPH.GetGlobalVar<string>(Prefix + "ConfigJournalDir", true); }
        catch { }
        if (!string.IsNullOrEmpty(configured) && configured.Trim().Length > 0)
            return Path.GetFullPath(Environment.ExpandEnvironmentVariables(configured.Trim()));

        string savedGames = TryGetSavedGames();
        if (string.IsNullOrEmpty(savedGames))
            savedGames = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Saved Games");
        return Path.Combine(savedGames, "Frontier Developments", "Elite Dangerous");
    }

    private static string TryGetSavedGames()
    {
        IntPtr p = IntPtr.Zero;
        try
        {
            if (SHGetKnownFolderPath(SavedGamesGuid, 0, IntPtr.Zero, out p) == 0 && p != IntPtr.Zero)
                return Marshal.PtrToStringUni(p);
        }
        catch { }
        finally
        {
            if (p != IntPtr.Zero) Marshal.FreeCoTaskMem(p);
        }
        return null;
    }

    private void LoadCheckpoint()
    {
        string dir = null, file = null, pos = null;
        try
        {
            dir = CPH.GetGlobalVar<string>(Prefix + "RuntimeJournalDir", true);
            file = CPH.GetGlobalVar<string>(Prefix + "RuntimeJournalFile", true);
            pos = CPH.GetGlobalVar<string>(Prefix + "RuntimeJournalPos", true);
        }
        catch { }

        long offset;
        if (!string.IsNullOrEmpty(file)
            && string.Equals(dir, _dir, StringComparison.OrdinalIgnoreCase)
            && File.Exists(file)
            && long.TryParse(pos, out offset))
        {
            // Resume exactly where we stopped — these lines are new, so triggers fire.
            _file = file;
            _offset = Math.Max(0, offset);
            _hydrating = false;
            CPH.LogInfo("[ED] Resuming " + Path.GetFileName(file) + " @ " + _offset);
        }
        else
        {
            // First run (or the folder changed): rebuild state from the newest
            // journal without firing a trigger for every historical line.
            _file = FindNewestJournal();
            _offset = 0;
            _hydrating = _file != null;
            if (_file != null)
                CPH.LogInfo("[ED] Hydrating state from " + Path.GetFileName(_file) + " (triggers suppressed).");
        }
    }

    private void SaveCheckpoint()
    {
        if (_file == null) return;
        Set(Prefix + "RuntimeJournalDir", _dir);
        Set(Prefix + "RuntimeJournalFile", _file);
        Set(Prefix + "RuntimeJournalPos", _offset.ToString(System.Globalization.CultureInfo.InvariantCulture));
    }

    /// Newest = latest write time, ties broken by name (no LINQ on purpose).
    private string FindNewestJournal()
    {
        try
        {
            if (!Directory.Exists(_dir)) return null;
            string[] files = Directory.GetFiles(_dir, "Journal.*.log");
            string best = null;
            DateTime bestTime = DateTime.MinValue;
            foreach (string f in files)
            {
                DateTime t;
                try { t = File.GetLastWriteTimeUtc(f); }
                catch (IOException) { continue; }
                if (best == null
                    || t > bestTime
                    || (t == bestTime && string.Compare(f, best, StringComparison.OrdinalIgnoreCase) > 0))
                {
                    best = f;
                    bestTime = t;
                }
            }
            return best;
        }
        catch (IOException) { return null; }
        catch (UnauthorizedAccessException) { return null; }
    }

    // ---- journal processing -----------------------------------------------------
    private void ProcessJournal()
    {
        if (_file == null)
        {
            _file = FindNewestJournal();
            _offset = 0;
            if (_file == null) return;
            _hydrating = false; // created after we started watching -> live
            CPH.LogInfo("[ED] Tailing " + Path.GetFileName(_file));
            FireStatus("journal_changed", Path.GetFileName(_file));
        }

        // Drain the current file completely first so a rollover never drops
        // the final lines of the old journal.
        ReadNewLines();
        bool wasHydrating = _hydrating;
        _hydrating = false; // anything after the first full pass is live

        string newest = FindNewestJournal();
        if (newest != null && !string.Equals(newest, _file, StringComparison.OrdinalIgnoreCase))
        {
            _file = newest;
            _offset = 0;
            CPH.LogInfo("[ED] Switching to " + Path.GetFileName(newest));
            FireStatus("journal_changed", Path.GetFileName(newest));
            ReadNewLines(); // a new journal while watching is live from line one
        }

        if (wasHydrating)
            FireStatus("hydrated", "State rebuilt from " + (_file == null ? "?" : Path.GetFileName(_file)));
    }

    /// Reads bytes appended since the last pass; only complete lines are
    /// consumed. FileShare.ReadWrite is required — the game keeps the file open.
    private void ReadNewLines()
    {
        if (_file == null || !File.Exists(_file)) return;
        var fi = new FileInfo(_file);
        if (fi.Length < _offset)
        {
            CPH.LogWarn("[ED] Journal shrank; rereading " + Path.GetFileName(_file));
            _offset = 0;
        }
        if (fi.Length == _offset) return;

        byte[] buf;
        using (var fs = new FileStream(_file, FileMode.Open, FileAccess.Read,
                                       FileShare.ReadWrite | FileShare.Delete))
        {
            fs.Seek(_offset, SeekOrigin.Begin);
            buf = new byte[fs.Length - _offset];
            int read = fs.Read(buf, 0, buf.Length);
            if (read <= 0) return;
            if (read < buf.Length)
            {
                byte[] trimmed = new byte[read];
                Array.Copy(buf, trimmed, read);
                buf = trimmed;
            }
        }

        int lastNl = -1;
        for (int i = buf.Length - 1; i >= 0; i--)
        {
            if (buf[i] == (byte)'\n') { lastNl = i; break; }
        }
        if (lastNl < 0) return; // no complete line yet
        _offset += lastNl + 1;

        string[] lines = Encoding.UTF8.GetString(buf, 0, lastNl + 1).Split('\n');
        var parsed = new List<JObject>();
        foreach (string raw in lines)
        {
            string line = raw.Trim();
            if (line.Length == 0) continue;
            try
            {
                var settings = new JsonSerializerSettings();
                settings.DateParseHandling = DateParseHandling.None;
                JObject o = JsonConvert.DeserializeObject<JObject>(line, settings);
                if (o != null) parsed.Add(o);
            }
            catch
            {
                CPH.LogDebug("[ED] Skipping malformed journal line.");
            }
        }

        // A big backlog (Streamer.bot was closed while you played) still updates
        // every variable, but firing hundreds of triggers at once helps no one.
        bool fireTriggers = !_hydrating && parsed.Count <= MaxLiveBacklog;
        if (!_hydrating && parsed.Count > MaxLiveBacklog)
            CPH.LogInfo("[ED] " + parsed.Count + " backlogged lines: variables updated, triggers suppressed.");

        foreach (JObject e in parsed) ApplyEvent(e, fireTriggers);
    }

    // ---- one journal event --------------------------------------------------------
    private void ApplyEvent(JObject e, bool fireTriggers)
    {
        string evt = (string)e["event"];
        if (string.IsNullOrEmpty(evt)) return;
        _lastEvent = evt;

        MirrorEvent(evt, e);
        Aggregate(evt, e);

        // Register the per-type trigger as soon as the type is known — even
        // during hydration — so it is bindable in the UI before it next fires.
        string safe = Sanitize(evt);
        if (!_eventTypes.ContainsKey(safe))
        {
            _eventTypes[safe] = true;
            SafeRegister(evt, TrigEventPrefix + safe, new[] { "Elite Dangerous", "Journal Events" });
            PersistRegistry(Prefix + "RuntimeEventTypesJson", _eventTypes);
        }

        if (!fireTriggers) return;

        var args = new Dictionary<string, object>(StringComparer.Ordinal);
        args[Prefix + "EventName"] = evt;
        args[Prefix + "EventTimestamp"] = Str(e, "timestamp", "");
        string json = e.ToString(Formatting.None);
        args[Prefix + "EventJson"] = json.Length <= MaxJsonArg ? json : json.Substring(0, MaxJsonArg);
        foreach (var prop in e.Properties())
        {
            if (prop.Name == "event" || prop.Name == "timestamp") continue;
            FlattenInto(args, Prefix + "Event_" + Sanitize(prop.Name), prop.Value, 0);
        }

        SafeFire(TrigAnyEvent, args);
        SafeFire(TrigEventPrefix + safe, args);
    }

    /// Complete-coverage variable mirror for any event type, with hygiene:
    /// fields the newest occurrence no longer has are unset.
    private void MirrorEvent(string evt, JObject e)
    {
        string safe = Sanitize(evt);
        string baseKey = Prefix + "Evt" + safe;

        long count;
        _eventCounts.TryGetValue(safe, out count);
        count++;
        _eventCounts[safe] = count;
        Set(baseKey + "Count", count);
        Set(baseKey + "Last", Str(e, "timestamp", ""));

        if (Array.IndexOf(MirrorExclude, evt) >= 0) return;

        var fields = new Dictionary<string, object>(StringComparer.Ordinal);
        foreach (var prop in e.Properties())
        {
            if (prop.Name == "event" || prop.Name == "timestamp") continue;
            FlattenInto(fields, baseKey + "_" + Sanitize(prop.Name), prop.Value, 0);
        }

        Dictionary<string, bool> previous;
        if (_typeFields.TryGetValue(safe, out previous))
        {
            foreach (string old in previous.Keys)
                if (!fields.ContainsKey(old)) UnsetVar(old);
        }
        var current = new Dictionary<string, bool>(StringComparer.Ordinal);
        foreach (var kv in fields)
        {
            Set(kv.Key, kv.Value);
            current[kv.Key] = true;
        }
        _typeFields[safe] = current;
    }

    /// Flatten any JSON value into a sink. Objects flatten with underscores
    /// (depth 2); deeper structures become JSON strings; arrays publish a
    /// Count and, when small enough, their JSON.
    private void FlattenInto(IDictionary<string, object> sink, string key, JToken v, int depth)
    {
        if (key.Length > 100) return;
        switch (v.Type)
        {
            case JTokenType.Object:
                if (depth >= 2)
                {
                    string json = v.ToString(Formatting.None);
                    if (json.Length <= MaxValueLen) sink[key] = json;
                    return;
                }
                foreach (var p in ((JObject)v).Properties())
                    FlattenInto(sink, key + "_" + Sanitize(p.Name), p.Value, depth + 1);
                break;
            case JTokenType.Array:
                var arr = (JArray)v;
                sink[key + "Count"] = (long)arr.Count;
                string aj = v.ToString(Formatting.None);
                if (aj.Length <= MaxValueLen) sink[key] = aj;
                break;
            case JTokenType.Boolean: sink[key] = (bool)v; break;
            case JTokenType.Integer: sink[key] = (long)v; break;
            case JTokenType.Float: sink[key] = Math.Round((double)v, 4); break;
            case JTokenType.Null:
            case JTokenType.Undefined: break;
            default:
                string s = v.ToString();
                sink[key] = s.Length <= MaxValueLen ? s : s.Substring(0, MaxValueLen);
                break;
        }
    }

    /// Curated session aggregates + navigation state.
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
                if (e["RemainingJumpsInRoute"] != null)
                    Set(Prefix + "NavRemainingJumps", (long?)e["RemainingJumpsInRoute"] ?? 0);
                break;
            case "FSDTarget":
                Set(Prefix + "NavTargetSystem", Str(e, "Name", ""));
                if (e["RemainingJumpsInRoute"] != null)
                    Set(Prefix + "NavRemainingJumps", (long?)e["RemainingJumpsInRoute"] ?? 0);
                break;
            case "NavRouteClear":
                Set(Prefix + "NavTargetSystem", "");
                Set(Prefix + "NavRemainingJumps", 0L);
                Set(Prefix + "NavDestination", "");
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

    // ---- Status.json — complete live state, with per-flag edge triggers ----------
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

    private void ReadStatusFile()
    {
        string f = Path.Combine(_dir, "Status.json");
        JObject o = ReadJsonFile(f);
        if (o == null) return;

        long? flags = (long?)o["Flags"];
        if (flags.HasValue)
        {
            PublishFlagSet(FlagNames, flags.Value, _lastFlags);
            _lastFlags = flags.Value;
        }
        long? flags2 = (long?)o["Flags2"];
        if (flags2.HasValue)
        {
            PublishFlagSet(Flags2Names, flags2.Value, _lastFlags2);
            _lastFlags2 = flags2.Value;
        }
        _statusBaseline = true;

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
                gui.Value >= 0 && gui.Value < GuiFocusNames.Length ? GuiFocusNames[gui.Value] : "Unknown");
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

    /// Publishes every named flag and fires edge triggers on transitions
    /// (never on the very first read — no state existed to compare against).
    private void PublishFlagSet(string[] names, long current, long previous)
    {
        for (int i = 0; i < names.Length; i++)
        {
            bool now = (current & (1L << i)) != 0;
            Set(Prefix + names[i], now);

            if (!_statusBaseline || previous < 0) continue;
            bool was = (previous & (1L << i)) != 0;
            if (was == now) continue;

            string flag = names[i];
            string edge = now ? "on" : "off";
            var args = new Dictionary<string, object>(StringComparer.Ordinal);
            args[Prefix + "Flag"] = flag;
            args[Prefix + "Value"] = now;
            args[Prefix + "System"] = _system;
            SafeFire(TrigAnyFlag, args);
            SafeFire(TrigFlagPrefix + flag + "." + edge, args);
        }
    }

    // ---- companion files (Cargo.json, NavRoute.json, Market.json, ...) -----------
    private void ScanCompanions()
    {
        string[] files;
        try { files = Directory.GetFiles(_dir, "*.json"); }
        catch (IOException) { return; }

        foreach (string path in files)
        {
            string name = Path.GetFileNameWithoutExtension(path);
            if (string.Equals(name, "Status", StringComparison.OrdinalIgnoreCase))
                continue; // handled in depth above

            long[] sig;
            try
            {
                var fi = new FileInfo(path);
                sig = new[] { fi.Length, fi.LastWriteTimeUtc.Ticks };
            }
            catch (IOException) { continue; }

            long[] prev;
            if (_companionSigs.TryGetValue(path, out prev) && prev[0] == sig[0] && prev[1] == sig[1])
                continue;

            JObject o = ReadJsonFile(path);
            if (o == null) continue; // mid-write; signature stays unrecorded so we retry
            _companionSigs[path] = sig;

            string safe = Sanitize(name);
            var fields = new Dictionary<string, object>(StringComparer.Ordinal);
            foreach (var prop in o.Properties())
            {
                if (prop.Name == "event" || prop.Name == "timestamp") continue;
                FlattenInto(fields, Prefix + "File" + safe + "_" + Sanitize(prop.Name), prop.Value, 1);
            }
            foreach (var kv in fields) Set(kv.Key, kv.Value);

            if (string.Equals(name, "NavRoute", StringComparison.OrdinalIgnoreCase))
            {
                var route = o["Route"] as JArray;
                if (route != null)
                {
                    Set(Prefix + "NavRemainingJumps", (long)Math.Max(0, route.Count - 1));
                    var last = route.Count > 0 ? route[route.Count - 1] as JObject : null;
                    if (last != null)
                    {
                        string destination = Str(last, "StarSystem", "");
                        Set(Prefix + "NavDestination", destination);
                        Set(Prefix + "NavTargetSystem", destination);
                    }
                }
            }
            else if (string.Equals(name, "Cargo", StringComparison.OrdinalIgnoreCase))
            {
                SetIfNum(o, "Count", Prefix + "CargoUsed");
            }

            if (_companionBaseline)
            {
                var args = new Dictionary<string, object>(StringComparer.Ordinal);
                args[Prefix + "CompanionName"] = name;
                args[Prefix + "CompanionFile"] = Path.GetFileName(path);
                string json = o.ToString(Formatting.None);
                args[Prefix + "CompanionJson"] = json.Length <= MaxJsonArg ? json : json.Substring(0, MaxJsonArg);
                SafeFire(TrigCompanion, args);
            }
        }
        _companionBaseline = true;
    }

    private static JObject ReadJsonFile(string path)
    {
        try
        {
            if (!File.Exists(path)) return null;
            string raw;
            using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read,
                                           FileShare.ReadWrite | FileShare.Delete))
            using (var sr = new StreamReader(fs, Encoding.UTF8, true))
                raw = sr.ReadToEnd();
            if (string.IsNullOrEmpty(raw) || raw.Trim().Length == 0) return null;
            var settings = new JsonSerializerSettings();
            settings.DateParseHandling = DateParseHandling.None;
            return JsonConvert.DeserializeObject<JObject>(raw, settings);
        }
        catch
        {
            return null; // mid-write or locked; the next scan retries
        }
    }

    // ---- publishing (change-only) --------------------------------------------------
    private void Publish()
    {
        List<KeyValuePair<string, object>> snapshot;
        bool namesDirty;
        lock (_stateLock)
        {
            snapshot = new List<KeyValuePair<string, object>>(_pending.Count);
            foreach (var kv in _pending) snapshot.Add(kv);
            namesDirty = _namesDirty;
            _namesDirty = false;
        }

        foreach (var kv in snapshot)
        {
            string s = Convert.ToString(kv.Value);
            string prev;
            if (_pushed.TryGetValue(kv.Key, out prev) && prev == s) continue;
            try { CPH.SetGlobalVar(kv.Key, kv.Value, true); }
            catch (Exception ex) { CPH.LogDebug("[ED] SetGlobalVar " + kv.Key + ": " + ex.Message); return; }
            _pushed[kv.Key] = s;
        }

        if (namesDirty)
        {
            lock (_stateLock)
            {
                PersistRegistry(Prefix + "RuntimeVarNamesJson", _allNames);
            }
        }
    }

    // ---- registries (survive restarts) -----------------------------------------------
    private void LoadRegistries()
    {
        LoadRegistry(Prefix + "RuntimeEventTypesJson", _eventTypes);
        LoadRegistry(Prefix + "RuntimeVarNamesJson", _allNames);
    }

    private void LoadRegistry(string variable, Dictionary<string, bool> target)
    {
        string json = null;
        try { json = CPH.GetGlobalVar<string>(variable, true); }
        catch { }
        if (string.IsNullOrEmpty(json)) return;
        try
        {
            var values = JsonConvert.DeserializeObject<List<string>>(json);
            if (values == null) return;
            foreach (string v in values)
                if (!string.IsNullOrEmpty(v)) target[v] = true;
        }
        catch (JsonException) { }
    }

    private void PersistRegistry(string variable, Dictionary<string, bool> values)
    {
        var list = new List<string>(values.Keys);
        list.Sort(StringComparer.Ordinal);
        string json = JsonConvert.SerializeObject(list);
        try { CPH.SetGlobalVar(variable, json, true); }
        catch (Exception ex) { CPH.LogDebug("[ED] registry save " + variable + ": " + ex.Message); }
    }

    // ---- variable helpers ---------------------------------------------------------------
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
        if (!_allNames.ContainsKey(key))
        {
            _allNames[key] = true;
            _namesDirty = true;
        }
    }

    private void UnsetVar(string key)
    {
        _pending.Remove(key);
        _pushed.Remove(key);
        try { CPH.UnsetGlobalVar(key, true); }
        catch (Exception ex) { CPH.LogDebug("[ED] UnsetGlobalVar " + key + ": " + ex.Message); }
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
        if (string.IsNullOrEmpty(name)) return "Field";
        var sb = new StringBuilder(name.Length);
        foreach (char c in name)
            if (char.IsLetterOrDigit(c) || c == '_') sb.Append(c);
        return sb.Length == 0 ? "Field" : sb.ToString();
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

    [DllImport("shell32.dll")]
    private static extern int SHGetKnownFolderPath(
        [MarshalAs(UnmanagedType.LPStruct)] Guid rfid,
        uint flags,
        IntPtr token,
        out IntPtr path);
}
