import type { SessionStats, ShipStatus } from '../types.js';
import { STATUS_FLAGS } from '../journal/watcher.js';
import type { StreamerbotClient } from './streamerbot.js';

/**
 * Publishes Elite Dangerous state into Streamer.bot as global variables.
 *
 * Streamer.bot's WebSocket API can read globals but not write them, so the
 * write has to happen inside Streamer.bot: the user pastes a one-time C#
 * action (see CSHARP_BOOTSTRAP) that receives a batch of name/value pairs and
 * calls CPH.SetGlobalVar for each. Because that bootstrap is generic, every
 * variable below — and any we add later — appears without further setup.
 *
 * Only changed values are sent, and sends are debounced, so a busy journal
 * doesn't turn into a DoAction per line.
 */

export interface GlobalsOptions {
  enabled: boolean;
  /** Streamer.bot action containing the C# bootstrap. */
  action: string;
  /** Prefix applied to every variable name. */
  prefix: string;
}

export const DEFAULT_GLOBALS: GlobalsOptions = {
  enabled: false,
  action: 'ED Set Globals',
  prefix: 'ed',
};

/** The C# the user pastes into a Streamer.bot action, once. */
export const CSHARP_BOOTSTRAP = `using System;
using System.Collections.Generic;
using Newtonsoft.Json;

public class CPHInline
{
    public bool Execute()
    {
        // Elite Streambot sends a JSON object of variable name -> value.
        string payload;
        if (!CPH.TryGetArg("payload", out payload) || string.IsNullOrWhiteSpace(payload))
            return false;

        var vars = JsonConvert.DeserializeObject<Dictionary<string, object>>(payload);
        if (vars == null) return false;

        foreach (var kv in vars)
        {
            // persisted: true -> shows in Global Variables > Persisted Globals
            CPH.SetGlobalVar(kv.Key, kv.Value, true);
        }
        return true;
    }
}`;

const flagOn = (flags: number | undefined, bit: number): boolean =>
  typeof flags === 'number' && (flags & bit) !== 0;

/** Ship-state flags exposed as globals — the ones worth driving keybinds from. */
const FLAG_GLOBALS: Array<{ key: string; bit: number }> = [
  { key: 'Docked', bit: STATUS_FLAGS.Docked },
  { key: 'Landed', bit: STATUS_FLAGS.Landed },
  { key: 'LandingGearDown', bit: STATUS_FLAGS.LandingGearDown },
  { key: 'ShieldsUp', bit: STATUS_FLAGS.ShieldsUp },
  { key: 'Supercruise', bit: STATUS_FLAGS.Supercruise },
  { key: 'HardpointsDeployed', bit: STATUS_FLAGS.HardpointsDeployed },
  { key: 'ScoopingFuel', bit: STATUS_FLAGS.ScoopingFuel },
  { key: 'FsdCharging', bit: STATUS_FLAGS.FsdCharging },
  { key: 'LowFuel', bit: STATUS_FLAGS.LowFuel },
  { key: 'Overheating', bit: STATUS_FLAGS.Overheating },
  { key: 'InDanger', bit: STATUS_FLAGS.InDanger },
];

export type GlobalValue = string | number | boolean;

/** Build the full variable set from current state. Keys are already prefixed. */
export function buildGlobals(
  session: SessionStats,
  status: ShipStatus | null,
  lastEvent: string | null,
  prefix: string,
): Record<string, GlobalValue> {
  const p = (name: string) => `${prefix}${name}`;
  const out: Record<string, GlobalValue> = {
    [p('Cmdr')]: session.cmdr ?? '',
    [p('Ship')]: session.ship ?? '',
    [p('ShipName')]: session.shipName ?? '',
    [p('System')]: session.currentSystem ?? '',
    [p('Station')]: session.currentStation ?? '',
    [p('Jumps')]: session.jumps,
    [p('DistanceLy')]: Math.round(session.distanceLy * 10) / 10,
    [p('CreditsEarned')]: session.creditsEarned,
    [p('Bounties')]: session.bounties,
    [p('BountyEarnings')]: session.bountyEarnings,
    [p('MissionsCompleted')]: session.missionsCompleted,
    [p('Deaths')]: session.deaths,
    [p('Interdictions')]: session.interdictions,
    [p('BodiesScanned')]: session.bodiesScanned,
    [p('FirstDiscoveries')]: session.firstDiscoveries,
    [p('LastEvent')]: lastEvent ?? '',
  };
  if (session.fuelLevel !== null) out[p('FuelLevel')] = Math.round(session.fuelLevel * 10) / 10;
  if (session.balance !== null) out[p('Balance')] = session.balance;

  // Ship state — only once Status.json has been read, so we never publish a
  // misleading "false" for flags we haven't actually observed yet.
  if (status) {
    for (const f of FLAG_GLOBALS) out[p(f.key)] = flagOn(status.Flags, f.bit);
  }
  return out;
}

export class GlobalsPublisher {
  private last = new Map<string, string>();
  private timer: NodeJS.Timeout | null = null;
  private opts: GlobalsOptions;
  private sb: StreamerbotClient;
  public lastPushAt: number | null = null;
  public lastPushCount = 0;
  public lastError: string | null = null;

  constructor(sb: StreamerbotClient, opts: GlobalsOptions) {
    this.sb = sb;
    this.opts = opts;
  }

  get options(): GlobalsOptions {
    return this.opts;
  }

  setOptions(opts: GlobalsOptions): void {
    const prefixChanged = opts.prefix !== this.opts.prefix;
    this.opts = opts;
    // A prefix change renames every variable, so forget what we think is published.
    if (prefixChanged) this.last.clear();
  }

  /** Forget published state (e.g. session reset) so the next push resends everything. */
  reset(): void {
    this.last.clear();
  }

  /** Queue a publish; coalesces bursts into one DoAction. */
  schedule(build: () => Record<string, GlobalValue>): void {
    if (!this.opts.enabled) return;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush(build());
    }, 1000);
  }

  /** Send only values that changed since the last successful push. */
  private flush(all: Record<string, GlobalValue>): void {
    if (!this.opts.enabled) return;
    const changed: Record<string, GlobalValue> = {};
    for (const [k, v] of Object.entries(all)) {
      const s = String(v);
      if (this.last.get(k) !== s) changed[k] = v;
    }
    if (Object.keys(changed).length === 0) return;

    if (!this.sb.connected) {
      // Don't queue globals in the outbox — stale state is worse than none;
      // the next push after reconnect sends current values anyway.
      return;
    }

    const { status } = this.sb.doAction(this.opts.action, { payload: JSON.stringify(changed) });
    if (status === 'sent') {
      for (const [k, v] of Object.entries(changed)) this.last.set(k, String(v));
      this.lastPushAt = Date.now();
      this.lastPushCount = Object.keys(changed).length;
    }
  }
}
