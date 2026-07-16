import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionState } from '../src/state/session.js';
import type { JournalEvent, PipelineEvent } from '../src/types.js';

const evt = (e: Record<string, unknown>, replay = false): PipelineEvent => ({
  event: { timestamp: new Date().toISOString(), ...e } as JournalEvent,
  replay,
  synthetic: false,
});

test('bounties accumulate credits and counts', () => {
  const s = new SessionState();
  s.handle(evt({ event: 'Bounty', TotalReward: 100000 }));
  s.handle(evt({ event: 'Bounty', TotalReward: 250000 }));
  const stats = s.getStats();
  assert.equal(stats.bounties, 2);
  assert.equal(stats.bountyEarnings, 350000);
  assert.equal(stats.creditsEarned, 350000);
});

test('replayed events count into stats (that is the point of replay)', () => {
  const s = new SessionState();
  s.handle(evt({ event: 'Bounty', TotalReward: 400000 }, true));
  assert.equal(s.getStats().bounties, 1);
});

test('jumps track count, distance, and location', () => {
  const s = new SessionState();
  s.handle(evt({ event: 'FSDJump', StarSystem: 'Sol', JumpDist: 10.5 }));
  s.handle(evt({ event: 'FSDJump', StarSystem: 'Achenar', JumpDist: 20.25 }));
  const stats = s.getStats();
  assert.equal(stats.jumps, 2);
  assert.equal(stats.distanceLy, 30.75);
  assert.equal(stats.currentSystem, 'Achenar');
  assert.equal(stats.docked, false);
});

test('docking state transitions', () => {
  const s = new SessionState();
  s.handle(evt({ event: 'Docked', StationName: 'Jameson Memorial', StarSystem: 'Shinrarta Dezhra' }));
  assert.equal(s.getStats().docked, true);
  assert.equal(s.getStats().currentStation, 'Jameson Memorial');
  s.handle(evt({ event: 'Undocked', StationName: 'Jameson Memorial' }));
  assert.equal(s.getStats().docked, false);
  assert.equal(s.getStats().currentStation, null);
});

test('commander identity from LoadGame', () => {
  const s = new SessionState();
  s.handle(evt({ event: 'LoadGame', Commander: 'Jameson', Ship: 'Krait_MkII', ShipName: 'STARDUST', Credits: 5000 }));
  const stats = s.getStats();
  assert.equal(stats.cmdr, 'Jameson');
  assert.equal(stats.shipName, 'STARDUST');
  assert.equal(stats.balance, 5000);
});

test('scans count first discoveries separately', () => {
  const s = new SessionState();
  s.handle(evt({ event: 'Scan', BodyName: 'A 1', WasDiscovered: true }));
  s.handle(evt({ event: 'Scan', BodyName: 'A 2', WasDiscovered: false }));
  const stats = s.getStats();
  assert.equal(stats.bodiesScanned, 2);
  assert.equal(stats.firstDiscoveries, 1);
});

test('deaths, missions, market sales', () => {
  const s = new SessionState();
  s.handle(evt({ event: 'Died', KillerName: 'x' }));
  s.handle(evt({ event: 'MissionCompleted', Reward: 1000000 }));
  s.handle(evt({ event: 'MarketSell', TotalSale: 500000 }));
  const stats = s.getStats();
  assert.equal(stats.deaths, 1);
  assert.equal(stats.missionsCompleted, 1);
  assert.equal(stats.creditsEarned, 1500000);
});

test('reset clears everything', () => {
  const s = new SessionState();
  s.handle(evt({ event: 'Bounty', TotalReward: 100000 }));
  s.reset();
  assert.equal(s.getStats().bounties, 0);
  assert.equal(s.getStats().creditsEarned, 0);
});
