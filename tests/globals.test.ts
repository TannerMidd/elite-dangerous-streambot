import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGlobals, GlobalsPublisher } from '../src/dispatch/globals.js';
import { SessionState } from '../src/state/session.js';
import type { ShipStatus } from '../src/types.js';
import type { StreamerbotClient } from '../src/dispatch/streamerbot.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fakeSb() {
  const calls: Array<{ action: string; payload: Record<string, unknown> }> = [];
  const sb = {
    connected: true,
    doAction(action: string, args: Record<string, string>) {
      calls.push({ action, payload: JSON.parse(args.payload) });
      return { status: 'sent' as const, id: 'x' };
    },
  };
  return { sb: sb as unknown as StreamerbotClient, calls };
}

test('buildGlobals maps session, status flags, and prefix', () => {
  const session = new SessionState();
  session.handle({
    event: { timestamp: '', event: 'FSDJump', StarSystem: 'Deciat', JumpDist: 10.5 },
    replay: false,
    synthetic: false,
  });
  const status = { timestamp: '', event: 'Status', Flags: (1 << 2) | (1 << 3) } as ShipStatus; // gear down + shields up
  const g = buildGlobals(session.getStats(), status, 'FSDJump', 'ed');

  assert.equal(g.edSystem, 'Deciat');
  assert.equal(g.edJumps, 1);
  assert.equal(g.edLastEvent, 'FSDJump');
  assert.equal(g.edLandingGearDown, true);
  assert.equal(g.edShieldsUp, true);
  assert.equal(g.edHardpointsDeployed, false);
});

test('flags are omitted until Status.json has been read', () => {
  const g = buildGlobals(new SessionState().getStats(), null, null, 'ed');
  assert.ok(!('edLandingGearDown' in g));
  assert.ok('edJumps' in g);
});

test('publisher debounces bursts and sends only changed values', async () => {
  const { sb, calls } = fakeSb();
  const pub = new GlobalsPublisher(sb, { enabled: true, action: 'ED Set Globals', prefix: 'ed' });

  // A burst of schedules within the debounce window -> one DoAction
  pub.schedule(() => ({ edJumps: 1, edSystem: 'Sol' }));
  pub.schedule(() => ({ edJumps: 1, edSystem: 'Sol' }));
  pub.schedule(() => ({ edJumps: 1, edSystem: 'Sol' }));
  await sleep(1200);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].payload, { edJumps: 1, edSystem: 'Sol' });
  assert.equal(calls[0].action, 'ED Set Globals');

  // Same values again -> nothing new to send
  pub.schedule(() => ({ edJumps: 1, edSystem: 'Sol' }));
  await sleep(1200);
  assert.equal(calls.length, 1);

  // One value changes -> only the delta goes out
  pub.schedule(() => ({ edJumps: 2, edSystem: 'Sol' }));
  await sleep(1200);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].payload, { edJumps: 2 });
});

test('publisher stays silent when disabled or disconnected', async () => {
  const { sb, calls } = fakeSb();
  const off = new GlobalsPublisher(sb, { enabled: false, action: 'X', prefix: 'ed' });
  off.schedule(() => ({ edJumps: 1 }));
  await sleep(1100);
  assert.equal(calls.length, 0);

  const { sb: sb2, calls: calls2 } = fakeSb();
  (sb2 as unknown as { connected: boolean }).connected = false;
  const on = new GlobalsPublisher(sb2, { enabled: true, action: 'X', prefix: 'ed' });
  on.schedule(() => ({ edJumps: 1 }));
  await sleep(1100);
  assert.equal(calls2.length, 0);
});

test('reset causes a full resend', async () => {
  const { sb, calls } = fakeSb();
  const pub = new GlobalsPublisher(sb, { enabled: true, action: 'X', prefix: 'ed' });
  pub.schedule(() => ({ edJumps: 5 }));
  await sleep(1200);
  pub.reset();
  pub.schedule(() => ({ edJumps: 5 }));
  await sleep(1200);
  assert.equal(calls.length, 2);
});
