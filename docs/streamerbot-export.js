(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.StreamerbotActionExport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EXPORT_HEADER = new Uint8Array([0x53, 0x42, 0x41, 0x45]); // SBAE
  const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";
  const SUPPORTED_OPERATORS = new Set([
    "Equals (Ignore Case)",
    "Not Equals (Ignore Case)",
    "Equals",
    "Not Equals",
    "Contains",
    "Regex Match",
    "Is Null or Empty",
    "Greater Than",
    "Less Than"
  ]);

  function createImportString(config) {
    const document = buildExportDocument(config);
    return encodeDocument(document).then((importString) => ({
      importString,
      document,
      triggerIncluded: includesCommandTrigger(config),
      command: includesCommandTrigger(config) ? normalizeCommand(config.trigger.externalLabel) : "",
      manualTriggerPath: includesCommandTrigger(config) ? "" : String(config.triggerPath || "")
    }));
  }

  function buildExportDocument(config) {
    const errors = validateConfig(config);
    if (errors.length) throw validationError(errors);

    const actionId = guid();
    const subActionId = guid();
    const commandTrigger = includesCommandTrigger(config);
    const commandId = commandTrigger ? guid() : null;
    const commandName = commandTrigger ? normalizeCommand(config.trigger.externalLabel) : "";
    const source = buildCSharpUnchecked(config);
    const triggerDescription = commandTrigger
      ? `Includes the ${config.trigger.externalKind === "youtube-command" ? "YouTube" : "Twitch"} command ${commandName}.`
      : `After import, attach this trigger: ${String(config.triggerPath || "the selected trigger")}.`;

    const action = {
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
      triggers: commandTrigger ? [{
        commandId,
        id: guid(),
        type: 401,
        enabled: true,
        exclusions: []
      }] : [],
      subActions: [{
        name: "Generated Elite Dangerous action",
        description: "Generated conditions and outcomes. Edit this code block or rebuild the import string to change the recipe.",
        references: [
          "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\mscorlib.dll",
          "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.dll"
        ],
        byteCode: utf8ToBase64(source),
        precompile: true,
        delayStart: false,
        saveResultToVariable: false,
        saveToVariable: "",
        id: subActionId,
        weight: 0,
        type: 99999,
        parentId: null,
        enabled: true,
        index: 0
      }],
      collapsedGroups: []
    };

    const commands = commandTrigger ? [{
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
    }] : [];

    return {
      meta: {
        name: String(config.actionName).trim(),
        author: "Elite Dangerous Streambot Action Builder",
        version: "1.0.0",
        description: `Generated for the standalone Elite Dangerous C# watcher. ${triggerDescription}`,
        autoRunAction: null,
        minimumVersion: null
      },
      data: {
        actions: [action],
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

  function buildCSharp(config) {
    const errors = validateConfig(config);
    if (errors.length) throw validationError(errors);
    return buildCSharpUnchecked(config);
  }

  function buildCSharpUnchecked(config) {
    const lines = [
      "using System;",
      "using System.Globalization;",
      "using System.Text.RegularExpressions;",
      "",
      "public class CPHInline",
      "{",
      "    public bool Execute()",
      "    {"
    ];

    (config.conditions || []).forEach((condition) => {
      lines.push(
        `        if (!Matches(ReadValue(${csharpString(condition.token)}), ${csharpString(condition.operator)}, ${csharpString(condition.value)}, ${csharpString(condition.type || "string")})) return true;`
      );
    });

    if ((config.conditions || []).length && (config.outcomes || []).length) lines.push("");

    (config.outcomes || []).forEach((outcome, index) => {
      appendOutcome(lines, outcome, index);
    });

    lines.push(
      "        return true;",
      "    }",
      "",
      "    private object ReadValue(string token)",
      "    {",
      "        if (String.IsNullOrEmpty(token)) return null;",
      "        if (token.Length > 2 && token[0] == '%' && token[token.Length - 1] == '%')",
      "        {",
      "            object value;",
      "            return CPH.TryGetArg<object>(token.Substring(1, token.Length - 2), out value) ? value : null;",
      "        }",
      "        if (token.Length > 2 && token[0] == '~' && token[token.Length - 1] == '~')",
      "        {",
      "            return CPH.GetGlobalVar<object>(token.Substring(1, token.Length - 2), true);",
      "        }",
      "        return token;",
      "    }",
      "",
      "    private string Resolve(string template)",
      "    {",
      "        if (String.IsNullOrEmpty(template)) return String.Empty;",
      "        return Regex.Replace(template, @\"%[^%\\r\\n]+%|~[^~\\r\\n]+~\", delegate(Match match)",
      "        {",
      "            return ToText(ReadValue(match.Value));",
      "        });",
      "    }",
      "",
      "    private string ToText(object value)",
      "    {",
      "        if (value == null) return String.Empty;",
      "        IFormattable formattable = value as IFormattable;",
      "        return formattable == null ? value.ToString() : formattable.ToString(null, CultureInfo.InvariantCulture);",
      "    }",
      "",
      "    private bool Matches(object actual, string operation, string expected, string valueType)",
      "    {",
      "        string actualText = ToText(actual);",
      "        if (operation == \"Is Null or Empty\") return String.IsNullOrEmpty(actualText);",
      "",
      "        if (valueType == \"number\")",
      "        {",
      "            decimal actualNumber;",
      "            decimal expectedNumber;",
      "            if (!TryDecimal(actualText, out actualNumber) || !TryDecimal(expected, out expectedNumber)) return false;",
      "            if (operation == \"Greater Than\") return actualNumber > expectedNumber;",
      "            if (operation == \"Less Than\") return actualNumber < expectedNumber;",
      "            if (operation == \"Not Equals\" || operation == \"Not Equals (Ignore Case)\") return actualNumber != expectedNumber;",
      "            return actualNumber == expectedNumber;",
      "        }",
      "",
      "        if (valueType == \"boolean\")",
      "        {",
      "            bool actualBoolean;",
      "            bool expectedBoolean;",
      "            if (!Boolean.TryParse(actualText, out actualBoolean) || !Boolean.TryParse(expected, out expectedBoolean)) return false;",
      "            return operation == \"Not Equals\" || operation == \"Not Equals (Ignore Case)\"",
      "                ? actualBoolean != expectedBoolean",
      "                : actualBoolean == expectedBoolean;",
      "        }",
      "",
      "        if (operation == \"Equals (Ignore Case)\") return String.Equals(actualText, expected, StringComparison.OrdinalIgnoreCase);",
      "        if (operation == \"Not Equals (Ignore Case)\") return !String.Equals(actualText, expected, StringComparison.OrdinalIgnoreCase);",
      "        if (operation == \"Equals\") return String.Equals(actualText, expected, StringComparison.Ordinal);",
      "        if (operation == \"Not Equals\") return !String.Equals(actualText, expected, StringComparison.Ordinal);",
      "        if (operation == \"Contains\") return actualText.IndexOf(expected, StringComparison.Ordinal) >= 0;",
      "        if (operation == \"Regex Match\")",
      "        {",
      "            try",
      "            {",
      "                return Regex.IsMatch(actualText, expected);",
      "            }",
      "            catch (ArgumentException ex)",
      "            {",
      "                CPH.LogWarn(\"[ED Builder] Invalid regular expression: \" + ex.Message);",
      "                return false;",
      "            }",
      "        }",
      "        return false;",
      "    }",
      "",
      "    private bool TryDecimal(string value, out decimal result)",
      "    {",
      "        return Decimal.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out result)",
      "            || Decimal.TryParse(value, NumberStyles.Any, CultureInfo.CurrentCulture, out result);",
      "    }",
      "}"
    );

    return lines.join("\r\n");
  }

  function appendOutcome(lines, outcome, index) {
    switch (outcome.type) {
      case "tts":
        lines.push(`        CPH.TtsSpeak(Resolve(${csharpString(outcome.voiceAlias)}), Resolve(${csharpString(outcome.message)}), false);`);
        break;
      case "chat":
        if (outcome.platform === "YouTube") {
          lines.push(`        CPH.SendYouTubeMessageToLatestMonitored(Resolve(${csharpString(outcome.message)}), true, true);`);
        } else if (outcome.platform === "Kick") {
          lines.push(`        CPH.SendKickMessage(Resolve(${csharpString(outcome.message)}), true, true);`);
        } else {
          lines.push(`        CPH.SendMessage(Resolve(${csharpString(outcome.message)}), true, true);`);
        }
        break;
      case "obs": {
        const sceneName = `scene${index}`;
        const sourceName = `source${index}`;
        lines.push(
          `        string ${sceneName} = Resolve(${csharpString(outcome.scene)});`,
          `        string ${sourceName} = Resolve(${csharpString(outcome.source)});`
        );
        if (outcome.obsState === "Toggle") {
          lines.push(
            `        bool visible${index} = CPH.ObsIsSourceVisible(${sceneName}, ${sourceName}, 0);`,
            `        CPH.ObsSetSourceVisibility(${sceneName}, ${sourceName}, !visible${index}, 0);`
          );
        } else {
          lines.push(`        CPH.ObsSetSourceVisibility(${sceneName}, ${sourceName}, ${outcome.obsState === "Hidden" ? "false" : "true"}, 0);`);
        }
        break;
      }
      case "run-action":
        lines.push(`        CPH.RunAction(Resolve(${csharpString(outcome.actionName)}), true);`);
        break;
      case "keyboard":
        lines.push(`        CPH.KeyboardPress(${csharpString(toSendKeys(outcome.key))});`);
        break;
      case "sound":
      default:
        lines.push(
          `        CPH.PlaySound(Resolve(${csharpString(outcome.file)}), ${volumeLiteral(outcome.volume)}, ${outcome.wait ? "true" : "false"}, \"\", true);`
        );
        break;
    }
  }

  function validateConfig(config) {
    const errors = [];
    const value = config && typeof config === "object" ? config : {};
    const trigger = value.trigger && typeof value.trigger === "object" ? value.trigger : {};
    const conditions = Array.isArray(value.conditions) ? value.conditions : [];
    const outcomes = Array.isArray(value.outcomes) ? value.outcomes : [];

    if (!String(value.actionName || "").trim()) errors.push("Enter an action name before creating the import string.");
    if (!outcomes.length) errors.push("Add at least one sub-action before creating the import string.");

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

    conditions.forEach((condition, index) => {
      const number = index + 1;
      const token = String(condition.token || "");
      const operator = String(condition.operator || "");
      const type = String(condition.type || "string");

      if (!(/^%[^%]+%$/.test(token) || /^~[^~]+~$/.test(token))) {
        errors.push(`Condition ${number} needs a valid %argument% or ~persistedGlobal~ token.`);
      }
      if (!SUPPORTED_OPERATORS.has(operator)) errors.push(`Condition ${number} uses an unsupported operator.`);
      if (!["string", "number", "boolean"].includes(type)) errors.push(`Condition ${number} uses an unsupported value type.`);
      if (operator !== "Is Null or Empty" && !String(condition.value ?? "").trim()) {
        errors.push(`Condition ${number} needs a comparison value.`);
      }
      if (type === "number" && operator !== "Is Null or Empty" && !Number.isFinite(Number(condition.value))) {
        errors.push(`Condition ${number} needs a numeric comparison value.`);
      }
      if (type === "boolean" && operator !== "Is Null or Empty" && !/^(true|false)$/i.test(String(condition.value))) {
        errors.push(`Condition ${number} needs True or False.`);
      }
    });

    outcomes.forEach((outcome, index) => {
      const number = index + 1;
      switch (outcome.type) {
        case "sound": {
          if (!String(outcome.file || "").trim()) errors.push(`Sub-action ${number}: choose a sound file.`);
          const volume = Number(outcome.volume);
          if (!Number.isFinite(volume) || volume < 0 || volume > 100) {
            errors.push(`Sub-action ${number}: volume must be from 0 to 100.`);
          }
          break;
        }
        case "tts":
          if (!String(outcome.voiceAlias || "").trim()) errors.push(`Sub-action ${number}: enter the Speaker.bot voice alias.`);
          if (!String(outcome.message || "").trim()) errors.push(`Sub-action ${number}: enter the text to speak.`);
          break;
        case "chat":
          if (!["Twitch", "Kick", "YouTube"].includes(outcome.platform)) errors.push(`Sub-action ${number}: choose a supported chat platform.`);
          if (!String(outcome.message || "").trim()) errors.push(`Sub-action ${number}: enter the chat message.`);
          break;
        case "obs":
          if (!String(outcome.scene || "").trim() || !String(outcome.source || "").trim()) {
            errors.push(`Sub-action ${number}: choose both the OBS scene and source.`);
          }
          break;
        case "run-action":
          if (!String(outcome.actionName || "").trim()) errors.push(`Sub-action ${number}: enter the action to run.`);
          break;
        case "keyboard":
          try {
            toSendKeys(outcome.key);
          } catch (error) {
            errors.push(`Sub-action ${number}: ${error.message}`);
          }
          break;
        case "custom":
          errors.push(`Sub-action ${number}: choose a specific supported sub-action before creating a native import.`);
          break;
        default:
          errors.push(`Sub-action ${number}: choose a supported sub-action type.`);
          break;
      }
    });

    return [...new Set(errors)];
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

  function toSendKeys(value) {
    const input = String(value || "").trim();
    if (!input) throw new Error("choose the key or shortcut.");
    if (/^[+^%]*\{[^{}]+\}$/.test(input)) return input;

    const parts = input.split("+").map((part) => part.trim()).filter(Boolean);
    let hasCtrl = false;
    let hasShift = false;
    let hasAlt = false;
    let key = "";

    parts.forEach((part) => {
      const normalized = part.toLowerCase();
      if (normalized === "ctrl" || normalized === "control") {
        hasCtrl = true;
      } else if (normalized === "shift") {
        hasShift = true;
      } else if (normalized === "alt") {
        hasAlt = true;
      } else if (normalized === "win" || normalized === "windows" || normalized === "meta" || normalized === "cmd") {
        throw new Error("Windows-key shortcuts are not supported by Streamer.bot's SendKeys method.");
      } else if (key) {
        throw new Error("enter one key plus optional Ctrl, Shift, or Alt modifiers.");
      } else {
        key = part;
      }
    });

    if (!key) throw new Error("choose a non-modifier key.");
    const keyName = normalizeKeyName(key);
    return `${hasCtrl ? "^" : ""}${hasShift ? "+" : ""}${hasAlt ? "%" : ""}{${keyName}}`;
  }

  function normalizeKeyName(value) {
    const raw = String(value).trim().replace(/^\{|\}$/g, "");
    const keyMap = {
      "esc": "ESC",
      "escape": "ESC",
      "return": "ENTER",
      "enter": "ENTER",
      "space": "SPACE",
      "spacebar": "SPACE",
      "del": "DELETE",
      "delete": "DELETE",
      "backspace": "BACKSPACE",
      "bksp": "BACKSPACE",
      "page up": "PGUP",
      "pageup": "PGUP",
      "pgup": "PGUP",
      "page down": "PGDN",
      "pagedown": "PGDN",
      "pgdn": "PGDN",
      "up arrow": "UP",
      "down arrow": "DOWN",
      "left arrow": "LEFT",
      "right arrow": "RIGHT"
    };
    return keyMap[raw.toLowerCase()] || raw.toUpperCase();
  }

  function volumeLiteral(value) {
    const normalized = Math.max(0, Math.min(100, Number(value))) / 100;
    return `${Number(normalized.toFixed(4))}f`;
  }

  function csharpString(value) {
    return `"${String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, "\\\"")
      .replace(/\0/g, "\\0")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t")}"`;
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

  function utf8ToBase64(value) {
    return bytesToBase64(new TextEncoder().encode(String(value)));
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
      const value = character === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  function validationError(errors) {
    const error = new Error(errors[0]);
    error.validationErrors = errors;
    return error;
  }

  return {
    buildCSharp,
    buildExportDocument,
    createImportString,
    decodeImportString,
    includesCommandTrigger,
    normalizeCommand,
    toSendKeys,
    validateConfig
  };
});
