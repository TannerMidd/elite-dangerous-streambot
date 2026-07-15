import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import YAML from 'yaml';
import { WebSocketServer, WebSocket } from 'ws';
import type { JournalWatcher } from '../journal/watcher.js';
import type { SessionState } from '../state/session.js';
import type { RuleEngine } from '../rules/engine.js';
import type { StreamerbotClient } from '../dispatch/streamerbot.js';
import { DEFAULT_TITLE, defaultJournalDir, readRawConfig, writeRawConfig, type AppConfig } from '../config.js';
import type { DispatchRecord, LoadedRule } from '../types.js';
import { makeSampleEvent, sampleEventNames, sampleForTrigger } from '../simulator/events.js';
import { compileSafe, ExprError } from '../rules/safe-eval.js';
import type { JournalEvent } from '../types.js';

export interface ServerDeps {
  /** Project root (where config.json lives). */
  root: string;
  config: AppConfig;
  watcher: JournalWatcher;
  session: SessionState;
  engine: RuleEngine;
  streamerbot: StreamerbotClient;
  /** Recent dispatches, newest last. */
  dispatchLog: DispatchRecord[];
  /** Test-fire path used by the API; shares dispatch logic with the live pipeline. */
  fireRule: (rule: LoadedRule, args: Record<string, string>) => DispatchRecord;
}

function ruleView(rule: LoadedRule) {
  return {
    name: rule.name,
    file: rule.file,
    enabled: rule.enabled !== false,
    trigger: rule.trigger,
    when: rule.when ?? null,
    cooldown: rule.cooldown ?? 0,
    action: rule.action,
    args: rule.args ?? {},
    unsafe: rule.unsafe === true,
    lastFired: rule.lastFired,
    fireCount: rule.fireCount,
    seenCount: rule.seenCount,
    error: rule.error,
  };
}

export interface RunningServer {
  server: http.Server;
  /** Push a dispatch record (new or updated) to all connected dashboards. */
  broadcastDispatch: (record: DispatchRecord) => void;
}

