import type { JournalEvent } from '../types.js';

function stamp(e: Omit<JournalEvent, 'timestamp'>): JournalEvent {
  return { timestamp: new Date().toISOString(), ...e } as JournalEvent;
}

/**
 * Realistic sample events for testing alert chains without launching the game.
 * Field shapes mirror the real journal so templates and conditions behave
 * identically in test and live play.
 */
export const SAMPLE_EVENTS: Record<string, () => JournalEvent> = {
  FSDJump: () =>
    stamp({
      event: 'FSDJump',
      StarSystem: 'Shinrarta Dezhra',
      SystemAddress: 3932277478106,
      JumpDist: 42.3,
      FuelUsed: 4.7,
      FuelLevel: 27.3,
    }),
  Docked: () =>
    stamp({
      event: 'Docked',
      StationName: 'Jameson Memorial',
      StationType: 'Orbis',
      StarSystem: 'Shinrarta Dezhra',
      DistFromStarLS: 324.2,
    }),
  Undocked: () => stamp({ event: 'Undocked', StationName: 'Jameson Memorial' }),
  Bounty: () =>
    stamp({
      event: 'Bounty',
      Target: 'anaconda',
      Target_Localised: 'Anaconda',
      TotalReward: 425000,
      VictimFaction: 'The Dark Wheel',
      Rewards: [{ Faction: 'Pilots Federation', Reward: 425000 }],
    }),
  Died: () =>
    stamp({
      event: 'Died',
      KillerName: 'Cmdr Salty McGriefface',
      KillerShip: 'fer_de_lance',
      KillerRank: 'Elite',
    }),
  Interdicted: () =>
    stamp({
      event: 'Interdicted',
      Submitted: false,
      Interdictor: 'Dangerous Dave',
      IsPlayer: false,
      Faction: 'The Dark Wheel',
    }),
  ThargoidInterdiction: () =>
    stamp({ event: 'Interdicted', Submitted: true, IsThargoid: true, IsPlayer: false }),
  MissionCompleted: () =>
    stamp({
      event: 'MissionCompleted',
      Faction: 'Sirius Corporation',
      Name: 'Mission_Delivery_name',
      LocalisedName: 'Deliver 42 units of Palladium',
      Reward: 1250000,
    }),
  Promotion: () => stamp({ event: 'Promotion', Combat: 7 }),
  Scan: () =>
    stamp({
      event: 'Scan',
      ScanType: 'Detailed',
      BodyName: 'Pru Aescs QC-M b24-1 A 3',
      PlanetClass: 'Earthlike body',
      TerraformState: '',
      WasDiscovered: false,
      WasMapped: false,
      DistanceFromArrivalLS: 891.4,
    }),
  MarketSell: () =>
    stamp({
      event: 'MarketSell',
      Type: 'painite',
      Type_Localised: 'Painite',
      Count: 128,
      SellPrice: 54000,
      TotalSale: 6912000,
      AvgPricePaid: 0,
    }),
  'Status.LowFuel': () =>
    stamp({ event: 'Status.LowFuel', Flags: 1 << 19, Fuel: { FuelMain: 3.1, FuelReservoir: 0.4 } }),
  'Status.Overheating': () => stamp({ event: 'Status.Overheating', Flags: 1 << 20 }),
  'Status.InDanger': () => stamp({ event: 'Status.InDanger', Flags: 1 << 22 }),
  'Status.ShieldsDown': () => stamp({ event: 'Status.ShieldsDown', Flags: 0 }),
  HullDamage: () => stamp({ event: 'HullDamage', Health: 0.42, PlayerPilot: true, Fighter: false }),
};

export function sampleEventNames(): string[] {
  return Object.keys(SAMPLE_EVENTS);
}

export function makeSampleEvent(name: string): JournalEvent | null {
  const factory = SAMPLE_EVENTS[name];
  return factory ? factory() : null;
}

/** Best-effort sample event for a rule's trigger, for test-firing. */
export function sampleForTrigger(trigger: string | string[]): JournalEvent {
  const triggers = Array.isArray(trigger) ? trigger : [trigger];
  for (const t of triggers) {
    const sample = makeSampleEvent(t);
    if (sample) return sample;
  }
  const name = triggers.find((t) => t !== '*') ?? 'TestEvent';
  return { timestamp: new Date().toISOString(), event: name };
}
