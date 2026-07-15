import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import chokidar, { FSWatcher } from 'chokidar';
import type { JournalEvent, PipelineEvent, ShipStatus } from '../types.js';

const JOURNAL_RE = /^Journal\..*\.log$/i;

/** Status.json Flags bits (see Frontier's Journal manual). */
export const STATUS_FLAGS = {
  Docked: 1 << 0,
  Landed: 1 << 1,
  LandingGearDown: 1 << 2,
  ShieldsUp: 1 << 3,
  Supercruise: 1 << 4,
  HardpointsDeployed: 1 << 6,
  ScoopingFuel: 1 << 11,
  FsdCharging: 1 << 17,
  LowFuel: 1 << 19,
  Overheating: 1 << 20,
  InDanger: 1 << 22,
  BeingInterdicted: 1 << 23,
} as const;

/** Synthetic events emitted on flag transitions: name -> [bit, fireOnRisingEdge]. */
const FLAG_TRANSITIONS: Array<{ name: string; bit: number; rising: boolean }> = [
  { name: 'Status.LowFuel', bit: STATUS_FLAGS.LowFuel, rising: true },
  { name: 'Status.Overheating', bit: STATUS_FLAGS.Overheating, rising: true },
  { name: 'Status.InDanger', bit: STATUS_FLAGS.InDanger, rising: true },
  { name: 'Status.BeingInterdicted', bit: STATUS_FLAGS.BeingInterdicted, rising: true },
  { name: 'Status.ShieldsDown', bit: STATUS_FLAGS.ShieldsUp, rising: false },
  { name: 'Status.ShieldsRestored', bit: STATUS_FLAGS.ShieldsUp, rising: true },
];

/**
 * Tails the newest Elite Dangerous journal file and watches Status.json.
 *
 * Emits:
 *  - 'event'  (PipelineEvent)  — every journal line + synthetic Status.* transitions
 *  - 'status' (ShipStatus)     — every Status.json update
 *  - 'file'   (string)         — when the active journal file changes
 *
 * ED keeps the journal open and appends to it; on Windows that means change
 * notifications are unreliable, so the directory is watched with polling.
 */
export class JournalWatcher extends EventEmitter {
  private dir: string;
  private watcher: FSWatcher | null = null;
  private currentFile: string | null = null;
  private offset = 0;
  private remainder = '';
  private lastFlags: number | null = null;
  private reading = false;
  private pendingRead = false;
  public status: ShipStatus | null = null;

  constructor(dir: string) {
    super();
    this.dir = dir;
  }

  get journalDir(): string {
    return this.dir;
  }

  get activeFile(): string | null {
    return this.currentFile;
  }

  get available(): boolean {
    return fs.existsSync(this.dir);
  }

  async start(): Promise<void> {
    if (!this.available) {
      console.warn(`[journal] Directory not found: ${this.dir} — waiting for it to appear`);
    } else {
      const newest = this.findNewestJournal();
      if (newest) await this.switchTo(newest, { replay: true });
      this.readStatusFile(true);
    }

    this.watcher = chokidar.watch(this.dir, {
      usePolling: true,
      interval: 500,
      ignoreInitial: true,
      depth: 0,
    });
    this.watcher
      .on('add', (file) => this.onFsEvent(file))
      .on('change', (file) => this.onFsEvent(file))
      .on('error', (err) => console.error('[journal] watcher error:', err));
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
    this.watcher = null;
  }

  /** Switch to a different journal directory at runtime (settings UI).
   *  Replays the newest journal found there, exactly like startup. */
  async setDirectory(dir: string): Promise<void> {
    if (path.resolve(dir) === path.resolve(this.dir)) return;
    await this.stop();
    this.dir = dir;
    this.currentFile = null;
    this.offset = 0;
    this.remainder = '';
    this.lastFlags = null;
    this.status = null;
    // Listeners must drop accumulated session state: the replay that start()
    // performs would otherwise double-count everything already tallied.
    this.emit('reset');
    await this.start();
  }

