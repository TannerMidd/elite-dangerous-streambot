import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { JournalWatcher } from './journal/watcher.js';
import { SessionState } from './state/session.js';
import { RuleEngine } from './rules/engine.js';
import { StreamerbotClient } from './dispatch/streamerbot.js';
import { startServer } from './server/index.js';
import type { DispatchRecord, LoadedRule, PipelineEvent } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Project root: dist/index.js and src/index.ts are both one level below root.
const ROOT = path.resolve(__dirname, '..');

const DISPATCH_LOG_LIMIT = 200;

async function main(): Promise<void> {
  console.log('SimStarr Elite Data — Elite Dangerous → Streamer.bot bridge');

  const config = loadConfig(ROOT);
  const watcher = new JournalWatcher(config.journalDir!);
  const session = new SessionState();
  const engine = new RuleEngine(config.rulesDir);
  const streamerbot = new StreamerbotClient(config.streamerbot);
  const dispatchLog: DispatchRecord[] = [];

  const fireRule = (rule: LoadedRule, args: Record<string, string>): DispatchRecord => {
    const { status, id } = streamerbot.doAction(rule.action, args);
    const record: DispatchRecord = {
      timestamp: new Date().toISOString(),
      rule: rule.name,
      action: rule.action,
      args,
      status,
      id,
    };
    dispatchLog.push(record);
    if (dispatchLog.length > DISPATCH_LOG_LIMIT) dispatchLog.shift();
    console.log(
      `[dispatch] ${rule.name} -> "${rule.action}" (${status})`,
      Object.keys(args).length ? args : '',
    );
    return record;
  };

  const server = startServer({ root: ROOT, config, watcher, session, engine, streamerbot, dispatchLog, fireRule });
  const broadcastDispatch = (server as ReturnType<typeof startServer> & {
    broadcastDispatch?: (r: DispatchRecord) => void;
  }).broadcastDispatch;

  watcher.on('event', (pe: PipelineEvent) => {
    // Order matters: state first, so rules see up-to-date session stats
    // (e.g. a jump-milestone rule sees the jump it was triggered by).
    session.handle(pe);
    const matches = engine.evaluate(pe, watcher.status, session.getStats());
    for (const match of matches) {
      const record = fireRule(match.rule, match.args);
      broadcastDispatch?.(record);
    }
  });

  watcher.on('status', (status) => session.updateStatus(status));
  watcher.on('reset', () => session.reset());

  // Surface Streamer.bot rejections (usually a missing action name) on the
  // matching dispatch record so the dashboard shows why nothing played.
  streamerbot.on('requestError', ({ id, error }: { id: string; error: string }) => {
    const record = dispatchLog.find((r) => r.id === id);
    if (record) {
      record.status = 'error';
      record.error = error;
      broadcastDispatch?.(record);
    }
  });

  engine.start();
  streamerbot.start();
  await watcher.start();

  const shutdown = async () => {
    console.log('\nShutting down…');
    streamerbot.stop();
    await engine.stop();
    await watcher.stop();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
