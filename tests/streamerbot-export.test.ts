import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../docs/streamerbot-export.js';

type Exporter = {
  buildExportDocument(config: Record<string, unknown>): Record<string, any>;
  createImportString(config: Record<string, unknown>): Promise<{
    importString: string;
    document: Record<string, any>;
    triggerIncluded: boolean;
    triggerLabel: string;
  }>;
  decodeImportString(value: string): Promise<Record<string, any>>;
  parseKeyboardShortcut(value: string): { key: number; modifiers: number };
  validateConfig(config: Record<string, unknown>): string[];
};

const exporter = (globalThis as typeof globalThis & {
  StreamerbotActionExport: Exporter;
}).StreamerbotActionExport;

function config(overrides: Record<string, unknown> = {}) {
  return {
    actionName: 'Docked at Jameson Memorial',
    trigger: { type: 'journal', event: 'Docked' },
    triggerPath: 'Custom → Elite Dangerous → Journal Events → Docked',
    conditions: [
      {
        token: '%edEvent_StationName%',
        operator: 'Equals (Ignore Case)',
        value: 'Jameson Memorial',
        type: 'string',
        autoType: true,
      },
      {
        token: '%edEvent_StationType%',
        operator: 'Contains',
        value: 'Coriolis',
        type: 'string',
        autoType: true,
      },
    ],
    outcomes: [
      {
        type: 'sound',
        file: 'C:\\Sounds\\docked.wav',
        wait: true,
        volume: 75,
      },
      {
        type: 'chat',
        platform: 'Twitch',
        message: 'Docked at %edEvent_StationName%',
      },
    ],
    ...overrides,
  };
}

function collectSubActions(items: Record<string, any>[]): Record<string, any>[] {
  return items.flatMap((item) => [
    item,
    ...(Array.isArray(item.subActions) ? collectSubActions(item.subActions) : []),
  ]);
}

test('builds nested editable If/Else groups and native outcome sub-actions', () => {
  const document = exporter.buildExportDocument(config());
  const action = document.data.actions[0];
  const firstCondition = action.subActions[0];

  assert.equal(action.triggers[0].type, 18002);
  assert.equal(action.triggers[0].eventName, 'ed.evt.Docked');
  assert.equal(firstCondition.type, 120);
  assert.equal(firstCondition.operation, 7);
  assert.equal(firstCondition.parentId, null);

  const firstTrue = firstCondition.subActions[0];
  const firstFalse = firstCondition.subActions[1];
  assert.equal(firstTrue.type, 99901);
  assert.equal(firstFalse.type, 99902);
  assert.equal(firstTrue.parentId, firstCondition.id);
  assert.deepEqual(firstFalse.subActions, []);

  const secondCondition = firstTrue.subActions[0];
  assert.equal(secondCondition.type, 120);
  assert.equal(secondCondition.operation, 2);
  assert.equal(secondCondition.parentId, firstTrue.id);

  const outcomes = secondCondition.subActions[0].subActions;
  assert.deepEqual(outcomes.map((item: Record<string, any>) => item.type), [1, 10]);
  assert.ok(outcomes.every((item: Record<string, any>) => item.parentId === secondCondition.subActions[0].id));

  const everySubAction = collectSubActions(action.subActions);
  assert.ok(!everySubAction.some((item) => item.type === 99999));
  assert.ok(!JSON.stringify(document).includes('byteCode'));
});

test('round-trips an SBAE import string and includes native command data', async () => {
  const commandConfig = config({
    trigger: {
      type: 'external',
      externalKind: 'twitch-command',
      externalLabel: '!whereami',
    },
    conditions: [],
  });
  const result = await exporter.createImportString(commandConfig);
  const decoded = await exporter.decodeImportString(result.importString);

  assert.match(result.importString, /^U0JBR/);
  assert.equal(result.triggerIncluded, true);
  assert.equal(result.triggerLabel, 'Twitch command !whereami');
  assert.equal(decoded.data.actions[0].triggers[0].type, 401);
  assert.equal(decoded.data.commands[0].command, '!whereami');
  assert.deepEqual(decoded, result.document);
});

test('uses the native type and field schema for every supported result', () => {
  const document = exporter.buildExportDocument(config({
    conditions: [],
    outcomes: [
      { type: 'sound', file: 'C:\\Sounds\\alert.wav', wait: false, volume: 25 },
      { type: 'tts', voiceAlias: 'Commander', message: 'Welcome back' },
      { type: 'chat', platform: 'Twitch', message: 'Twitch message' },
      { type: 'chat', platform: 'Kick', message: 'Kick message' },
      { type: 'chat', platform: 'YouTube', message: 'YouTube message' },
      { type: 'obs', scene: 'Live', source: 'Docked Alert', obsState: 'Toggle' },
      { type: 'run-action', actionName: 'ED Docked Visuals' },
      { type: 'keyboard', key: 'Ctrl+Shift+F1' },
    ],
  }));
  const items = document.data.actions[0].subActions;

  assert.deepEqual(items.map((item: Record<string, any>) => item.type), [
    1, 602, 10, 35001, 4001, 30, 4, 1012,
  ]);
  assert.equal(items[0].volume, 0.25);
  assert.equal(items[4].broadcast, 0);
  assert.equal(items[5].state, 2);
  assert.equal(items[6].actionId, '00000000-0000-0000-0000-000000000000');
  assert.equal(items[6].runImmedately, true);
  assert.equal(items[7].key, 112);
  assert.equal(items[7].modifiers, 6);
});

test('rejects options that cannot be represented as editable native sub-actions', () => {
  const errors = exporter.validateConfig(config({
    outcomes: [
      { type: 'chat', platform: 'YouTube', message: 'At %edEvent_StationName%' },
      { type: 'keyboard', key: 'Win+G' },
      { type: 'custom', searchName: 'Something unsupported' },
    ],
  }));

  assert.ok(errors.some((error) => error.includes('YouTube')));
  assert.ok(errors.some((error) => error.includes('Windows-key')));
  assert.ok(errors.some((error) => error.includes('specific supported sub-action')));
});

test('maps native Keyboard Press key and modifier values', () => {
  assert.deepEqual(exporter.parseKeyboardShortcut('Alt+Enter'), { key: 13, modifiers: 1 });
  assert.deepEqual(exporter.parseKeyboardShortcut('^{F12}'), { key: 123, modifiers: 2 });
  assert.deepEqual(exporter.parseKeyboardShortcut('Ctrl+Alt+Delete'), { key: 46, modifiers: 3 });
});
