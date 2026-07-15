import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate, renderArgs } from '../src/rules/template.js';

const scope = {
  event: { TotalReward: 425000, StarSystem: 'Deciat', JumpDist: 31.42, Fuel: { FuelMain: 2.456 } },
  session: { jumps: 12, distanceLy: 340.5 },
};

test('path resolution', () => {
  assert.equal(renderTemplate('{{event.StarSystem}}', scope), 'Deciat');
  assert.equal(renderTemplate('{{event.Fuel.FuelMain}}', scope), '2.456');
  assert.equal(renderTemplate('Jumped to {{event.StarSystem}}!', scope), 'Jumped to Deciat!');
});

test('missing paths render empty, not "undefined"', () => {
  assert.equal(renderTemplate('{{event.Nope}}', scope), '');
  assert.equal(renderTemplate('{{event.Nope.Deeper}}', scope), '');
});

test('filters', () => {
  assert.equal(renderTemplate('{{event.TotalReward | credits}}', scope), '425,000 CR');
  assert.equal(renderTemplate('{{event.TotalReward | number}}', scope), '425,000');
  assert.equal(renderTemplate('{{event.JumpDist | round}}', scope), '31');
  assert.equal(renderTemplate('{{event.Fuel.FuelMain | fixed1}}', scope), '2.5');
  assert.equal(renderTemplate('{{session.distanceLy | ly}}', scope), '340.5 ly');
  assert.equal(renderTemplate('{{event.StarSystem | upper}}', scope), 'DECIAT');
  assert.equal(renderTemplate('{{event.StarSystem | lower}}', scope), 'deciat');
});

test('renderArgs renders every value and keeps keys', () => {
  const out = renderArgs(
    { reward: '{{event.TotalReward | credits}}', system: '{{event.StarSystem}}', fixed: 'plain' },
    scope,
  );
  assert.deepEqual(out, { reward: '425,000 CR', system: 'Deciat', fixed: 'plain' });
});
