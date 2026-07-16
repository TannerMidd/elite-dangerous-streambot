import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuleEngine } from '../src/rules/engine.js';
import { SessionState } from '../src/state/session.js';
import type { JournalEvent, PipelineEvent } from '../src/types.js';

let dir: string;
let engine: RuleEngine;

const write = (name: string, yaml: string) => fs.writeFileSync(path.join(dir, name), yaml, 'utf8');
const evt = (e: Record<string, unknown>, replay = false): PipelineEvent => ({
  event: { timestamp: new Date().toISOString(), ...e } as JournalEvent,
  replay,
  synthetic: false,
});
const session = () => new SessionState().getStats();

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-streambot-rules-'));
  engine = new RuleEngine(dir);
});

afterEach(async () => {
  await engine.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('matches trigger and renders args', () => {
  write('bounty.yaml', [
    'name: Big Bounty',
    'trigger: Bounty',
    'when: event.TotalReward >= 250000',
    'action: ED Big Bounty',
    'args:',
    '  reward: "{{event.TotalReward | credits}}"',
  ].join('\n'));
  engine.loadAll();

  const matches = engine.evaluate(evt({ event: 'Bounty', TotalReward: 425000 }), null, session());
  assert.equal(matches.length, 1);
  assert.equal(matches[0].action, 'ED Big Bounty');
  assert.equal(matches[0].args.reward, '425,000 CR');

  const below = engine.evaluate(evt({ event: 'Bounty', TotalReward: 1000 }), null, session());
  assert.equal(below.length, 0);
});

test('replayed events never fire but still count nothing', () => {
  write('dock.yaml', 'name: Docked\ntrigger: Docked\naction: ED Docked\n');
  engine.loadAll();
  const matches = engine.evaluate(evt({ event: 'Docked' }, true), null, session());
  assert.equal(matches.length, 0);
  assert.equal(engine.get('Docked')!.seenCount, 0);
});

test('cooldown blocks refiring inside the window', () => {
  write('dock.yaml', 'name: Docked\ntrigger: Docked\ncooldown: 60\naction: ED Docked\n');
  engine.loadAll();
  assert.equal(engine.evaluate(evt({ event: 'Docked' }), null, session()).length, 1);
  assert.equal(engine.evaluate(evt({ event: 'Docked' }), null, session()).length, 0);
  assert.equal(engine.get('Docked')!.seenCount, 2); // seen twice, fired once
  assert.equal(engine.get('Docked')!.fireCount, 1);
});

test('cooldowns and counters survive a reload (hot-reload semantics)', () => {
  write('dock.yaml', 'name: Docked\ntrigger: Docked\ncooldown: 60\naction: ED Docked\n');
  engine.loadAll();
  engine.evaluate(evt({ event: 'Docked' }), null, session());
  engine.loadAll(); // simulates a hot reload
  assert.equal(engine.get('Docked')!.fireCount, 1);
  assert.equal(engine.evaluate(evt({ event: 'Docked' }), null, session()).length, 0); // still cooling down
});

test('unsafe JavaScript is rejected without the opt-in', () => {
  write('sneaky.yaml', [
    'name: Sneaky',
    'trigger: Docked',
    'when: process.exit(1) || true',
    'action: X',
  ].join('\n'));
  engine.loadAll();
  const rule = engine.get('Sneaky')!;
  assert.ok(rule.error, 'rule should carry an error');
  assert.match(rule.error!, /safe evaluator/);
  assert.equal(rule.enabled, false);
  assert.equal(engine.evaluate(evt({ event: 'Docked' }), null, session()).length, 0);
});

test('unsafe: true opts a rule into full JavaScript', () => {
  write('power.yaml', [
    'name: Power User',
    'trigger: Bounty',
    'when: "[1,2,3].reduce((a, b) => a + b, 0) === 6"',
    'unsafe: true',
    'action: X',
  ].join('\n'));
  engine.loadAll();
  const rule = engine.get('Power User')!;
  assert.equal(rule.error, null);
  assert.equal(engine.evaluate(evt({ event: 'Bounty' }), null, session()).length, 1);
});

test('wildcard and list triggers', () => {
  write('all.yaml', 'name: All\ntrigger: "*"\naction: X\n');
  write('multi.yaml', 'name: Multi\ntrigger: [Docked, Undocked]\naction: Y\n');
  engine.loadAll();
  const matches = engine.evaluate(evt({ event: 'Undocked' }), null, session());
  assert.deepEqual(matches.map((m) => m.rule.name).sort(), ['All', 'Multi']);
});

test('broken rule files are surfaced, not swallowed', () => {
  write('broken.yaml', 'name: [unclosed\n');
  engine.loadAll();
  const broken = engine.list().find((r) => r.name.startsWith('(broken)'));
  assert.ok(broken);
  assert.ok(broken!.error);
});

test('testFire ignores condition and cooldown', () => {
  write('bounty.yaml', 'name: BB\ntrigger: Bounty\nwhen: event.TotalReward >= 999999999\ncooldown: 3600\naction: X\n');
  engine.loadAll();
  const fired = engine.testFire('BB', { timestamp: '', event: 'Bounty', TotalReward: 1 } as JournalEvent, null, session());
  assert.ok(fired);
  assert.equal(fired!.rule.fireCount, 1);
});
