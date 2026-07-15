import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_TITLE = 'SimStarr Elite Data';

export interface AppConfig {
  /** Dashboard title — click it in the header to rename. */
  appTitle: string;
  /** Elite Dangerous journal directory. Auto-detected when null. */
  journalDir: string | null;
  /** Port for the local dashboard UI. */
  uiPort: number;
  /**
   * Interface the dashboard binds to. Keep the loopback default: rule
   * conditions are executable JavaScript, so exposing the API to the network
   * hands code execution to anyone who can reach it. Only change this if you
   * fully trust every device on the network.
   */
  uiHost: string;
  streamerbot: {
    host: string;
    port: number;
    endpoint: string;
  };
  /** Directory containing rule files (.yaml/.yml/.json). */
  rulesDir: string;
}

const DEFAULTS: AppConfig = {
  appTitle: DEFAULT_TITLE,
  journalDir: null,
  uiPort: 8377,
  uiHost: '127.0.0.1',
  streamerbot: { host: '127.0.0.1', port: 8080, endpoint: '/' },
  rulesDir: 'rules',
};

export function defaultJournalDir(): string {
  return path.join(os.homedir(), 'Saved Games', 'Frontier Developments', 'Elite Dangerous');
}

/** Raw config.json contents (no defaults applied) — used when saving so we
 *  don't bake resolved paths into the user's file. */
export function readRawConfig(root: string): Partial<AppConfig> {
  const file = path.join(root, 'config.json');
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

export function writeRawConfig(root: string, raw: Partial<AppConfig>): void {
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify(raw, null, 2), 'utf8');
}

export function loadConfig(root: string): AppConfig {
  const file = path.join(root, 'config.json');
  let overrides: Partial<AppConfig> = {};
  if (fs.existsSync(file)) {
    try {
      overrides = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      console.error(`[config] Failed to parse ${file}, using defaults:`, err);
    }
  }
  const config: AppConfig = {
    ...DEFAULTS,
    ...overrides,
    streamerbot: { ...DEFAULTS.streamerbot, ...(overrides.streamerbot ?? {}) },
  };
  if (!config.journalDir) config.journalDir = defaultJournalDir();
  if (!path.isAbsolute(config.rulesDir)) config.rulesDir = path.join(root, config.rulesDir);
  return config;
}
