/**
 * Writes a fake Elite Dangerous journal to a directory so the app can be
 * demoed without the game. Usage:
 *
 *   npm run fake-journal -- <dir> [--fast]
 *
 * Point config.json's "journalDir" at the same <dir>, start the app, and
 * watch events flow. Writes an initial LoadGame/Location, then appends a
 * random-ish stream of events every few seconds. Also maintains Status.json
 * and occasionally toggles flags (low fuel, shields) to exercise the
 * Status.* synthetic triggers.
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: npm run fake-journal -- <dir> [--fast]');
  process.exit(1);
}
const fast = process.argv.includes('--fast');
fs.mkdirSync(dir, { recursive: true });

const stampFile = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
const journalPath = path.join(dir, `Journal.${stampFile}.01.log`);
const statusPath = path.join(dir, 'Status.json');

const now = () => new Date().toISOString();
const write = (e: Record<string, unknown>) => {
  const line = JSON.stringify({ timestamp: now(), ...e });
  fs.appendFileSync(journalPath, line + '\n');
  console.log('journal +', line.slice(0, 120));
};

let flags = (1 << 3) | (1 << 4); // ShieldsUp | Supercruise
const writeStatus = () => {
  fs.writeFileSync(
    statusPath,
    JSON.stringify({
      timestamp: now(),
      event: 'Status',
      Flags: flags,
      Fuel: { FuelMain: fuel, FuelReservoir: 0.6 },
      Balance: balance,
    }),
  );
};

let fuel = 32;
let balance = 125_000_000;
const systems = ['LHS 3447', 'Eravate', 'Deciat', 'Shinrarta Dezhra', 'Maia', 'Sol', 'Achenar'];
let systemIdx = 0;

// Boot events
write({ event: 'Fileheader', gameversion: '4.0.0.100', language: 'English/UK' });
write({ event: 'Commander', Name: 'Jameson', FID: 'F0000000' });
write({ event: 'LoadGame', Commander: 'Jameson', Ship: 'Krait_MkII', Ship_Localised: 'Krait Mk II', ShipName: 'STARDUST', Credits: balance });
write({ event: 'Location', StarSystem: systems[0], Docked: true, StationName: 'Dalton Gateway' });
writeStatus();

const actions: Array<() => void> = [
  () => {
    systemIdx = (systemIdx + 1) % systems.length;
    const dist = +(Math.random() * 40 + 8).toFixed(2);
    fuel = Math.max(1, fuel - dist / 10);
    write({ event: 'FSDJump', StarSystem: systems[systemIdx], JumpDist: dist, FuelUsed: dist / 10, FuelLevel: fuel });
    writeStatus();
  },
  () => {
    const reward = Math.round(Math.random() * 500_000);
    balance += reward;
    write({ event: 'Bounty', Target: 'python', Target_Localised: 'Python', TotalReward: reward, VictimFaction: 'Crimson State Group' });
  },
  () => write({ event: 'Docked', StationName: 'Jameson Memorial', StationType: 'Orbis', StarSystem: systems[systemIdx] }),
  () => write({ event: 'Undocked', StationName: 'Jameson Memorial' }),
  () => {
    const reward = Math.round(Math.random() * 2_000_000);
    balance += reward;
    write({ event: 'MissionCompleted', Faction: 'Sirius Corporation', Name: 'Mission_Delivery', LocalisedName: 'Deliver 30 units of Gold', Reward: reward });
  },
  () => write({ event: 'Scan', ScanType: 'Detailed', BodyName: `${systems[systemIdx]} A ${Math.ceil(Math.random() * 9)}`, PlanetClass: 'High metal content body', WasDiscovered: Math.random() > 0.7 ? false : true, WasMapped: true }),
  () => write({ event: 'Interdicted', Submitted: false, Interdictor: 'Rival Pirate', IsPlayer: false, Faction: 'Kumo Crew' }),
  () => {
    // Toggle low-fuel flag to exercise Status.LowFuel
    flags |= 1 << 19;
    fuel = 2.5;
    writeStatus();
    setTimeout(() => { flags &= ~(1 << 19); fuel = 30; writeStatus(); }, 4000);
  },
  () => {
    // Shields down, then restored
    flags &= ~(1 << 3);
    writeStatus();
    setTimeout(() => { flags |= 1 << 3; writeStatus(); }, 5000);
  },
];

console.log(`\nFake journal running.\n  journal: ${journalPath}\n  status:  ${statusPath}\nSet "journalDir" in config.json to: ${path.resolve(dir).replace(/\\/g, '\\\\')}\n`);

const interval = fast ? 1500 : 5000;
setInterval(() => {
  const action = actions[Math.floor(Math.random() * actions.length)];
  action();
}, interval);
