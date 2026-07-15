import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileSafe, ExprError } from '../src/rules/safe-eval.js';

const scope = {
  event: {
    TotalReward: 425000,
    StarSystem: 'Shinrarta Dezhra',
    WasDiscovered: false,
    ScanType: 'Detailed',
    IsThargoid: true,
    Fuel: { FuelMain: 2.4 },
  },
  status: { Flags: 524312, Fuel: { FuelMain: 2.4 } },
  session: { jumps: 20, deaths: 0, bounties: 3 },
};

const run = (expr: string) => compileSafe(expr)(scope);

test('comparisons', () => {
  assert.equal(run('event.TotalReward >= 250000'), true);
  assert.equal(run('event.TotalReward < 250000'), false);
  assert.equal(run('event.WasDiscovered === false'), true);
  assert.equal(run('event.ScanType !== "NavBeaconDetail"'), true);
  assert.equal(run("event.StarSystem == 'Shinrarta Dezhra'"), true);
});

test('boolean logic and grouping', () => {
  assert.equal(run('event.TotalReward >= 250000 && session.jumps > 5'), true);
  assert.equal(run('session.deaths > 0 || session.bounties >= 3'), true);
  assert.equal(run('!(session.deaths > 0)'), true);
  assert.equal(run('(session.jumps > 100 || session.jumps === 20) && true'), true);
});

test('arithmetic including modulo (jump milestones)', () => {
  assert.equal(run('session.jumps % 10 === 0'), true);
  assert.equal(run('session.jumps + 5 === 25'), true);
  assert.equal(run('session.jumps * 2 - 10 === 30'), true);
  assert.equal(run('-session.deaths === 0'), true);
});

test('nested and missing paths', () => {
  assert.equal(run('event.Fuel.FuelMain < 5'), true);
  assert.equal(run('event.Missing === undefined'), true);
  assert.equal(run('event.Missing.Deeper === undefined'), true); // no throw on missing intermediates
  assert.equal(run('event.Missing > 5'), false);
});

test('helper functions are case-insensitive', () => {
  assert.equal(run("contains(event.StarSystem, 'shinrarta')"), true);
  assert.equal(run("startsWith(event.StarSystem, 'SHIN')"), true);
  assert.equal(run("endsWith(event.StarSystem, 'dezhra')"), true);
  assert.equal(run("lower(event.ScanType) === 'detailed'"), true);
  assert.equal(run('len(event.StarSystem) > 5'), true);
  assert.equal(run('max(session.jumps, 5) === 20'), true);
  assert.equal(run('round(event.Fuel.FuelMain) === 2'), true);
});

test('all preset rule conditions compile and behave', () => {
  assert.equal(run('event.IsThargoid === true'), true);
  assert.equal(run('event.IsThargoid !== true'), false);
  assert.equal(run("event.WasDiscovered === false && event.ScanType !== 'NavBeaconDetail'"), true);
  assert.equal(run('session.jumps > 0 && session.jumps % 10 === 0'), true);
});

test('rejects anything outside the sandbox', () => {
  assert.throws(() => compileSafe('process.exit(1)'), ExprError);
  assert.throws(() => compileSafe('globalThis.foo'), ExprError);
  assert.throws(() => compileSafe('event.constructor.constructor("x")'), ExprError);
  assert.throws(() => compileSafe('event.__proto__.polluted'), ExprError);
  assert.throws(() => compileSafe('require("fs")'), ExprError);
  assert.throws(() => compileSafe('event.name = 5'), ExprError);
  assert.throws(() => compileSafe('fetch("http://evil")'), ExprError);
  assert.throws(() => compileSafe('(() => 1)()'), ExprError);
  assert.throws(() => compileSafe('event.StarSystem.includes("x")'), ExprError); // method calls: use contains()
});

test('helpful parse errors', () => {
  assert.throws(() => compileSafe('event.TotalReward >='), /Unexpected end/);
  assert.throws(() => compileSafe('unknownFn(1)'), /Unknown function/);
  assert.throws(() => compileSafe('foo > 1'), /Unknown name "foo"/);
  assert.throws(() => compileSafe("'unterminated"), /Unterminated string/);
});
