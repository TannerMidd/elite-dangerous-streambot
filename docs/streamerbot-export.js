(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.StreamerbotActionExport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EXPORT_HEADER = new Uint8Array([0x53, 0x42, 0x41, 0x45]); // SBAE
  const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";

  const CONDITION_OPERATIONS = Object.freeze({
    "Equals": 0,
    "Not Equals": 1,
    "Contains": 2,
    "Regex Match": 3,
    "Less Than": 4,
    "Greater Than": 5,
    "Equals (Ignore Case)": 7,
    "Not Equals (Ignore Case)": 8,
    "Is Null or Empty": 9
  });

  const OBS_STATES = Object.freeze({
    "Visible": 0,
    "Hidden": 1,
    "Toggle": 2
  });

  const KEY_CODES = Object.freeze({
    BACKSPACE: 8,
    BKSP: 8,
    TAB: 9,
    ENTER: 13,
    RETURN: 13,
    PAUSE: 19,
    CAPSLOCK: 20,
    ESC: 27,
    ESCAPE: 27,
    SPACE: 32,
    SPACEBAR: 32,
    PGUP: 33,
    PAGEUP: 33,
    PGDN: 34,
    PAGEDOWN: 34,
    END: 35,
    HOME: 36,
    LEFT: 37,
    UP: 38,
    RIGHT: 39,
    DOWN: 40,
    PRTSC: 44,
    PRINTSCREEN: 44,
    INSERT: 45,
    INS: 45,
    DELETE: 46,
    DEL: 46,
    APPS: 93,
    NUMPAD0: 96,
    NUMPAD1: 97,
    NUMPAD2: 98,
    NUMPAD3: 99,
    NUMPAD4: 100,
    NUMPAD5: 101,
    NUMPAD6: 102,
    NUMPAD7: 103,
    NUMPAD8: 104,
    NUMPAD9: 105,
    MULTIPLY: 106,
    ADD: 107,
    SEPARATOR: 108,
    SUBTRACT: 109,
    DECIMAL: 110,
    DIVIDE: 111,
    NUMLOCK: 144,
    SCROLLLOCK: 145,
    VOLUMEMUTE: 173,
    VOLUMEDOWN: 174,
    VOLUMEUP: 175,
    MEDIANEXT: 176,
    MEDIAPREVIOUS: 177,
    MEDIASTOP: 178,
    MEDIAPLAYPAUSE: 179,
    PLUS: 187,
    COMMA: 188,
    MINUS: 189,
    PERIOD: 190
  });

  function createImportString(config) {
    const document = buildExportDocument(config);
    const triggerInfo = getTriggerExportInfo(config);
    return encodeDocument(document).then((importString) => ({
      importString,
      document,
      triggerIncluded: triggerInfo.included,
      triggerKind: triggerInfo.kind,
      triggerLabel: triggerInfo.label,
      command: triggerInfo.kind === "command" ? triggerInfo.command : "",
      manualTriggerPath: triggerInfo.included ? "" : String(config.triggerPath || "")
    }));
  }

  function buildExportDocument(config) {
    const errors = validateConfig(config);
    if (errors.length) throw validationError(errors);

    const actionId = guid();
    const triggerInfo = getTriggerExportInfo(config);
    const triggers = [];
    const commands = [];

    if (triggerInfo.kind === "command") {
      const commandId = guid();
      triggers.push({
        commandId,
        id: guid(),
        type: 401,
        enabled: true,
        exclusions: []
      });
      commands.push(buildCommand(config, commandId, triggerInfo.command));
    } else if (triggerInfo.kind === "custom-code-event") {
      triggers.push({
        name: triggerInfo.label,
        eventName: triggerInfo.eventName,
        id: guid(),
        type: 18002,
        enabled: true,
        exclusions: []
      });
    }

    const triggerDescription = triggerInfo.included
      ? `Includes the ${triggerInfo.label} trigger.`
      : `After import, attach this trigger: ${String(config.triggerPath || "the selected trigger")}.`;
    const runActionDescription = getAllConfiguredOutcomes(config).some((outcome) => outcome.type === "run-action")
      ? " Run Action targets are installation-specific; open that sub-action after import and select the named target."
      : "";

    return {
      meta: {
        name: String(config.actionName).trim(),
        author: "Elite Dangerous Streambot Action Builder",
        version: "1.2.0",
        description: `Generated for the standalone Elite Dangerous C# watcher. ${triggerDescription}${runActionDescription}`,
        autoRunAction: null,
        minimumVersion: null
      },
      data: {
        actions: [{
          id: actionId,
          queue: EMPTY_GUID,
          enabled: true,
          excludeFromHistory: false,
          excludeFromPending: false,
          name: String(config.actionName).trim(),
          group: "Elite Dangerous",
          alwaysRun: false,
          randomAction: false,
          concurrent: false,
          triggers,
          subActions: buildNativeSubActions(config),
          collapsedGroups: []
        }],
        queues: [],
        commands,
        websocketServers: [],
        websocketClients: [],
        timers: []
      },
      version: 23,
      exportedFrom: "1.0.4",
      minimumVersion: "1.0.0-alpha.1"
    };
  }

  function buildCommand(config, commandId, commandName) {
    return {
      permittedUsers: [],
      permittedGroups: [],
      id: commandId,
      name: `${String(config.actionName).trim()} - ${commandName}`,
      enabled: true,
      include: true,
      mode: 0,
      command: commandName,
      regexExplicitCapture: false,
      location: 0,
      ignoreBotAccount: true,
      ignoreInternal: false,
      sources: config.trigger.externalKind === "youtube-command" ? 1024 : 1,
      persistCounter: false,
      persistUserCounter: false,
      caseSensitive: false,
      globalCooldown: 0,
      userCooldown: 0,
      group: "Elite Dangerous",
      grantType: 0
    };
  }

  function buildNativeSubActions(config) {
    const decision = normalizeDecisionModel(config);
    const buildDecision = (parentId) => buildDecisionBranch(decision, 0, parentId);

    if (!decision.automaticConditions.length) {
      return buildDecision(null);
    }

    return [buildConditionExpression(
      decision.automaticConditions,
      "all",
      0,
      null,
      0,
      (successParentId) => buildDecision(successParentId),
      () => []
    )];
  }

  function normalizeDecisionModel(config) {
    const value = config && typeof config === "object" ? config : {};
    const automaticConditions = Array.isArray(value.automaticConditions) ? value.automaticConditions : [];
    const hasBranches = Array.isArray(value.branches) && value.branches.length > 0;
    const branches = hasBranches
      ? value.branches.map((branch) => ({
        mode: branch && branch.mode === "any" ? "any" : "all",
        conditions: branch && Array.isArray(branch.conditions) ? branch.conditions : [],
        outcomes: branch && Array.isArray(branch.outcomes) ? branch.outcomes : []
      }))
      : [{
        mode: value.conditionMode === "any" ? "any" : "all",
        conditions: Array.isArray(value.conditions) ? value.conditions : [],
        outcomes: Array.isArray(value.outcomes) ? value.outcomes : []
      }];

    return {
      automaticConditions,
      branches,
      elseOutcomes: Array.isArray(value.elseOutcomes) ? value.elseOutcomes : []
    };
  }

  function getAllConfiguredOutcomes(config) {
    const decision = normalizeDecisionModel(config);
    return [
      ...decision.branches.flatMap((branch) => branch.outcomes),
      ...decision.elseOutcomes
    ];
  }

  function buildDecisionBranch(decision, branchIndex, parentId) {
    if (branchIndex >= decision.branches.length) {
      return buildOutcomeList(decision.elseOutcomes, parentId);
    }

    const branch = decision.branches[branchIndex];
    if (!branch.conditions.length) {
      return buildOutcomeList(branch.outcomes, parentId);
    }

    return [buildConditionExpression(
      branch.conditions,
      branch.mode,
      0,
      parentId,
      0,
      (successParentId) => buildOutcomeList(branch.outcomes, successParentId),
      (failureParentId) => buildDecisionBranch(decision, branchIndex + 1, failureParentId)
    )];
  }

  function buildOutcomeList(outcomes, parentId) {
    return outcomes.map((outcome, index) => buildNativeOutcome(outcome, parentId, index));
  }

  function buildConditionExpression(conditions, mode, conditionIndex, parentId, index, onSuccess, onFailure) {
    const condition = conditions[conditionIndex];
    const conditionId = guid();
    const trueGroupId = guid();
    const falseGroupId = guid();
    const isLast = conditionIndex + 1 >= conditions.length;
    const trueChildren = mode === "any"
      ? onSuccess(trueGroupId)
      : isLast
        ? onSuccess(trueGroupId)
        : [buildConditionExpression(
          conditions,
          mode,
          conditionIndex + 1,
          trueGroupId,
          0,
          onSuccess,
          onFailure
        )];
    const falseChildren = mode === "any" && !isLast
      ? [buildConditionExpression(
        conditions,
        mode,
        conditionIndex + 1,
        falseGroupId,
        0,
        onSuccess,
        onFailure
      )]
      : onFailure(falseGroupId);

    const trueGroup = {
      random: false,
      subActions: trueChildren,
      id: trueGroupId,
      weight: 0,
      type: 99901,
      parentId: conditionId,
      enabled: true,
      index: 0
    };
    const falseGroup = {
      random: false,
      subActions: falseChildren,
      id: falseGroupId,
      weight: 0,
      type: 99902,
      parentId: conditionId,
      enabled: true,
      index: 1
    };

    return {
      input: String(condition.token || ""),
      operation: CONDITION_OPERATIONS[condition.operator],
      value: condition.operator === "Is Null or Empty" ? null : String(condition.value ?? ""),
      autoType: condition.autoType !== false,
      subActions: [trueGroup, falseGroup],
      id: conditionId,
      weight: 0,
      type: 120,
      parentId,
      enabled: true,
      index
    };
  }

  function buildNativeOutcome(outcome, parentId, index) {
    switch (outcome.type) {
      case "sound":
        return nativeSubAction(1, parentId, index, {
          device: null,
          soundFile: String(outcome.file || ""),
          finishBeforeContinuing: outcome.wait !== false,
          volume: Number(outcome.volume) / 100,
          soundName: "",
          useFileNameAsName: true
        });
      case "tts":
        return nativeSubAction(602, parentId, index, {
          alias: String(outcome.voiceAlias || ""),
          message: String(outcome.message || ""),
          badWordFilter: false,
          delay: false,
          silent: false
        });
      case "chat": {
        const type = outcome.platform === "YouTube" ? 4001 : outcome.platform === "Kick" ? 35001 : 10;
        const fields = {
          text: String(outcome.message || ""),
          useBot: true,
          fallback: true
        };
        if (type === 4001) fields.broadcast = 0;
        return nativeSubAction(type, parentId, index, fields);
      }
      case "obs":
        return nativeSubAction(30, parentId, index, {
          sceneName: String(outcome.scene || ""),
          sourceName: String(outcome.source || ""),
          state: OBS_STATES[outcome.obsState] ?? 0,
          connectionId: EMPTY_GUID
        });
      case "run-action":
        return nativeSubAction(4, parentId, index, {
          actionId: EMPTY_GUID,
          runImmedately: true
        });
      case "keyboard": {
        const shortcut = parseKeyboardShortcut(outcome.key);
        return nativeSubAction(1012, parentId, index, {
          key: shortcut.key,
          modifiers: shortcut.modifiers
        });
      }
      default:
        throw validationError(["Choose a specific supported sub-action before creating a native import."]);
    }
  }

  function nativeSubAction(type, parentId, index, fields) {
    return {
      ...fields,
      id: guid(),
      weight: 0,
      type,
      parentId,
      enabled: true,
      index
    };
  }

  function getTriggerExportInfo(config) {
    const trigger = config && config.trigger ? config.trigger : {};

    if (trigger.type === "external") {
      if (trigger.externalKind === "twitch-command" || trigger.externalKind === "youtube-command") {
        const platform = trigger.externalKind === "youtube-command" ? "YouTube" : "Twitch";
        const command = normalizeCommand(trigger.externalLabel);
        return {
          included: true,
          kind: "command",
          label: `${platform} command ${command}`,
          command
        };
      }
      return {
        included: false,
        kind: "manual",
        label: String(config.triggerPath || "the selected trigger")
      };
    }

    if (trigger.type === "flag") {
      const edge = trigger.edge === "off" ? "Off" : "On";
      return {
        included: true,
        kind: "custom-code-event",
        label: `${trigger.flag} ${edge}`,
        eventName: `ed.flag.${trigger.flag}.${trigger.edge === "off" ? "off" : "on"}`
      };
    }

    if (trigger.type === "companion") {
      return {
        included: true,
        kind: "custom-code-event",
        label: "Companion File Updated",
        eventName: "ed.companion.updated"
      };
    }

    if (trigger.type === "watcher") {
      return {
        included: true,
        kind: "custom-code-event",
        label: "Watcher Status",
        eventName: "ed.watcher.status"
      };
    }

    const event = trigger.event === "__any__" ? "Any Journal Event" : String(trigger.event || "Docked");
    return {
      included: true,
      kind: "custom-code-event",
      label: event,
      eventName: trigger.event === "__any__" ? "ed.journal.event" : `ed.evt.${sanitizeEventName(event)}`
    };
  }

  function validateConfig(config) {
    const errors = [];
    const value = config && typeof config === "object" ? config : {};
    const trigger = value.trigger && typeof value.trigger === "object" ? value.trigger : {};
    const decision = normalizeDecisionModel(value);
    const allOutcomes = getAllConfiguredOutcomes(value);

    if (!String(value.actionName || "").trim()) errors.push("Enter an action name before creating the import string.");
    if (!allOutcomes.length) errors.push("Add at least one sub-action before creating the import string.");

    if (includesCommandTrigger(value)) {
      const label = String(trigger.externalLabel || "").trim();
      if (!label) {
        errors.push("Enter the Twitch or YouTube command to include.");
      } else if (/\s/.test(label)) {
        errors.push("Use one command with no spaces, such as !whereami.");
      } else if (normalizeCommand(label).length < 2) {
        errors.push("Enter a command name after the exclamation mark.");
      }
    }

    if (
      (decision.branches.length > 1 || decision.elseOutcomes.length > 0) &&
      decision.branches[0] &&
      decision.branches[0].conditions.length === 0
    ) {
      errors.push("Add at least one condition to the IF branch before using ELSE IF or ELSE.");
    }

    validateConditionList(decision.automaticConditions, "Automatic condition", errors);
    decision.branches.forEach((branch, branchIndex) => {
      const conditionLabel = branchIndex === 0 ? "Condition" : `Else-if ${branchIndex} condition`;
      const outcomeLabel = branchIndex === 0 ? "" : `Else-if ${branchIndex}`;

      if (branchIndex > 0 && branch.conditions.length === 0) {
        errors.push(`Else-if ${branchIndex} needs at least one condition.`);
      }
      if (branch.conditions.length > 0 && branch.outcomes.length === 0) {
        errors.push(`${branchIndex === 0 ? "The IF branch" : `Else-if ${branchIndex}`} needs at least one sub-action.`);
      }

      validateConditionList(branch.conditions, conditionLabel, errors);
      validateOutcomeList(branch.outcomes, outcomeLabel, errors);
    });
    validateOutcomeList(decision.elseOutcomes, "Else", errors);

    return [...new Set(errors)];
  }

  function validateConditionList(conditions, label, errors) {
    conditions.forEach((condition, index) => {
      const number = index + 1;
      const subject = `${label} ${number}`;
      const token = String(condition.token || "");
      const operator = String(condition.operator || "");
      const type = String(condition.type || "string");

      if (!(/^%[^%]+%$/.test(token) || /^~[^~]+~$/.test(token))) {
        errors.push(`${subject} needs a valid %argument% or ~persistedGlobal~ token.`);
      }
      if (!Object.prototype.hasOwnProperty.call(CONDITION_OPERATIONS, operator)) {
        errors.push(`${subject} uses an unsupported operator.`);
      }
      if (!["string", "number", "boolean"].includes(type)) errors.push(`${subject} uses an unsupported value type.`);
      if (operator !== "Is Null or Empty" && !String(condition.value ?? "").trim()) {
        errors.push(`${subject} needs a comparison value.`);
      }
      if (type === "number" && operator !== "Is Null or Empty" && !Number.isFinite(Number(condition.value))) {
        errors.push(`${subject} needs a numeric comparison value.`);
      }
      if (type === "boolean" && operator !== "Is Null or Empty" && !/^(true|false)$/i.test(String(condition.value))) {
        errors.push(`${subject} needs True or False.`);
      }
    });
  }

  function validateOutcomeList(outcomes, label, errors) {
    outcomes.forEach((outcome, index) => {
      const number = index + 1;
      const subject = label ? `${label} sub-action ${number}` : `Sub-action ${number}`;
      switch (outcome.type) {
        case "sound": {
          if (!String(outcome.file || "").trim()) errors.push(`${subject}: choose a sound file.`);
          const volume = Number(outcome.volume);
          if (!Number.isFinite(volume) || volume < 0 || volume > 100) {
            errors.push(`${subject}: volume must be from 0 to 100.`);
          }
          break;
        }
        case "tts":
          if (!String(outcome.voiceAlias || "").trim()) errors.push(`${subject}: enter the Speaker.bot voice alias.`);
          if (!String(outcome.message || "").trim()) errors.push(`${subject}: enter the text to speak.`);
          break;
        case "chat":
          if (!["Twitch", "Kick", "YouTube"].includes(outcome.platform)) errors.push(`${subject}: choose a supported chat platform.`);
          if (!String(outcome.message || "").trim()) errors.push(`${subject}: enter the chat message.`);
          if (outcome.platform === "YouTube" && extractTokens(outcome.message).length) {
            errors.push(`${subject}: YouTube's native Send Message sub-action only supports plain text.`);
          }
          break;
        case "obs":
          if (!String(outcome.scene || "").trim() || !String(outcome.source || "").trim()) {
            errors.push(`${subject}: choose both the OBS scene and source.`);
          }
          break;
        case "run-action":
          if (!String(outcome.actionName || "").trim()) errors.push(`${subject}: enter the action to run.`);
          break;
        case "keyboard":
          try {
            parseKeyboardShortcut(outcome.key);
          } catch (error) {
            errors.push(`${subject}: ${error.message}`);
          }
          break;
        case "custom":
          errors.push(`${subject}: choose a specific supported sub-action before creating a native import.`);
          break;
        default:
          errors.push(`${subject}: choose a supported sub-action type.`);
          break;
      }
    });
  }

  function includesCommandTrigger(config) {
    const trigger = config && config.trigger;
    return Boolean(
      trigger &&
      trigger.type === "external" &&
      (trigger.externalKind === "twitch-command" || trigger.externalKind === "youtube-command")
    );
  }

  function normalizeCommand(value) {
    const command = String(value || "").trim();
    return command.startsWith("!") ? command : `!${command}`;
  }

  function parseKeyboardShortcut(value) {
    const input = String(value || "").trim();
    if (!input) throw new Error("choose the key or shortcut.");

    const sendKeys = input.match(/^([+^%]*)\{([^{}]+)\}$/);
    if (sendKeys) {
      return {
        key: resolveKeyCode(sendKeys[2]),
        modifiers:
          (sendKeys[1].includes("%") ? 1 : 0) |
          (sendKeys[1].includes("^") ? 2 : 0) |
          (sendKeys[1].includes("+") ? 4 : 0)
      };
    }

    const parts = input.split("+").map((part) => part.trim()).filter(Boolean);
    let modifiers = 0;
    let keyName = "";

    parts.forEach((part) => {
      const normalized = part.toLowerCase();
      if (normalized === "alt") {
        modifiers |= 1;
      } else if (normalized === "ctrl" || normalized === "control") {
        modifiers |= 2;
      } else if (normalized === "shift") {
        modifiers |= 4;
      } else if (normalized === "win" || normalized === "windows" || normalized === "meta" || normalized === "cmd") {
        throw new Error("Windows-key modifiers are not supported by Streamer.bot's Keyboard Press sub-action.");
      } else if (keyName) {
        throw new Error("enter one key plus optional Ctrl, Shift, or Alt modifiers.");
      } else {
        keyName = part;
      }
    });

    if (!keyName) throw new Error("choose a non-modifier key.");
    return { key: resolveKeyCode(keyName), modifiers };
  }

  function resolveKeyCode(value) {
    const normalized = String(value || "")
      .trim()
      .replace(/[\s_-]+/g, "")
      .toUpperCase();

    if (/^[A-Z]$/.test(normalized) || /^[0-9]$/.test(normalized)) {
      return normalized.charCodeAt(0);
    }
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(normalized)) {
      return 111 + Number(normalized.slice(1));
    }
    if (Object.prototype.hasOwnProperty.call(KEY_CODES, normalized)) {
      return KEY_CODES[normalized];
    }
    throw new Error(`"${value}" is not a supported Keyboard Press key.`);
  }

  function extractTokens(text) {
    return String(text || "").match(/%[^%\r\n]+%|~[^~\r\n]+~/g) || [];
  }

  function sanitizeEventName(value) {
    return String(value || "").replace(/[^A-Za-z0-9_]/g, "");
  }

  async function encodeDocument(document) {
    const jsonBytes = new TextEncoder().encode(JSON.stringify(document));
    const compressed = await gzip(jsonBytes);
    const payload = new Uint8Array(EXPORT_HEADER.length + compressed.length);
    payload.set(EXPORT_HEADER, 0);
    payload.set(compressed, EXPORT_HEADER.length);
    return bytesToBase64(payload);
  }

  async function decodeImportString(value) {
    const payload = base64ToBytes(String(value || "").replace(/\s+/g, ""));
    if (
      payload.length < 5 ||
      payload[0] !== EXPORT_HEADER[0] ||
      payload[1] !== EXPORT_HEADER[1] ||
      payload[2] !== EXPORT_HEADER[2] ||
      payload[3] !== EXPORT_HEADER[3]
    ) {
      throw new Error("This is not a Streamer.bot SBAE import string.");
    }
    const jsonBytes = await gunzip(payload.slice(EXPORT_HEADER.length));
    return JSON.parse(new TextDecoder().decode(jsonBytes));
  }

  async function gzip(bytes) {
    if (typeof CompressionStream === "function") {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    if (typeof require === "function") {
      return new Uint8Array(require("zlib").gzipSync(bytes));
    }
    throw new Error("This browser cannot create gzip data. Use a current Chrome, Edge, Firefox, or Safari release.");
  }

  async function gunzip(bytes) {
    if (typeof DecompressionStream === "function") {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    if (typeof require === "function") {
      return new Uint8Array(require("zlib").gunzipSync(bytes));
    }
    throw new Error("This browser cannot read gzip data.");
  }

  function bytesToBase64(bytes) {
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64"));
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  function guid() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      const result = character === "x" ? random : (random & 0x3) | 0x8;
      return result.toString(16);
    });
  }

  function validationError(errors) {
    const error = new Error(errors[0]);
    error.validationErrors = errors;
    return error;
  }

  return {
    buildExportDocument,
    buildNativeSubActions,
    createImportString,
    decodeImportString,
    getTriggerExportInfo,
    includesCommandTrigger,
    normalizeCommand,
    parseKeyboardShortcut,
    validateConfig
  };
});
