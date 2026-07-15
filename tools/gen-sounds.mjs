// Synthesizes the default alert sounds into sounds/*.wav (44.1kHz 16-bit mono).
// Run: node tools/gen-sounds.mjs
// Each alert gets a distinct, short, stream-friendly cue. Replace any of them
// with your own .wav/.mp3 in Streamer.bot whenever you like.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sounds');
fs.mkdirSync(outDir, { recursive: true });

function writeWav(name, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-1, Math.min(1, samples[i])) * 32767 | 0, 44 + i * 2);
  }
  fs.writeFileSync(path.join(outDir, name), buf);
  console.log('wrote', name, (n / RATE).toFixed(2) + 's');
}

const sec = (s) => Math.floor(s * RATE);

/** tone with quick attack + exponential decay envelope */
function tone(freq, dur, { amp = 0.45, decay = 4, shape = 'sine' } = {}) {
  const out = new Float32Array(sec(dur));
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.01) * Math.exp(-decay * t);
    const ph = 2 * Math.PI * freq * t;
    const s = shape === 'square' ? Math.sign(Math.sin(ph)) * 0.6 : Math.sin(ph);
    out[i] = s * amp * env;
  }
  return out;
}

/** frequency sweep from f0 to f1 */
function sweep(f0, f1, dur, { amp = 0.45, decay = 2 } = {}) {
  const out = new Float32Array(sec(dur));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const f = f0 + (f1 - f0) * (t / dur);
    phase += (2 * Math.PI * f) / RATE;
    const env = Math.min(1, t / 0.01) * Math.exp(-decay * t);
    out[i] = Math.sin(phase) * amp * env;
  }
  return out;
}

function silence(dur) { return new Float32Array(sec(dur)); }

function concat(...parts) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function mixdown(...parts) {
  const len = Math.max(...parts.map((p) => p.length));
  const out = new Float32Array(len);
  for (const p of parts) for (let i = 0; i < p.length; i++) out[i] += p[i];
  return out;
}

// note frequencies
const N = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, G4: 392, A4: 440, E6: 1318.5, G6: 1568, B6: 1975.5, D5: 587.33 };

// Docked — soft two-tone chime
writeWav('docked.wav', concat(tone(N.C5, 0.35, { decay: 5 }), tone(N.G5, 0.55, { decay: 4 })));

// Interdicted — urgent triple beep
writeWav('interdicted.wav', concat(
  tone(N.A4, 0.14, { decay: 8, shape: 'square' }), silence(0.05),
  tone(N.A4, 0.14, { decay: 8, shape: 'square' }), silence(0.05),
  tone(N.A4 * 1.5, 0.3, { decay: 6, shape: 'square' }),
));

// Thargoid — low ominous drone slide
writeWav('thargoid.wav', mixdown(sweep(160, 70, 1.4, { decay: 1.5 }), sweep(163, 72, 1.4, { amp: 0.3, decay: 1.5 })));

// Died — descending fall
writeWav('died.wav', sweep(440, 110, 1.1, { decay: 1.8 }));

// Big bounty — coin arpeggio up
writeWav('big-bounty.wav', concat(
  tone(N.C5, 0.12, { decay: 7 }), tone(N.E5, 0.12, { decay: 7 }),
  tone(N.G5, 0.12, { decay: 7 }), tone(N.C6, 0.5, { decay: 4 }),
));

// Rank up — little fanfare
writeWav('rank-up.wav', concat(
  tone(N.G4, 0.15, { decay: 6 }), tone(N.C5, 0.15, { decay: 6 }),
  tone(N.E5, 0.15, { decay: 6 }), mixdown(tone(N.G5, 0.7, { decay: 3 }), tone(N.C5, 0.7, { amp: 0.25, decay: 3 })),
));

// Low fuel — klaxon
writeWav('low-fuel.wav', concat(
  tone(600, 0.2, { decay: 3, shape: 'square', amp: 0.35 }), tone(450, 0.2, { decay: 3, shape: 'square', amp: 0.35 }),
  tone(600, 0.2, { decay: 3, shape: 'square', amp: 0.35 }), tone(450, 0.35, { decay: 3, shape: 'square', amp: 0.35 }),
));

// First discovery — sparkle
writeWav('first-discovery.wav', concat(
  tone(N.E6, 0.12, { decay: 6 }), tone(N.G6, 0.12, { decay: 6 }), tone(N.B6, 0.6, { decay: 3.5 }),
));

// Mission complete — success two-note
writeWav('mission-complete.wav', concat(tone(N.G5, 0.16, { decay: 6 }), tone(N.C6, 0.55, { decay: 4 })));

// Jump milestone — rising whoosh
writeWav('jump-milestone.wav', concat(sweep(200, 900, 0.7, { decay: 1.2 }), tone(N.D5 * 2, 0.35, { decay: 5 })));

console.log('\nAll sounds written to', outDir);
