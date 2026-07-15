import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import chokidar, { FSWatcher } from 'chokidar';
import YAML from 'yaml';
import type {
  JournalEvent,
  LoadedRule,
  PipelineEvent,
  RuleDefinition,
  SessionStats,
  ShipStatus,
} from '../types.js';
import { renderArgs } from './template.js';

export interface RuleMatch {
  rule: LoadedRule;
  action: string;
  args: Record<string, string>;
}

/**
 * Loads rule files (.yaml/.yml/.json) from a directory, hot-reloads them on
 * change, and evaluates incoming events against them.
 *
 * `when` expressions are compiled with `new Function` over a fixed scope of
 * (event, status, session). Rules are local files authored by the user on
 * their own machine — the same trust level as any other config — so full JS
 * expressiveness is deliberately allowed.
 *
 * Emits 'reload' after any rules reload.
 */
export class RuleEngine extends EventEmitter {
  private dir: string;
  private rules = new Map<string, LoadedRule>();
  private watcher: FSWatcher | null = null;
  private reloadTimer: NodeJS.Timeout | null = null;
  /** Runtime enable/disable overrides from the UI, by rule name. */
  private overrides = new Map<string, boolean>();

  constructor(dir: string) {
    super();
    this.dir = dir;
  }

  get rulesDir(): string {
    return this.dir;
  }

  start(): void {
    fs.mkdirSync(this.dir, { recursive: true });
    this.loadAll();
    this.watcher = chokidar.watch(this.dir, { ignoreInitial: true, depth: 0 });
    const schedule = () => {
      if (this.reloadTimer) clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => this.loadAll(), 250);
    };
    this.watcher.on('add', schedule).on('change', schedule).on('unlink', schedule);
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
  }

  list(): LoadedRule[] {
    return [...this.rules.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  get(name: string): LoadedRule | undefined {
    return this.rules.get(name);
  }

  /** Forget a runtime enable/disable override (used when a rule is saved or deleted). */
  clearOverride(name: string): void {
    this.overrides.delete(name);
  }

  setEnabled(name: string, enabled: boolean): boolean {
    const rule = this.rules.get(name);
    if (!rule) return false;
    this.overrides.set(name, enabled);
    rule.enabled = enabled;
    this.emit('reload');
    return true;
  }

  loadAll(): void {
    const previous = this.rules;
    this.rules = new Map();
    let files: string[] = [];
    try {
      files = fs
        .readdirSync(this.dir)
        .filter((f) => /\.(ya?ml|json)$/i.test(f))
        .sort();
    } catch (err) {
      console.error(`[rules] Cannot read rules dir ${this.dir}:`, err);
    }

    for (const file of files) {
      const full = path.join(this.dir, file);
      try {
        const raw = fs.readFileSync(full, 'utf8');
        const parsed = /\.json$/i.test(file) ? JSON.parse(raw) : YAML.parse(raw);
        const defs: RuleDefinition[] = Array.isArray(parsed) ? parsed : [parsed];
        for (const def of defs) {
          if (!def || typeof def !== 'object') continue;
          const loaded = this.compile(def, file);
          // Preserve firing history across hot reloads so cooldowns survive edits.
          const prev = previous.get(loaded.name);
          if (prev) {
            loaded.lastFired = prev.lastFired;
            loaded.fireCount = prev.fireCount;
          }
          const override = this.overrides.get(loaded.name);
          if (override !== undefined) loaded.enabled = override;
          if (this.rules.has(loaded.name)) {
            console.warn(`[rules] Duplicate rule name "${loaded.name}" in ${file} — keeping the first`);
            continue;
          }
          this.rules.set(loaded.name, loaded);
        }
      } catch (err) {
        console.error(`[rules] Failed to load ${file}:`, err);
        const name = `(broken) ${file}`;
        this.rules.set(name, {
          name,
          trigger: [],
          action: '',
          file,
          enabled: false,
          predicate: null,
          lastFired: null,
          fireCount: 0,
          error: String(err instanceof Error ? err.message : err),
        });
      }
    }
    console.log(`[rules] Loaded ${this.rules.size} rule(s) from ${this.dir}`);
    this.emit('reload');
  }

  private compile(def: RuleDefinition, file: string): LoadedRule {
    const loaded: LoadedRule = {
      enabled: true,
      cooldown: 0,
      args: {},
      fireOnReplay: false,
      ...def,
      name: String(def.name ?? path.basename(file)),
      file,
      predicate: null,
      lastFired: null,
      fireCount: 0,
      error: null,
    };
    if (!def.trigger) {
      loaded.error = 'Rule has no "trigger"';
      loaded.enabled = false;
    }
    if (!def.action) {
      loaded.error = 'Rule has no "action"';
      loaded.enabled = false;
    }
    if (def.when) {
      try {
        const fn = new Function(
          'event',
          'status',
          'session',
          `"use strict"; return !!(${def.when});`,
        );
        loaded.predicate = (event, status, session) => {
          try {
            return fn(event, status, session) as boolean;
          } catch {
            return false; // a throwing condition (e.g. missing field) just doesn't match
          }
        };
      } catch (err) {
        loaded.error = `Invalid "when" expression: ${err instanceof Error ? err.message : err}`;
        loaded.enabled = false;
      }
    }
    return loaded;
  }

  private triggerMatches(rule: LoadedRule, eventName: string): boolean {
    const triggers = Array.isArray(rule.trigger) ? rule.trigger : [rule.trigger];
    return triggers.some((t) => t === '*' || t === eventName);
  }

  /**
   * Evaluate an event against all rules. Returns the dispatches to perform.
   * Cooldowns are stamped here, so a returned match is a committed firing.
   */
  evaluate(
    pipelineEvent: PipelineEvent,
    status: ShipStatus | null,
    session: SessionStats,
  ): RuleMatch[] {
    const matches: RuleMatch[] = [];
    const e = pipelineEvent.event;
    const now = Date.now();

    for (const rule of this.rules.values()) {
      if (!rule.enabled || rule.error) continue;
      if (pipelineEvent.replay && !rule.fireOnReplay) continue;
      if (!this.triggerMatches(rule, e.event)) continue;
      if (rule.predicate && !rule.predicate(e, status, session)) continue;
      if (rule.cooldown && rule.lastFired && now - rule.lastFired < rule.cooldown * 1000) continue;

      rule.lastFired = now;
      rule.fireCount += 1;
      const scope = { event: e, status, session };
      matches.push({ rule, action: rule.action, args: renderArgs(rule.args, scope) });
    }
    return matches;
  }

  /** Force-fire a rule with a given event, ignoring conditions and cooldown. */
  testFire(name: string, event: JournalEvent, status: ShipStatus | null, session: SessionStats): RuleMatch | null {
    const rule = this.rules.get(name);
    if (!rule || rule.error) return null;
    rule.lastFired = Date.now();
    rule.fireCount += 1;
    const scope = { event, status, session };
    return { rule, action: rule.action, args: renderArgs(rule.args, scope) };
  }
}