  /** Inject a synthetic event (simulator / test-fire) into the pipeline. */
  inject(event: JournalEvent): void {
    this.emit('event', { event, replay: false, synthetic: true } satisfies PipelineEvent);
  }

  private onFsEvent(file: string): void {
    const base = path.basename(file);
    if (base === 'Status.json') {
      this.readStatusFile(false);
      return;
    }
    if (!JOURNAL_RE.test(base)) return;

    if (this.currentFile === file) {
      void this.readNewLines(false);
    } else {
      // A different journal file changed — switch if it is newer than the current one.
      const newest = this.findNewestJournal();
      if (newest && newest !== this.currentFile) {
        void this.switchTo(newest, { replay: false });
      }
    }
  }

  private findNewestJournal(): string | null {
    let entries: string[];
    try {
      entries = fs.readdirSync(this.dir).filter((f) => JOURNAL_RE.test(f));
    } catch {
      return null;
    }
    if (entries.length === 0) return null;
    let best: string | null = null;
    let bestTime = -1;
    for (const f of entries) {
      try {
        const st = fs.statSync(path.join(this.dir, f));
        if (st.mtimeMs > bestTime) {
          bestTime = st.mtimeMs;
          best = path.join(this.dir, f);
        }
      } catch {
        /* file vanished between readdir and stat */
      }
    }
    return best;
  }

  private async switchTo(file: string, opts: { replay: boolean }): Promise<void> {
    this.currentFile = file;
    this.offset = 0;
    this.remainder = '';
    console.log(`[journal] Tailing ${path.basename(file)}${opts.replay ? ' (replaying existing entries)' : ''}`);
    this.emit('file', file);
    await this.readNewLines(opts.replay);
  }

  /** Read bytes appended since the last read and emit complete lines. */
  private async readNewLines(replay: boolean): Promise<void> {
    if (!this.currentFile) return;
    if (this.reading) {
      this.pendingRead = true;
      return;
    }
    this.reading = true;
    try {
      let st: fs.Stats;
      try {
        st = await fs.promises.stat(this.currentFile);
      } catch {
        return; // file removed
      }
      if (st.size < this.offset) this.offset = 0; // truncated/rotated in place
      if (st.size === this.offset) return;

      const stream = fs.createReadStream(this.currentFile, {
        start: this.offset,
        end: st.size - 1,
        encoding: 'utf8',
      });
      let chunkData = '';
      for await (const chunk of stream) chunkData += chunk;
      this.offset = st.size;

      const text = this.remainder + chunkData;
      const lines = text.split(/\r?\n/);
      this.remainder = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let parsed: JournalEvent;
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          continue; // partial or corrupt line
        }
        if (!parsed || typeof parsed.event !== 'string') continue;
        this.emit('event', { event: parsed, replay, synthetic: false } satisfies PipelineEvent);
      }
    } finally {
      this.reading = false;
      if (this.pendingRead) {
        this.pendingRead = false;
        void this.readNewLines(false);
      }
    }
  }

  private readStatusFile(initial: boolean): void {
    const file = path.join(this.dir, 'Status.json');
    let parsed: ShipStatus;
    try {
      const raw = fs.readFileSync(file, 'utf8');
      if (!raw.trim()) return; // ED writes Status.json non-atomically; skip empty snapshots
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof parsed.Flags !== 'number') return;

    const prev = this.lastFlags;
    this.lastFlags = parsed.Flags;
    this.status = parsed;
    this.emit('status', parsed);

    // Emit flag-transition events, but never on the very first read — we have
    // no previous state to compare against, and firing "shields down" because
    // the app just started would be a false alert.
    if (initial || prev === null) return;
    for (const t of FLAG_TRANSITIONS) {
      const was = (prev & t.bit) !== 0;
      const is = (parsed.Flags & t.bit) !== 0;
      const fired = t.rising ? !was && is : was && !is;
      if (fired) {
        this.inject({
          timestamp: parsed.timestamp ?? new Date().toISOString(),
          event: t.name,
          Flags: parsed.Flags,
          Fuel: parsed.Fuel,
        });
      }
    }
  }
}
