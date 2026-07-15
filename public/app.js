/* SimStarr Elite Data dashboard */
(() => {
  const $ = (sel) => document.querySelector(sel);
  const eventList = $('#event-list');
  const ruleList = $('#rule-list');
  const dispatchList = $('#dispatch-list');
  const sessionStats = $('#session-stats');
  const simSelect = $('#sim-select');
  const hideReplay = $('#hide-replay');

  const MAX_EVENTS = 300;
  const MAX_DISPATCHES = 50;

  // ---- helpers -------------------------------------------------------------
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

  const fmtTime = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleTimeString();
  };

  const fmtNum = (n) => (typeof n === 'number' ? Math.round(n).toLocaleString() : n ?? '—');

  async function api(path, opts) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
  }

  // ---- status / session ----------------------------------------------------
  // ---- editable app title ---------------------------------------------
  const titleEl = $('#app-title');
  let editingTitle = false;

  function renderTitle(title) {
    if (editingTitle) return; // don't clobber the input while the user types
    const words = String(title || 'SimStarr Elite Data').split(' ');
    // accent the tail of the title (everything after the first word)
    const head = words.shift();
    titleEl.innerHTML = `${esc(head)}${words.length ? ` <span class="accent">${esc(words.join(' '))}</span>` : ''}`;
    document.title = title || 'SimStarr Elite Data';
  }

  titleEl.addEventListener('click', () => {
    if (editingTitle) return;
    editingTitle = true;
    const current = lastStatus?.appTitle || titleEl.textContent.trim();
    titleEl.innerHTML = '';
    const input = document.createElement('input');
    input.className = 'title-edit';
    input.value = current;
    input.maxLength = 60;
    titleEl.appendChild(input);
    input.focus();
    input.select();

    const finish = async (save) => {
      if (!editingTitle) return;
      editingTitle = false;
      const value = input.value.trim();
      if (save && value && value !== current) {
        try {
          const res = await api('/api/config', { method: 'POST', body: JSON.stringify({ appTitle: value }) });
          if (lastStatus) lastStatus.appTitle = res.appTitle;
          renderTitle(res.appTitle);
          return;
        } catch (err) {
          alertErr(err);
        }
      }
      renderTitle(current);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  });

  function renderStatus(s) {
    lastStatus = s;
    renderTitle(s.appTitle);
    const jb = $('#badge-journal');
    jb.classList.toggle('on', s.journalAvailable);
    jb.innerHTML = `<span class="dot"></span> Journal ${
      s.activeFile ? `<span class="sub">${esc(s.activeFile)}</span>` : ''
    }`;
    jb.title = s.journalDir;

    const sb = $('#badge-sb');
    sb.classList.toggle('on', s.streamerbot.connected);
    sb.innerHTML = `<span class="dot"></span> Streamer.bot ${
      s.streamerbot.queued ? `<span class="sub">${s.streamerbot.queued} queued</span>` : ''
    }`;
    sb.title = s.streamerbot.connected
      ? s.streamerbot.url
      : `${s.streamerbot.url} — ${s.streamerbot.lastError || 'not connected'}`;

    renderSession(s.session);
  }

  function renderSession(st) {
    const stats = [
      ['CMDR', st.cmdr ?? '—', true],
      ['Ship', (st.shipName || '').trim() || (st.ship || '').trim() || '—', true],
      ['System', st.currentSystem ?? '—', true],
      ['Station', st.docked ? st.currentStation ?? '—' : '(not docked)', true],
      ['Jumps', st.jumps],
      ['Distance', `${(st.distanceLy || 0).toFixed(1)} ly`],
      ['Earned', `${fmtNum(st.creditsEarned)} CR`],
      ['Bounties', st.bounties],
      ['Missions', st.missionsCompleted],
      ['Deaths', st.deaths],
      ['Scans', st.bodiesScanned],
      ['1st Discoveries', st.firstDiscoveries],
    ];
    sessionStats.innerHTML = stats
      .map(
        ([k, v, wide]) =>
          `<div class="stat${wide ? ' wide' : ''}"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`,
      )
      .join('');
  }

  // ---- events ----------------------------------------------------------
  function addEvent(pe) {
    const { event: e, replay, synthetic } = pe;
    const div = document.createElement('div');
    div.className = 'evt';
    div.dataset.replay = replay ? '1' : '0';
    if (replay && hideReplay.checked) div.style.display = 'none';

    const tags =
      (replay ? '<span class="tag replay">replay</span>' : '') +
      (synthetic ? '<span class="tag synthetic">synthetic</span>' : '');
    const summary = summarize(e);
    div.innerHTML = `
      <div class="evt-head">
        <span class="name">${esc(e.event)}</span>${tags}
        <span class="time">${fmtTime(e.timestamp)}</span>
        <button class="btn btn-sm evt-rule-btn" title="Create a rule triggered by this event">+ rule</button>
      </div>
      ${summary ? `<div class="summary">${esc(summary)}</div>` : ''}
      <pre>${esc(JSON.stringify(e, null, 2))}</pre>`;
    div.addEventListener('click', () => div.classList.toggle('open'));
    div.querySelector('.evt-rule-btn').addEventListener('click', (ev) => {
      ev.stopPropagation();
      openBuilder(null, e.event);
    });

    eventList.prepend(div);
    while (eventList.children.length > MAX_EVENTS) eventList.lastChild.remove();
  }

  function summarize(e) {
    switch (e.event) {
      case 'FSDJump': return `→ ${e.StarSystem} (${(e.JumpDist ?? 0).toFixed?.(1) ?? e.JumpDist} ly)`;
      case 'Docked': return `${e.StationName}, ${e.StarSystem}`;
      case 'Bounty': return `${e.Target_Localised ?? e.Target} — ${fmtNum(e.TotalReward)} CR`;
      case 'Scan': return e.BodyName;
      case 'MissionCompleted': return `${e.LocalisedName ?? e.Name} — ${fmtNum(e.Reward)} CR`;
      case 'MarketSell': return `${e.Count}x ${e.Type_Localised ?? e.Type} — ${fmtNum(e.TotalSale)} CR`;
      case 'Died': return e.KillerName ? `killed by ${e.KillerName}` : '';
      case 'Interdicted': return e.IsThargoid ? 'THARGOID' : e.Interdictor ?? '';
      default: return '';
    }
  }

  hideReplay.addEventListener('change', () => {
    for (const el of eventList.children) {
      el.style.display = el.dataset.replay === '1' && hideReplay.checked ? 'none' : '';
    }
  });
  $('#clear-events').addEventListener('click', () => (eventList.innerHTML = ''));

  // ---- rules ----------------------------------------------------------
  let rules = [];

  function renderRules(list) {
    rules = list;
    if (!list.length) {
      ruleList.innerHTML = '<div class="empty">No rules found. Add .yaml files to the rules/ folder.</div>';
      return;
    }
    ruleList.innerHTML = '';
    for (const r of list) {
      const div = document.createElement('div');
      div.className = 'rule' + (r.enabled ? '' : ' disabled') + (r.error ? ' error' : '');
      div.dataset.name = r.name;
      const triggers = Array.isArray(r.trigger) ? r.trigger.join(', ') : r.trigger;
      div.innerHTML = `
        <div class="rule-head">
          <div class="toggle ${r.enabled ? 'on' : ''}" title="Enable/disable"></div>
          <span class="name">${esc(r.name)}</span>
          <button class="btn btn-sm edit-btn" title="Edit this rule in the builder">Edit</button>
          <button class="btn btn-sm test-btn" title="Fire this rule now with a sample event">Test</button>
        </div>
        <div class="rule-meta">
          <span class="lbl">on</span> ${esc(triggers)}
          ${r.when ? `<br><span class="lbl">when</span> ${esc(r.when)}` : ''}
          <br><span class="lbl">do</span> ${esc(r.action)}${r.cooldown ? ` <span class="lbl">cooldown</span> ${r.cooldown}s` : ''}
        </div>
        ${r.error ? `<div class="rule-err">⚠ ${esc(r.error)}</div>` : ''}
        <div class="rule-stats">fired ${r.fireCount}× ${r.lastFired ? `· last ${fmtTime(new Date(r.lastFired).toISOString())}` : ''} · ${esc(r.file)}</div>`;

      div.querySelector('.toggle').addEventListener('click', () =>
        api(`/api/rules/${encodeURIComponent(r.name)}/toggle`, { method: 'POST' }).catch(alertErr),
      );
      div.querySelector('.test-btn').addEventListener('click', () =>
        api(`/api/rules/${encodeURIComponent(r.name)}/test`, { method: 'POST' }).catch(alertErr),
      );
      div.querySelector('.edit-btn').addEventListener('click', () => openBuilder(r));
      ruleList.appendChild(div);
    }
  }

  function flashRule(name) {
    const el = ruleList.querySelector(`.rule[data-name="${CSS.escape(name)}"]`);
    if (!el) return;
    el.classList.remove('rule-flash');
    void el.offsetWidth; // restart animation
    el.classList.add('rule-flash');
  }

  $('#reload-rules').addEventListener('click', () =>
    api('/api/rules/reload', { method: 'POST' }).catch(alertErr),
  );

  // ---- dispatches ------------------------------------------------------
  function addDispatch(d) {
    // Updates (e.g. sent -> error when Streamer.bot rejects) re-use the row.
    let div = d.id ? dispatchList.querySelector(`[data-id="${CSS.escape(d.id)}"]`) : null;
    const isUpdate = !!div;
    if (!div) {
      div = document.createElement('div');
      div.className = 'dispatch';
      if (d.id) div.dataset.id = d.id;
    }
    const args = Object.entries(d.args || {})
      .map(([k, v]) => `${k}=${v}`)
      .join('  ');
    div.innerHTML = `
      <div class="d-head">
        <span class="d-rule">${esc(d.rule)}</span> → ${esc(d.action)}
        <span class="time">${fmtTime(d.timestamp)}</span>
        <span class="d-status ${esc(d.status)}">${esc(d.status)}</span>
      </div>
      ${args ? `<div class="d-args">${esc(args)}</div>` : ''}
      ${d.status === 'error' ? `<div class="d-err">⚠ ${esc(d.error || 'Streamer.bot rejected this action')}</div>` : ''}`;
    if (!isUpdate) {
      dispatchList.prepend(div);
      while (dispatchList.children.length > MAX_DISPATCHES) dispatchList.lastChild.remove();
    }
    flashRule(d.rule);
  }

  // ---- simulator -------------------------------------------------------
  async function initSimulator() {
    const names = await api('/api/simulator');
    simSelect.innerHTML = names.map((n) => `<option>${esc(n)}</option>`).join('');
  }
  $('#sim-fire').addEventListener('click', () =>
    api('/api/simulate', { method: 'POST', body: JSON.stringify({ event: simSelect.value }) }).catch(alertErr),
  );

  function alertErr(err) {
    console.error(err);
    alert(err.message || err);
  }

  // ---- rule builder ----------------------------------------------------
  //
  // A rule is: WHEN <trigger event> [only if <conditions>] DO <Streamer.bot
  // action> [with <args>]. The builder edits exactly that, shows a
  // plain-English readback and the YAML it will save, and POSTs to /api/rules.

  let catalog = {}; // eventName -> sample event (seeded from simulator, overlaid with the user's real journal)
  let editingOriginalName = null;

  const SESSION_FIELDS = [
    'cmdr', 'ship', 'shipName', 'currentSystem', 'currentStation', 'docked',
    'jumps', 'distanceLy', 'creditsEarned', 'bounties', 'bountyEarnings',
    'missionsCompleted', 'deaths', 'interdictions', 'bodiesScanned',
    'firstDiscoveries', 'fuelLevel', 'balance',
  ];
  const STATUS_FIELDS = ['Fuel.FuelMain', 'Fuel.FuelReservoir', 'Cargo', 'Balance', 'LegalState', 'Flags'];

  const OPERATORS = [
    { id: 'eq', label: 'is', js: '===' },
    { id: 'ne', label: 'is not', js: '!==' },
    { id: 'gte', label: '≥ at least', js: '>=' },
    { id: 'lte', label: '≤ at most', js: '<=' },
    { id: 'gt', label: '> more than', js: '>' },
    { id: 'lt', label: '< less than', js: '<' },
    { id: 'contains', label: 'contains', js: null },
  ];

  const overlay = $('#builder-overlay');
  const bName = $('#b-name');
  const bTrigger = $('#b-trigger');
  const bWhen = $('#b-when');
  const bAdvanced = $('#b-advanced');
  const bAction = $('#b-action');
  const bCooldown = $('#b-cooldown');
  const bEnabled = $('#b-enabled');
  const bConditions = $('#b-conditions');
  const bArgs = $('#b-args');
  const bError = $('#b-error');
  const bInsertField = $('#b-insert-field');
  let lastArgInput = null;

  function flattenFields(obj, prefix = '') {
    const out = [];
    for (const [k, v] of Object.entries(obj || {})) {
      if (!prefix && (k === 'timestamp' || k === 'event')) continue;
      const p = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flattenFields(v, p));
      else out.push(p);
    }
    return out;
  }

  function fieldOptions() {
    const trigger = bTrigger.value.trim();
    const evFields = flattenFields(catalog[trigger] || {}).map((f) => `event.${f}`);
    return [
      ...evFields,
      ...SESSION_FIELDS.map((f) => `session.${f}`),
      ...STATUS_FIELDS.map((f) => `status.${f}`),
    ];
  }

  function refreshFieldSuggestions() {
    const opts = fieldOptions();
    let dl = document.getElementById('b-field-options');
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = 'b-field-options';
      document.body.appendChild(dl);
    }
    dl.innerHTML = opts.map((o) => `<option>${esc(o)}</option>`).join('');

    bInsertField.innerHTML =
      '<option value="">insert a game value…</option>' +
      opts.map((o) => `<option value="{{${esc(o)}}}">${esc(o)}</option>`).join('');

    const trigger = bTrigger.value.trim();
    $('#b-trigger-hint').textContent = catalog[trigger]
      ? `Known event — ${flattenFields(catalog[trigger]).length} fields available for conditions and values.`
      : trigger
        ? 'Unknown event name — that can still work, but check spelling against the Live Events feed.'
        : '';
  }

  // --- condition rows ---
  function addConditionRow(field = '', op = 'gte', value = '') {
    const row = document.createElement('div');
    row.className = 'cond-row';
    row.innerHTML = `
      <input class="c-field" list="b-field-options" placeholder="field, e.g. event.TotalReward" value="${esc(field)}">
      <select class="c-op">${OPERATORS.map((o) => `<option value="${o.id}" ${o.id === op ? 'selected' : ''}>${o.label}</option>`).join('')}</select>
      <input class="c-val" placeholder="value" value="${esc(value)}">
      <button class="row-del" title="Remove condition">✕</button>`;
    row.querySelector('.row-del').addEventListener('click', () => {
      row.remove();
      refreshPreview();
    });
    bConditions.appendChild(row);
  }

  function literalFor(raw) {
    const t = raw.trim();
    if (t === '') return "''";
    if (t === 'true' || t === 'false' || t === 'null') return t;
    if (!isNaN(Number(t)) && t !== '') return t;
    return `'${t.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }

  function compileConditions() {
    const parts = [];
    for (const row of bConditions.querySelectorAll('.cond-row')) {
      const field = row.querySelector('.c-field').value.trim();
      const opId = row.querySelector('.c-op').value;
      const value = row.querySelector('.c-val').value;
      if (!field) continue;
      const op = OPERATORS.find((o) => o.id === opId);
      if (op.id === 'contains') {
        parts.push(`String(${field}).toLowerCase().includes(${literalFor(value).toLowerCase()})`);
      } else {
        parts.push(`${field} ${op.js} ${literalFor(value)}`);
      }
    }
    return parts.join(' && ');
  }

  /** Try to represent a `when` expression as simple rows. Returns rows or null. */
  function parseWhen(when) {
    if (!when || !when.trim()) return [];
    const rows = [];
    for (const part of when.split('&&').map((p) => p.trim())) {
      const m = part.match(/^((?:event|status|session)\.[\w.]+)\s*(===|!==|>=|<=|>|<)\s*(.+)$/);
      if (!m) return null;
      const op = OPERATORS.find((o) => o.js === m[2]);
      if (!op) return null;
      let value = m[3].trim();
      const q = value.match(/^'(.*)'$/) || value.match(/^"(.*)"$/);
      if (q) value = q[1];
      rows.push({ field: m[1], op: op.id, value });
    }
    return rows;
  }

  // --- arg rows ---
  function addArgRow(key = '', value = '') {
    const row = document.createElement('div');
    row.className = 'arg-row';
    row.innerHTML = `
      <input class="a-key" placeholder="name (→ %name%)" value="${esc(key)}">
      <input class="a-val" placeholder='value, e.g. "{{event.StarSystem}}"' value="${esc(value)}">
      <button class="row-del" title="Remove value">✕</button>`;
    row.querySelector('.row-del').addEventListener('click', () => {
      row.remove();
      refreshPreview();
    });
    row.querySelector('.a-val').addEventListener('focus', (e) => (lastArgInput = e.target));
    bArgs.appendChild(row);
    return row;
  }

  bInsertField.addEventListener('change', () => {
    const tpl = bInsertField.value;
    if (!tpl) return;
    bInsertField.value = '';
    if (lastArgInput && lastArgInput.isConnected) {
      const el = lastArgInput;
      const pos = el.selectionStart ?? el.value.length;
      el.value = el.value.slice(0, pos) + tpl + el.value.slice(pos);
      el.focus();
    } else {
      const leaf = tpl.replace(/[{}]/g, '').split('.').pop();
      const row = addArgRow(leaf.charAt(0).toLowerCase() + leaf.slice(1), tpl);
      lastArgInput = row.querySelector('.a-val');
    }
    refreshPreview();
  });

  // --- collect / preview ---
  function collectDef() {
    const args = {};
    for (const row of bArgs.querySelectorAll('.arg-row')) {
      const k = row.querySelector('.a-key').value.trim();
      const v = row.querySelector('.a-val').value;
      if (k) args[k] = v;
    }
    return {
      name: bName.value.trim(),
      trigger: bTrigger.value.trim(),
      when: (bAdvanced.checked ? bWhen.value.trim() : compileConditions()) || undefined,
      cooldown: Number(bCooldown.value) || 0,
      action: bAction.value.trim(),
      args,
      enabled: bEnabled.checked,
      originalName: editingOriginalName || undefined,
    };
  }

  function conditionEnglish(def) {
    if (!def.when) return '';
    if (bAdvanced.checked) return ` — but only if <code>${esc(def.when)}</code>`;
    const rows = [...bConditions.querySelectorAll('.cond-row')]
      .map((row) => {
        const f = row.querySelector('.c-field').value.trim();
        if (!f) return null;
        const op = OPERATORS.find((o) => o.id === row.querySelector('.c-op').value);
        return `<b>${esc(f.split('.').slice(1).join('.') || f)}</b> ${esc(op.label.replace(/^[≥≤><]\s*/, ''))} <b>${esc(row.querySelector('.c-val').value)}</b>`;
      })
      .filter(Boolean);
    return rows.length ? ` — but only if ${rows.join(' and ')}` : '';
  }

  function refreshPreview() {
    const def = collectDef();
    const argNames = Object.keys(def.args);
    $('#b-summary').innerHTML =
      `When <b>${esc(def.trigger || '…')}</b> happens${conditionEnglish(def)}, ` +
      `run the Streamer.bot action <b>${esc(def.action || '…')}</b>` +
      (argNames.length ? `, sending ${argNames.map((a) => `<b>%${esc(a)}%</b>`).join(', ')}` : '') +
      (def.cooldown ? ` — at most once every ${def.cooldown}s.` : '.');

    const q = (s) => (/[:#{}[\]'"|>&*!%@`,]/.test(s) || /^\s|\s$/.test(s) ? JSON.stringify(s) : s);
    const lines = [`name: ${q(def.name || 'unnamed')}`, `enabled: ${def.enabled}`, `trigger: ${q(def.trigger || '')}`];
    if (def.when) lines.push(`when: ${q(def.when)}`);
    if (def.cooldown) lines.push(`cooldown: ${def.cooldown}`);
    lines.push(`action: ${q(def.action || '')}`);
    if (argNames.length) {
      lines.push('args:');
      for (const [k, v] of Object.entries(def.args)) lines.push(`  ${k}: ${JSON.stringify(v)}`);
    }
    $('#b-yaml').textContent = lines.join('\n');
  }

  function setAdvanced(on, whenText) {
    bAdvanced.checked = on;
    bWhen.classList.toggle('hidden', !on);
    bConditions.classList.toggle('hidden', on);
    $('#b-add-cond').classList.toggle('hidden', on);
    if (on && whenText !== undefined) bWhen.value = whenText;
  }

  function openBuilder(rule, presetTrigger) {
    editingOriginalName = rule ? rule.name : null;
    $('#builder-title').textContent = rule ? `Edit: ${rule.name}` : 'New Rule';
    $('#builder-delete').classList.toggle('hidden', !rule);
    bError.classList.add('hidden');
    bConditions.innerHTML = '';
    bArgs.innerHTML = '';
    lastArgInput = null;

    bName.value = rule ? rule.name : '';
    bTrigger.value = rule
      ? (Array.isArray(rule.trigger) ? rule.trigger[0] : rule.trigger) || ''
      : presetTrigger || '';
    bCooldown.value = rule ? rule.cooldown || 0 : 0;
    bEnabled.checked = rule ? rule.enabled : true;
    bAction.value = rule ? rule.action : '';

    const rows = parseWhen(rule ? rule.when : '');
    if (rows === null) {
      setAdvanced(true, rule.when || '');
    } else {
      setAdvanced(false);
      bWhen.value = rule && rule.when ? rule.when : '';
      for (const r of rows) addConditionRow(r.field, r.op, r.value);
    }

    for (const [k, v] of Object.entries(rule ? rule.args || {} : {})) addArgRow(k, v);

    // Trigger datalist from the catalog
    $('#trigger-options').innerHTML = Object.keys(catalog)
      .map((n) => `<option>${esc(n)}</option>`)
      .join('');
    refreshActionHint();
    refreshFieldSuggestions();
    refreshPreview();
    overlay.classList.remove('hidden');
    (rule ? bAction : bName).focus();

    // Refresh the catalog in the background so events seen since page load appear.
    loadCatalog().then(() => {
      $('#trigger-options').innerHTML = Object.keys(catalog)
        .map((n) => `<option>${esc(n)}</option>`)
        .join('');
      refreshFieldSuggestions();
    });
  }

  function closeBuilder() {
    overlay.classList.add('hidden');
  }

  function refreshActionHint() {
    api('/api/actions')
      .then((actions) => {
        $('#action-options').innerHTML = actions.map((a) => `<option>${esc(a.name)}</option>`).join('');
        $('#b-action-hint').textContent = actions.length
          ? `${actions.length} actions found in Streamer.bot — pick one or type a new name and create it in Streamer.bot later.`
          : 'Streamer.bot is not connected — type the exact action name; it will be used once connected.';
      })
      .catch(() => {});
  }

  $('#new-rule').addEventListener('click', () => openBuilder(null));
  $('#builder-close').addEventListener('click', closeBuilder);
  $('#builder-cancel').addEventListener('click', closeBuilder);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeBuilder();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!overlay.classList.contains('hidden')) closeBuilder();
    const settings = document.getElementById('settings-overlay');
    if (settings && !settings.classList.contains('hidden')) settings.classList.add('hidden');
  });
  $('#b-add-cond').addEventListener('click', () => {
    addConditionRow();
    refreshPreview();
  });
  $('#b-add-arg').addEventListener('click', () => {
    addArgRow();
    refreshPreview();
  });
  bAdvanced.addEventListener('change', () => {
    if (bAdvanced.checked) {
      setAdvanced(true, compileConditions() || bWhen.value);
    } else {
      const rows = parseWhen(bWhen.value);
      if (rows === null) {
        alert('This expression is too complex to show as simple conditions — staying in advanced mode.');
        bAdvanced.checked = true;
        return;
      }
      bConditions.innerHTML = '';
      for (const r of rows) addConditionRow(r.field, r.op, r.value);
      setAdvanced(false);
    }
    refreshPreview();
  });
  bTrigger.addEventListener('input', () => {
    refreshFieldSuggestions();
    refreshPreview();
  });
  $('.modal-body').addEventListener('input', refreshPreview);

  $('#builder-save').addEventListener('click', async () => {
    const def = collectDef();
    bError.classList.add('hidden');
    try {
      await api('/api/rules', { method: 'POST', body: JSON.stringify(def) });
      closeBuilder();
    } catch (err) {
      bError.textContent = `⚠ ${err.message || err}`;
      bError.classList.remove('hidden');
    }
  });

  $('#builder-delete').addEventListener('click', async () => {
    if (!editingOriginalName) return;
    if (!confirm(`Delete rule "${editingOriginalName}"? This removes its file from the rules folder.`)) return;
    try {
      await api(`/api/rules/${encodeURIComponent(editingOriginalName)}`, { method: 'DELETE' });
      closeBuilder();
    } catch (err) {
      bError.textContent = `⚠ ${err.message || err}`;
      bError.classList.remove('hidden');
    }
  });

  function loadCatalog() {
    return api('/api/catalog')
      .then((c) => (catalog = c))
      .catch(console.error);
  }

  // ---- settings ----------------------------------------------------------
  const settingsOverlay = $('#settings-overlay');
  let lastStatus = null;

  async function openSettings() {
    const cfg = await api('/api/config');
    $('#s-host').value = cfg.streamerbot.host;
    $('#s-port').value = cfg.streamerbot.port;
    $('#s-endpoint').value = cfg.streamerbot.endpoint;
    $('#s-journal').value = cfg.journalDir || '';
    $('#s-journal').placeholder = `auto: ${cfg.journalDirDefault}`;
    $('#s-journal-state').textContent = `Currently watching: ${cfg.journalDirResolved}`;
    $('#s-sb-state').textContent = lastStatus
      ? lastStatus.streamerbot.connected
        ? `Connected to ${lastStatus.streamerbot.url}`
        : `Not connected (${lastStatus.streamerbot.lastError || 'is the WebSocket server started in Streamer.bot?'})`
      : '';
    $('#s-error').classList.add('hidden');
    settingsOverlay.classList.remove('hidden');
  }

  $('#open-settings').addEventListener('click', () => openSettings().catch(alertErr));
  $('#settings-close').addEventListener('click', () => settingsOverlay.classList.add('hidden'));
  $('#settings-cancel').addEventListener('click', () => settingsOverlay.classList.add('hidden'));
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden');
  });

  $('#settings-save').addEventListener('click', async () => {
    const err = $('#s-error');
    err.classList.add('hidden');
    try {
      await api('/api/config', {
        method: 'POST',
        body: JSON.stringify({
          streamerbot: {
            host: $('#s-host').value,
            port: Number($('#s-port').value),
            endpoint: $('#s-endpoint').value,
          },
          journalDir: $('#s-journal').value,
        }),
      });
      settingsOverlay.classList.add('hidden');
    } catch (e) {
      err.textContent = `⚠ ${e.message || e}`;
      err.classList.remove('hidden');
    }
  });

  // ---- websocket -------------------------------------------------------
  function connect() {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onmessage = (msg) => {
      let data;
      try { data = JSON.parse(msg.data); } catch { return; }
      switch (data.type) {
        case 'event': addEvent(data.data); break;
        case 'status': renderStatus(data.data); break;
        case 'rules': renderRules(data.data); break;
        case 'dispatch': addDispatch(data.data); break;
      }
    };
    ws.onclose = () => setTimeout(connect, 2000);
  }

  // ---- boot ------------------------------------------------------------
  api('/api/status').then(renderStatus).catch(console.error);
  api('/api/rules').then(renderRules).catch(console.error);
  loadCatalog();
  api('/api/dispatches')
    .then((list) => list.slice(-MAX_DISPATCHES).forEach(addDispatch))
    .catch(console.error);
  initSimulator().catch(console.error);
  connect();
})();
