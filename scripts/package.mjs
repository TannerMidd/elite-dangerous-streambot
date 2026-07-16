/**
 * Builds a standalone Windows executable using Node's Single Executable
 * Application support (no Node install needed on the target machine).
 *
 *   npm run package
 *
 * Output: release/elite-streambot/  (exe + public/ + rules/ + sounds/ …)
 * plus release/elite-streambot-win-x64.zip
 *
 * Steps: tsc → esbuild bundle (single CJS file) → SEA blob → copy node.exe →
 * postject blob injection → assemble release folder → zip.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { inject } from 'postject';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = path.join(root, 'build');
const releaseRoot = path.join(root, 'release');
const appDir = path.join(releaseRoot, 'elite-streambot');
const exeName = 'EliteStreambot.exe';

const run = (cmd, args, opts = {}) => {
  console.log(`> ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit', cwd: root, shell: process.platform === 'win32', ...opts });
};

if (process.platform !== 'win32') {
  console.error('Packaging currently targets Windows (SEA exe). Run this on a Windows machine.');
  process.exit(1);
}

// clean
fs.rmSync(build, { recursive: true, force: true });
fs.rmSync(appDir, { recursive: true, force: true });
fs.mkdirSync(build, { recursive: true });
fs.mkdirSync(appDir, { recursive: true });

// 1. compile TypeScript
run('npm', ['run', 'build']);

// 2. bundle to a single CommonJS file (SEA requires CJS)
console.log('> esbuild bundle');
await esbuild.build({
  entryPoints: [path.join(root, 'dist', 'index.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['fsevents'], // chokidar's optional macOS dep
  // Bakes the packaged-build flag in: appRoot() then resolves paths relative
  // to the exe instead of import.meta.url (which doesn't exist in the bundle).
  define: { 'process.env.ELITE_STREAMBOT_PACKAGED': '"1"' },
  outfile: path.join(build, 'bundle.cjs'),
});

// 3. SEA blob
const seaConfig = {
  main: path.join(build, 'bundle.cjs').replace(/\\/g, '/'),
  output: path.join(build, 'sea-prep.blob').replace(/\\/g, '/'),
  disableExperimentalSEAWarning: true,
};
fs.writeFileSync(path.join(build, 'sea-config.json'), JSON.stringify(seaConfig, null, 2));
run('node', ['--experimental-sea-config', path.join(build, 'sea-config.json')]);

// 4. copy the Node runtime and inject the blob
const exePath = path.join(appDir, exeName);
fs.copyFileSync(process.execPath, exePath);
console.log('> postject inject');
await inject(exePath, 'NODE_SEA_BLOB', fs.readFileSync(path.join(build, 'sea-prep.blob')), {
  sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
});

// 5. assemble the release folder — the exe expects these next to itself
const copyDir = (from, to) => fs.cpSync(path.join(root, from), path.join(appDir, to), { recursive: true });
copyDir('public', 'public');
copyDir('rules', 'rules');
if (!fs.existsSync(path.join(root, 'sounds'))) run('node', [path.join('tools', 'gen-sounds.mjs')]);
copyDir('sounds', 'sounds');
fs.copyFileSync(path.join(root, 'config.example.json'), path.join(appDir, 'config.example.json'));
fs.copyFileSync(path.join(root, 'README.md'), path.join(appDir, 'README.md'));
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(appDir, 'LICENSE'));
fs.writeFileSync(
  path.join(appDir, 'START HERE.txt'),
  [
    'Elite Streambot',
    '===============',
    '',
    '1. Double-click EliteStreambot.exe',
    '   (Windows SmartScreen may warn because the exe is unsigned —',
    '    choose "More info" -> "Run anyway".)',
    '2. Open http://localhost:8377 in your browser.',
    '3. In Streamer.bot: Servers/Clients -> WebSocket Server -> Start Server.',
    '',
    'To STOP the app: click the "Quit" button in the top-right of the',
    'dashboard, or close the black console window.',
    '',
    'Keep this whole folder together — the exe reads public/, rules/, and',
    'sounds/ from beside itself, and writes your settings to config.json here.',
    'Unzip to a normal folder (not Program Files) so it can save settings.',
    '',
    'Full documentation: README.md',
  ].join('\r\n'),
);

// 6. zip
const zipPath = path.join(releaseRoot, 'elite-streambot-win-x64.zip');
fs.rmSync(zipPath, { force: true });
run('powershell', ['-NoProfile', '-Command',
  `Compress-Archive -Path '${appDir}' -DestinationPath '${zipPath}'`]);

const size = (fs.statSync(exePath).size / 1024 / 1024).toFixed(1);
console.log(`\nDone.\n  exe:    ${exePath} (${size} MB)\n  folder: ${appDir}\n  zip:    ${zipPath}`);