export function startServer(deps: ServerDeps): RunningServer {
  const { config, watcher, session, engine, streamerbot } = deps;
  const app = express();

  // DNS-rebinding guard: when bound to loopback, a malicious website could
  // still reach this API through a rebound hostname. Only serve requests
  // whose Host header is actually local.
  const loopbackBound = ['127.0.0.1', 'localhost', '::1'].includes(config.uiHost);
  const hostAllowed = (host: string | undefined): boolean => {
    if (!loopbackBound) return true; // user opted into network exposure
    const hostname = (host ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
    return ['localhost', '127.0.0.1', '::1'].includes(hostname);
  };
  app.use((req, res, next) => {
    if (!hostAllowed(req.headers.host)) {
      return res.status(403).json({ error: 'Forbidden: bad Host header' });
    }
    next();
  });

  app.use(express.json());
  app.use(express.static(path.join(deps.root, 'public')));

  const statusPayload = () => ({
    appTitle: config.appTitle,
    journalDir: watcher.journalDir,
    journalAvailable: watcher.available,
    activeFile: watcher.activeFile ? path.basename(watcher.activeFile) : null,
    streamerbot: {
      url: streamerbot.url,
      connected: streamerbot.connected,
      version: streamerbot.sbVersion,
      queued: streamerbot.queuedCount,
      lastError: streamerbot.lastError,
    },
    session: session.getStats(),
  });

  app.get('/api/status', (_req, res) => res.json(statusPayload()));

  // ---- settings ---------------------------------------------------------
  app.get('/api/config', (_req, res) => {
    const raw = readRawConfig(deps.root);
    res.json({
      appTitle: config.appTitle,
      journalDir: raw.journalDir ?? null, // null = auto-detect
      journalDirResolved: watcher.journalDir,
      journalDirDefault: defaultJournalDir(),
      uiPort: config.uiPort,
      streamerbot: config.streamerbot,
    });
  });

  app.post('/api/config', async (req, res) => {
    const b = req.body ?? {};
    const raw = readRawConfig(deps.root);

    let titleChanged = false;
    if ('appTitle' in b) {
      const title = String(b.appTitle ?? '').trim().slice(0, 60);
      titleChanged = title !== config.appTitle;
      config.appTitle = title || DEFAULT_TITLE;
      if (title && title !== DEFAULT_TITLE) raw.appTitle = title;
      else delete raw.appTitle; // empty or default = fall back to the default
    }

    let sbChanged = false;
    if (b.streamerbot && typeof b.streamerbot === 'object') {
      const host = String(b.streamerbot.host ?? config.streamerbot.host).trim() || '127.0.0.1';
      const port = Number(b.streamerbot.port ?? config.streamerbot.port);
      const endpoint = String(b.streamerbot.endpoint ?? config.streamerbot.endpoint).trim() || '/';
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return res.status(400).json({ error: 'Streamer.bot port must be 1–65535' });
      }
      const next = { host, port, endpoint };
      sbChanged =
        next.host !== config.streamerbot.host ||
        next.port !== config.streamerbot.port ||
        next.endpoint !== config.streamerbot.endpoint;
      raw.streamerbot = next;
      config.streamerbot = next;
    }

    let journalChanged = false;
    let newJournalDir: string | null = null;
    if ('journalDir' in b) {
      const entered = String(b.journalDir ?? '').trim();
      newJournalDir = entered || null;
      const resolved = newJournalDir ?? defaultJournalDir();
      if (newJournalDir && !fs.existsSync(newJournalDir)) {
        return res.status(400).json({ error: `Folder not found: ${newJournalDir}` });
      }
      raw.journalDir = newJournalDir;
      journalChanged = path.resolve(resolved) !== path.resolve(watcher.journalDir);
      if (journalChanged) config.journalDir = resolved;
    }

    writeRawConfig(deps.root, raw);
    if (sbChanged) streamerbot.updateOptions(config.streamerbot);
    if (journalChanged) await watcher.setDirectory(config.journalDir!);
    res.json({
      ok: true,
      appTitle: config.appTitle,
      applied: { streamerbot: sbChanged, journal: journalChanged, title: titleChanged },
    });
  });

  app.get('/api/rules', (_req, res) => res.json(engine.list().map(ruleView)));

  // ---- rule builder support -------------------------------------------

  // Catalog of event shapes: simulator samples seeded first, then overlaid
  // with real events from the user's own journal as they arrive (replay
  // included), so the builder's field dropdowns reflect actual gameplay data.
  const catalog = new Map<string, JournalEvent>();
  for (const name of sampleEventNames()) {
    const sample = makeSampleEvent(name);
    // first-wins: variant samples (e.g. ThargoidInterdiction, whose event is
    // also "Interdicted") must not shadow the richer base sample's fields
    if (sample && !catalog.has(sample.event)) catalog.set(sample.event, sample);
  }
  watcher.on('event', (pe) => {
    if (catalog.size < 500) catalog.set(pe.event.event, pe.event);
    else if (catalog.has(pe.event.event)) catalog.set(pe.event.event, pe.event);
  });

  app.get('/api/catalog', (_req, res) => {
    const out: Record<string, JournalEvent> = {};
    for (const [name, ev] of [...catalog.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      out[name] = ev;
    }
    res.json(out);
  });

  const slugify = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'rule';

  /** A rule file is editable through the API only if it holds exactly one rule. */
  const isSingleRuleFile = (file: string): boolean => {
    try {
      const raw = fs.readFileSync(path.join(engine.rulesDir, file), 'utf8');
      const parsed = /\.json$/i.test(file) ? JSON.parse(raw) : YAML.parse(raw);
      return !!parsed && !Array.isArray(parsed) && typeof parsed === 'object';
    } catch {
      return false;
    }
  };

  app.post('/api/rules', (req, res) => {
    const b = req.body ?? {};
    const name = String(b.name ?? '').trim();
    const trigger = Array.isArray(b.trigger) ? b.trigger.map(String) : String(b.trigger ?? '').trim();
    const action = String(b.action ?? '').trim();
    const when = b.when ? String(b.when).trim() : undefined;
    const cooldown = Number(b.cooldown ?? 0) || 0;
    const enabled = b.enabled !== false;
    const unsafe = b.unsafe === true;
    const originalName = b.originalName ? String(b.originalName) : null;
    const args: Record<string, string> = {};
    for (const [k, v] of Object.entries(b.args ?? {})) {
      const key = String(k).trim();
      if (key) args[key] = String(v);
    }

    if (!name) return res.status(400).json({ error: 'Rule name is required' });
    if (!trigger || (Array.isArray(trigger) && trigger.length === 0))
      return res.status(400).json({ error: 'Trigger event is required' });
    if (!action) return res.status(400).json({ error: 'Streamer.bot action name is required' });
    if (cooldown < 0) return res.status(400).json({ error: 'Cooldown cannot be negative' });
    if (when) {
      try {
        compileSafe(when);
      } catch (err) {
        if (!unsafe) {
          const detail = err instanceof ExprError ? err.message : String(err);
          return res.status(400).json({ error: `Condition not supported: ${detail}` });
        }
        try {
          new Function('event', 'status', 'session', `"use strict"; return (${when});`);
        } catch (jsErr) {
          return res.status(400).json({
            error: `Condition is not valid JavaScript: ${jsErr instanceof Error ? jsErr.message : jsErr}`,
          });
        }
      }
    }

    // Creating a rule (or renaming one) must not silently overwrite another.
    if (engine.get(name) && originalName !== name) {
      return res.status(409).json({ error: `A rule named "${name}" already exists` });
    }

    // Pick the file: editing keeps the rule's file; new rules get a slug.
    let file: string | null = null;
    const editing = originalName ? engine.get(originalName) : undefined;
    if (editing) {
      if (!isSingleRuleFile(editing.file)) {
        return res.status(400).json({
          error: `"${editing.file}" contains multiple rules — edit that file directly in a text editor`,
        });
      }
      file = editing.file;
    } else {
      file = `${slugify(name)}.yaml`;
      let n = 2;
      while (fs.existsSync(path.join(engine.rulesDir, file))) {
        file = `${slugify(name)}-${n++}.yaml`;
      }
    }

    const def: Record<string, unknown> = { name, enabled, trigger };
    if (when) def.when = when;
    if (when && unsafe) def.unsafe = true;
    if (cooldown > 0) def.cooldown = cooldown;
    def.action = action;
    if (Object.keys(args).length) def.args = args;

    fs.writeFileSync(path.join(engine.rulesDir, file), YAML.stringify(def), 'utf8');
    if (originalName) engine.clearOverride(originalName);
    engine.clearOverride(name);
    engine.loadAll();
    res.json({ ok: true, file, rule: ruleView(engine.get(name)!) });
  });

  app.delete('/api/rules/:name', (req, res) => {
    const rule = engine.get(req.params.name);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    if (!isSingleRuleFile(rule.file) && !rule.error) {
      return res.status(400).json({
        error: `"${rule.file}" contains multiple rules — delete it manually if that is intended`,
      });
    }
    fs.rmSync(path.join(engine.rulesDir, rule.file));
    engine.clearOverride(rule.name);
    engine.loadAll();
    res.json({ ok: true });
  });

  app.post('/api/rules/reload', (_req, res) => {
    engine.loadAll();
    res.json({ ok: true, count: engine.list().length });
  });

  app.post('/api/rules/:name/toggle', (req, res) => {
    const rule = engine.get(req.params.name);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    engine.setEnabled(rule.name, !(rule.enabled !== false));
    res.json(ruleView(engine.get(rule.name)!));
  });

  app.post('/api/rules/:name/test', (req, res) => {
    const rule = engine.get(req.params.name);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    if (rule.error) return res.status(400).json({ error: `Rule has an error: ${rule.error}` });
    const event = sampleForTrigger(rule.trigger);
    const match = engine.testFire(rule.name, event, watcher.status, session.getStats());
    if (!match) return res.status(400).json({ error: 'Could not test-fire rule' });
    const record = deps.fireRule(match.rule, match.args);
    res.json({ ok: true, event, dispatch: record });
  });

  app.get('/api/simulator', (_req, res) => res.json(sampleEventNames()));

  app.post('/api/simulate', (req, res) => {
    const name = String(req.body?.event ?? '');
    const event = makeSampleEvent(name);
    if (!event) return res.status(400).json({ error: `Unknown sample event "${name}"` });
    watcher.inject(event);
    res.json({ ok: true, event });
  });

  app.get('/api/actions', (_req, res) => res.json(streamerbot.actions));

  app.post('/api/actions/refresh', (_req, res) => {
    streamerbot.requestActions();
    res.json({ ok: true });
  });

  app.get('/api/dispatches', (_req, res) => res.json(deps.dispatchLog));

  const server = http.createServer(app);
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient: (info: { req: http.IncomingMessage }) => hostAllowed(info.req.headers.host),
  });

  const broadcast = (msg: Record<string, unknown>) => {
    const data = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  };

  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'status', data: statusPayload() }));
    socket.send(JSON.stringify({ type: 'rules', data: engine.list().map(ruleView) }));
  });

  // Live pushes to the dashboard.
  watcher.on('event', (pe) => broadcast({ type: 'event', data: pe }));
  watcher.on('status', () => broadcast({ type: 'status', data: statusPayload() }));
  engine.on('reload', () => broadcast({ type: 'rules', data: engine.list().map(ruleView) }));
  streamerbot.on('connected', () => broadcast({ type: 'status', data: statusPayload() }));
  streamerbot.on('disconnected', () => broadcast({ type: 'status', data: statusPayload() }));
  streamerbot.on('actions', (actions) => broadcast({ type: 'actions', data: actions }));

  const broadcastDispatch = (record: DispatchRecord) => {
    broadcast({ type: 'dispatch', data: record });
    broadcast({ type: 'rules', data: engine.list().map(ruleView) });
  };
  // Session stats change on most events; piggyback a periodic status push.
  const statusTicker = setInterval(() => broadcast({ type: 'status', data: statusPayload() }), 5000);
  server.on('close', () => clearInterval(statusTicker));

  server.listen(config.uiPort, config.uiHost, () => {
    console.log(`[ui] Dashboard running at http://localhost:${config.uiPort} (bound to ${config.uiHost})`);
  });

  return { server, broadcastDispatch };
}
