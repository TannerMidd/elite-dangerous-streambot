import type { JournalEvent, PipelineEvent, SessionStats, ShipStatus } from '../types.js';

/**
 * Aggregates journal events into per-session statistics that rules and
 * templates can reference as `session.*`. Replayed events update state too —
 * that is the point of replay: restarting the app mid-session should not
 * reset the stream's running totals.
 */
export class SessionState {
  private stats: SessionStats;

  constructor() {
    this.stats = SessionState.empty();
  }

  static empty(): SessionStats {
    return {
      sessionStart: new Date().toISOString(),
      cmdr: null,
      ship: null,
      shipName: null,
      currentSystem: null,
      currentStation: null,
      docked: false,
      jumps: 0,
      distanceLy: 0,
      creditsEarned: 0,
      bounties: 0,
      bountyEarnings: 0,
      missionsCompleted: 0,
      deaths: 0,
      interdictions: 0,
      bodiesScanned: 0,
      firstDiscoveries: 0,
      fuelLevel: null,
      balance: null,
    };
  }

  reset(): void {
    this.stats = SessionState.empty();
  }

  getStats(): SessionStats {
    return { ...this.stats };
  }

  updateStatus(status: ShipStatus): void {
    if (status.Fuel && typeof status.Fuel.FuelMain === 'number') {
      this.stats.fuelLevel = status.Fuel.FuelMain;
    }
    if (typeof status.Balance === 'number') this.stats.balance = status.Balance;
  }

  handle(pipelineEvent: PipelineEvent): void {
    const e = pipelineEvent.event;
    const s = this.stats;
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

    switch (e.event) {
      case 'LoadGame':
        s.cmdr = str(e.Commander) ?? s.cmdr;
        s.ship = str(e.Ship_Localised) ?? str(e.Ship) ?? s.ship;
        s.shipName = str(e.ShipName) ?? s.shipName;
        s.balance = num(e.Credits) || s.balance;
        break;
      case 'Commander':
        s.cmdr = str(e.Name) ?? s.cmdr;
        break;
      case 'Loadout':
        s.ship = str(e.Ship) ?? s.ship;
        s.shipName = str(e.ShipName) ?? s.shipName;
        break;
      case 'Location':
      case 'CarrierJump':
        s.currentSystem = str(e.StarSystem) ?? s.currentSystem;
        s.docked = e.Docked === true;
        s.currentStation = s.docked ? str(e.StationName) : null;
        break;
      case 'FSDJump':
        s.jumps += 1;
        s.distanceLy += num(e.JumpDist);
        s.currentSystem = str(e.StarSystem) ?? s.currentSystem;
        s.currentStation = null;
        s.docked = false;
        break;
      case 'Docked':
        s.docked = true;
        s.currentStation = str(e.StationName);
        s.currentSystem = str(e.StarSystem) ?? s.currentSystem;
        break;
      case 'Undocked':
        s.docked = false;
        s.currentStation = null;
        break;
      case 'Bounty': {
        const reward = num(e.TotalReward) || num(e.Reward);
        s.bounties += 1;
        s.bountyEarnings += reward;
        s.creditsEarned += reward;
        break;
      }
      case 'RedeemVoucher':
        s.creditsEarned += num(e.Amount);
        break;
      case 'MissionCompleted':
        s.missionsCompleted += 1;
        s.creditsEarned += num(e.Reward);
        break;
      case 'MarketSell':
        s.creditsEarned += num(e.TotalSale);
        break;
      case 'SellExplorationData':
      case 'MultiSellExplorationData':
        s.creditsEarned += num(e.TotalEarnings) || num(e.BaseValue) + num(e.Bonus);
        break;
      case 'Died':
        s.deaths += 1;
        break;
      case 'Interdicted':
        s.interdictions += 1;
        break;
      case 'Scan':
        s.bodiesScanned += 1;
        if (e.WasDiscovered === false) s.firstDiscoveries += 1;
        break;
      default:
        break;
    }

    const balance = (e as JournalEvent & { Balance?: unknown }).Balance;
    if (typeof balance === 'number') this.stats.balance = balance;
  }
}
