/* RuleShift labeling page.
   Shows one annotator's photos (data/tasks_<who>.js) and the screening questions (data/common.js).
   Answers are kept in localStorage at once and, when a GitHub token is set, committed to
   <dir>/<who>.json on a branch of a GitHub repository through the REST contents API. */
(() => {
  'use strict';

  const C = window.RS_COMMON;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pretty = v => String(v).replace(/_/g, ' ');
  const nowIso = () => new Date().toISOString();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids) if (kid != null && kid !== false) e.append(kid);
    return e;
  }
  function s(tag, attrs) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    return e;
  }

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } },
  };

  if (!C) { document.body.textContent = 'data/common.js is missing.'; return; }
  const CFG = C.config;
  const FIELDS = C.fields;
  const FIELD = Object.fromEntries(FIELDS.map(f => [f.name, f]));
  const ORDER = C.sections.flatMap(([, names]) => names);
  const NOTE_TRIGGERS = new Set(C.note_triggers);
  const EXCLUDE_REQUIRED = ['ego_decision', 'priority_for_full_labeling'];
  const FAMILY_ORDER = FIELD.families.options.map(o => o.value);

  const CHECKS = window.RS_CHECKS || [];

  // ---------- state ----------
  let WHO = null;
  let ITEMS = [];
  let IDX = 0;
  let S = null;                       // { schema, batch, annotator, name, items: { id: record } }
  let boxesOn = true;
  let shownId = null;
  const labelsKey = () => `rs:${CFG.batch}:${WHO}:labels`;
  const idxKey = () => `rs:${CFG.batch}:${WHO}:idx`;

  function settings() {
    return { name: '', token: '', compact: false, boxes: true, offline: false, ...CFG.github, ...store.get('rs:settings', {}) };
  }
  function saveSettings(patch) {
    store.set('rs:settings', { ...store.get('rs:settings', {}), ...patch });
  }

  function loadState() {
    const saved = store.get(labelsKey(), null);
    S = saved && saved.items && typeof saved.items === 'object'
      ? saved : { schema: CFG.schema, batch: CFG.batch, annotator: WHO, name: '', items: {} };
  }
  function saveLocal() {
    S.annotator = WHO;
    if (!store.set(labelsKey(), S)) toast('This browser refused to save your answers. Download them now (Menu).', true);
  }
  function rec(id, create) {
    let r = S.items[id];
    if (!r && create) r = S.items[id] = { labels: {}, families: [], main_device_ids: [], notes: '', seconds: 0, updated_at: '' };
    return r;
  }
  function cleanRec(r) {
    return {
      labels: { ...(r.labels || {}) }, families: [...(r.families || [])], main_device_ids: [...(r.main_device_ids || [])],
      notes: String(r.notes || ''), seconds: +r.seconds || 0, updated_at: String(r.updated_at || ''), complete: !!r.complete,
    };
  }

  function status(r) {
    const L = (r && r.labels) || {};
    const fam = (r && r.families) || [];
    const notes = ((r && r.notes) || '').trim();
    const excluded = L.priority_for_full_labeling === 'exclude';
    const required = excluded ? EXCLUDE_REQUIRED : ORDER;
    const missing = required.filter(n => (n === 'families' ? !fam.length : !L[n]));
    const needNote = excluded || Object.values(L).some(v => NOTE_TRIGGERS.has(v));
    if (needNote && !notes) missing.push('notes');
    const started = Object.keys(L).length > 0 || fam.length > 0 || notes !== '' || ((r && r.main_device_ids) || []).length > 0;
    const warn = excluded ? [] : CHECKS.filter(([test]) => test(L)).map(([, text]) => text);
    return { done: started && missing.length === 0, started, missing, warn, needNote, excluded };
  }

  // Merge answers from GitHub, another tab or a file: per photo, the newer answer wins.
  function mergeIn(other) {
    if (!other || typeof other.items !== 'object' || !other.items) return false;
    let changed = false;
    for (const [id, raw] of Object.entries(other.items)) {
      if (!raw || typeof raw !== 'object') continue;
      const theirs = cleanRec(raw);
      const mine = S.items[id];
      if (!mine) { S.items[id] = theirs; changed = true; }
      else if (theirs.updated_at > (mine.updated_at || '')) {
        S.items[id] = { ...theirs, seconds: Math.max(mine.seconds || 0, theirs.seconds) };
        changed = true;
      } else if (theirs.seconds > (mine.seconds || 0)) { mine.seconds = theirs.seconds; changed = true; }
    }
    if (!S.name && other.name) { S.name = String(other.name); changed = true; }
    return changed;
  }

  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    }
    return JSON.stringify(v);
  }
  // Signature of the answers; without time, records that were only viewed are ignored.
  function sig(items, withTime) {
    if (!items) return null;
    if (withTime) return stable(items);
    const o = {};
    for (const [id, r] of Object.entries(items)) {
      if (!r.updated_at) continue;
      const { seconds, ...rest } = r;
      o[id] = rest;
    }
    return stable(o);
  }

  function fileObject(items) {
    const done = ITEMS.filter(it => items[it.id] && status(items[it.id]).done).length;
    return {
      schema: CFG.schema, batch: CFG.batch, annotator: WHO, name: S.name || settings().name || '',
      app_version: CFG.app_version, saved_at: nowIso(), n_photos: ITEMS.length, n_done: done, items,
    };
  }

  // ---------- GitHub ----------
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(String(b64).replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  const encPath = p => p.split('/').map(encodeURIComponent).join('/');
  const transient = err => Object.assign(err, { transient: true });

  function apiError(r) {
    const said = r.data && r.data.message ? ` (GitHub: ${r.data.message})` : '';
    if (r.status === 401) return new Error('GitHub did not accept the token: it is wrong, expired or revoked.' + said);
    if (r.status === 429 || (r.status === 403 && r.headers.get('x-ratelimit-remaining') === '0')) {
      return transient(new Error('GitHub asked us to slow down; saving will be retried.'));
    }
    if (r.status === 403) return new Error('The token is not allowed to write to this repository.' + said);
    if (r.status === 404) return new Error('Repository or branch not found, or the token has no access to it.' + said);
    if (r.status >= 500) return transient(new Error(`GitHub is having trouble (${r.status}); saving will be retried.`));
    return new Error(`GitHub error ${r.status}.` + said);
  }

  const GH = {
    on() { const st = settings(); return !!(WHO && st.token && st.owner && st.repo && st.branch); },
    base() {
      const st = settings();
      return `${st.api.replace(/\/+$/, '')}/repos/${encodeURIComponent(st.owner)}/${encodeURIComponent(st.repo)}`;
    },
    path() { return `${settings().dir.replace(/^\/+|\/+$/g, '')}/${WHO}.json`; },
    async req(method, url, body) {
      let res;
      try {
        res = await fetch(url, {
          method, cache: 'no-store',
          headers: {
            Authorization: `Bearer ${settings().token.trim()}`, Accept: 'application/vnd.github+json',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (_) {
        throw transient(new Error('Cannot reach GitHub (offline?). Your answers are safe in this browser; saving will be retried.'));
      }
      let data = null;
      try { data = await res.json(); } catch (_) { /* no body */ }
      return { status: res.status, data, headers: res.headers };
    },
    async checkRepo() {
      const r = await this.req('GET', this.base());
      if (r.status !== 200) throw apiError(r);
      return r.data;
    },
    async ensureBranch() {
      const branch = settings().branch;
      const b = await this.req('GET', `${this.base()}/branches/${encodeURIComponent(branch)}`);
      if (b.status === 200) return;
      if (b.status !== 404) throw apiError(b);
      const repo = await this.checkRepo();
      const ref = await this.req('GET', `${this.base()}/git/ref/heads/${encodeURIComponent(repo.default_branch)}`);
      if (ref.status !== 200) throw apiError(ref);
      const made = await this.req('POST', `${this.base()}/git/refs`, { ref: `refs/heads/${branch}`, sha: ref.data.object.sha });
      if (made.status !== 201 && made.status !== 422) throw apiError(made);   // 422: someone created it meanwhile
    },
    async getFile() {
      const r = await this.req('GET', `${this.base()}/contents/${encPath(this.path())}?ref=${encodeURIComponent(settings().branch)}`);
      if (r.status === 404) return null;
      if (r.status !== 200) throw apiError(r);
      if (!r.data || typeof r.data.content !== 'string') throw new Error('Unexpected reply from GitHub (no file content).');
      let json;
      try { json = JSON.parse(b64decode(r.data.content)); } catch (_) {
        throw new Error('The answers file on GitHub is not valid JSON. Tell your supervisor.');
      }
      return { sha: r.data.sha, json };
    },
    putFile(obj, sha) {
      const body = {
        message: `${obj.batch} ${obj.annotator}: ${obj.n_done}/${obj.n_photos} done`,
        content: b64encode(JSON.stringify(obj, null, 1) + '\n'),
        branch: settings().branch,
      };
      if (sha) body.sha = sha;
      return this.req('PUT', `${this.base()}/contents/${encPath(this.path())}`, body);
    },
  };

  const sync = { sha: null, loaded: false, pushedFull: null, pushedLabels: null, busy: false, again: false,
    timer: 0, state: 'idle', msg: '', at: null, fails: 0 };
  const needPush = () => GH.on() && sig(S.items, true) !== sync.pushedFull;
  const unsyncedLabels = () => GH.on() && sig(S.items, false) !== sync.pushedLabels;

  function resetSync() {
    clearTimeout(sync.timer);
    Object.assign(sync, { sha: null, loaded: false, pushedFull: null, pushedLabels: null, state: 'idle', msg: '', at: null, fails: 0 });
  }
  function scheduleSync(ms) {
    if (!GH.on()) return;
    clearTimeout(sync.timer);
    sync.timer = setTimeout(syncNow, ms);
  }
  async function pull() {
    const f = await GH.getFile();
    sync.loaded = true;
    if (!f) { sync.sha = null; sync.pushedFull = null; sync.pushedLabels = null; return; }
    sync.sha = f.sha;
    const items = f.json && typeof f.json.items === 'object' && f.json.items ? f.json.items : {};
    sync.pushedFull = sig(items, true);
    sync.pushedLabels = sig(items, false);
    if (mergeIn(f.json)) { saveLocal(); refresh(); }
  }
  async function syncNow() {
    clearTimeout(sync.timer);
    if (!GH.on()) { renderSync(); return; }
    if (sync.busy) { sync.again = true; return; }
    sync.busy = true;
    const before = sync.state;
    sync.state = 'busy';
    renderSync();
    try {
      let saved = false;
      for (let attempt = 0; attempt < 4 && !saved; attempt++) {
        if (!sync.loaded || attempt > 0) await pull();
        if (sig(S.items, true) === sync.pushedFull) { saved = true; break; }
        const snap = JSON.parse(JSON.stringify(S.items));
        const res = await GH.putFile(fileObject(snap), sync.sha);
        if (res.status === 200 || res.status === 201) {
          sync.sha = res.data.content.sha;
          sync.pushedFull = sig(snap, true);
          sync.pushedLabels = sig(snap, false);
          saved = true;
        } else if (res.status === 404 && attempt === 0) {
          await GH.ensureBranch();
        } else if (res.status !== 409 && res.status !== 422) {
          throw apiError(res);
        }                                   // 409/422: the file changed elsewhere; pull, merge and try again
      }
      if (!saved) throw new Error('The file on GitHub kept changing while saving. Click to try again.');
      Object.assign(sync, { state: 'ok', at: new Date(), msg: '', fails: 0 });
    } catch (e) {
      sync.state = 'err';
      sync.msg = e.message || String(e);
      if (before !== 'err') toast('Not saved to GitHub: ' + sync.msg, true);
      if (e.transient) { sync.fails += 1; scheduleSync(Math.min(300000, 10000 * 2 ** sync.fails)); }
    } finally {
      sync.busy = false;
      renderSync();
      if (sync.again) { sync.again = false; scheduleSync(400); }
    }
  }
  function markDirty() {
    renderSync();
    scheduleSync(10000);
  }
  function renderSync() {
    const b = $('#syncBtn');
    const st = settings();
    let state, text, title = '';
    if (!GH.on()) {
      state = 'local'; text = 'Saved in this browser';
      title = 'Not connected to GitHub. Menu → Settings and GitHub to connect, or download your answers from the menu.';
    } else if (sync.state === 'busy') {
      state = 'busy'; text = 'Saving to GitHub…';
    } else if (sync.state === 'err') {
      state = 'err'; text = 'Not saved to GitHub'; title = sync.msg + ' Click to try again.';
    } else if (unsyncedLabels()) {
      state = 'dirty'; text = 'Saving soon…'; title = 'Your newest answers are in this browser and go to GitHub in a few seconds. Click to save now.';
    } else if (sync.at) {
      state = 'ok';
      text = `Saved to GitHub ${sync.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      title = `${st.owner}/${st.repo}, ${GH.path()} on branch ${st.branch}`;
    } else {
      state = 'dirty'; text = 'Connecting…';
    }
    b.dataset.state = state;
    $('#syncText').textContent = text;
    b.title = title;
  }

  // ---------- form ----------
  function buildForm() {
    const form = $('#form');
    for (const [title, names] of C.sections) {
      form.append(h('h2', { class: 'sec-title' }, title));
      for (const n of names) form.append(fieldEl(FIELD[n]));
    }
    form.append(h('h2', { class: 'sec-title' }, 'Notes'));
    form.append(h('div', { class: 'fld', role: 'group', 'aria-labelledby': 'q-notes', 'data-name': 'notes' },
      h('div', { class: 'qhead' }, h('span', { class: 'q', id: 'q-notes' }, 'One or two sentences.'), h('code', { class: 'colname' }, 'notes')),
      h('textarea', { id: 'notesIn', class: 'notes', rows: '3', 'aria-labelledby': 'q-notes',
        placeholder: 'Needed for unclear, ambiguous, cannot tell, other, a conflict, or exclude. Device IDs welcome.' }),
      h('p', { class: 'time', id: 'timeOut' })));
  }
  function fieldEl(f) {
    const opts = h('div', { class: 'opts', role: f.multi ? 'group' : 'radiogroup', 'aria-labelledby': `q-${f.name}` });
    for (const o of f.options) {
      opts.append(h('button', {
        type: 'button', class: 'opt', role: f.multi ? 'checkbox' : 'radio', 'aria-checked': 'false',
        'data-f': f.name, 'data-v': o.value, title: o.meaning,
      }, h('span', { class: 'v' }, pretty(o.value)), h('span', { class: 'm' }, o.meaning)));
    }
    const key = f.name === 'relation_to_permanent';
    const box = h('div', { class: `fld${f.multi ? ' multi' : ''}${key ? ' key' : ''}`, role: 'group', 'aria-labelledby': `q-${f.name}`, 'data-name': f.name },
      h('div', { class: 'qhead' },
        h('span', { class: 'q', id: `q-${f.name}` }, f.question, key ? h('span', { class: 'badge' }, 'key') : null),
        h('code', { class: 'colname' }, f.name)),
      opts,
      f.name === 'main_temporary_control' ? h('div', { class: 'devpick', id: 'devpick' }) : null,
      h('p', { class: 'chosen' }),
      h('p', { class: 'tip' }, f.tip));
    return box;
  }
  function renderDevpick(it) {
    const dp = $('#devpick');
    dp.replaceChildren();
    if (!it.devices.length) return;
    dp.append(h('span', {}, 'Which devices (optional):'));
    for (const d of it.devices) {
      dp.append(h('button', { type: 'button', class: 'opt', role: 'checkbox', 'aria-checked': 'false', 'data-dev': d.id, title: `${d.id}: ${d.label}` },
        h('span', { class: 'v' }, d.id)));
    }
  }
  function fillForm() {
    const it = ITEMS[IDX];
    const r = rec(it.id) || { labels: {}, families: [], main_device_ids: [], notes: '' };
    for (const b of $$('#form .opt[data-f]')) {
      const f = b.dataset.f;
      const on = f === 'families' ? (r.families || []).includes(b.dataset.v) : r.labels[f] === b.dataset.v;
      b.setAttribute('aria-checked', String(on));
    }
    for (const b of $$('#devpick .opt')) b.setAttribute('aria-checked', String((r.main_device_ids || []).includes(b.dataset.dev)));
    for (const f of FIELDS) {
      const vals = f.multi ? (r.families || []) : (r.labels[f.name] ? [r.labels[f.name]] : []);
      const text = vals.map(v => (f.options.find(o => o.value === v) || {}).meaning).filter(Boolean).join(' ');
      $(`.fld[data-name="${f.name}"] .chosen`).textContent = text;
    }
    const notes = $('#notesIn');
    if (document.activeElement !== notes || shownId !== it.id) notes.value = r.notes || '';
    updateChecks();
  }
  function updateChecks() {
    const r = rec(ITEMS[IDX].id);
    const st = status(r);
    for (const f of $$('#form .fld')) f.classList.toggle('open-q', st.started && st.missing.includes(f.dataset.name));
    const box = $('#checks');
    box.replaceChildren();
    if (st.done) box.append(h('p', { class: 'ok' }, '✓ All questions answered.'));
    else if (!st.started) box.append(h('p', { class: 'todo' }, `${st.missing.length} questions to answer.`));
    else box.append(h('p', { class: 'todo' }, 'Still open: ' + st.missing.map(n => (n === 'notes' ? 'a note' : pretty(n))).join(', ') + '.'));
    if (st.excluded && !st.done) box.append(h('p', { class: 'todo' }, 'Excluded photo: only the ego decision, the priority and a note are needed.'));
    for (const w of st.warn) box.append(h('p', { class: 'warn' }, 'Check: ' + w));
    showTime(r);
  }
  function showTime(r) {
    const m = ((r && r.seconds) || 0) / 60;
    $('#timeOut').textContent = `Time on this photo: ${m < 1 ? 'under 1' : m.toFixed(1)} min (counted while you work here).`;
  }
  function changed(r) {
    r.updated_at = nowIso();
    r.complete = status(r).done;
    saveLocal();
    fillForm();
    updateProgress();
    markDirty();
  }

  // ---------- photo viewer ----------
  const V = { k: 1, x: 0, y: 0, w: 1, h: 1, fitted: true };
  let loadSeq = 0;
  const viewRect = () => $('#viewer').getBoundingClientRect();
  const fitK = () => { const r = viewRect(); return Math.min(r.width / V.w, r.height / V.h) || 1; };

  function applyT(scaleChanged) {
    $('#stage').style.transform = `translate(${V.x}px, ${V.y}px) scale(${V.k})`;
    if (scaleChanged) placeTags();
  }
  function fit() {
    const r = viewRect();
    V.k = fitK();
    V.x = (r.width - V.w * V.k) / 2;
    V.y = (r.height - V.h * V.k) / 2;
    V.fitted = true;
    applyT(true);
  }
  function zoomAt(cx, cy, f) {
    const k2 = clamp(V.k * f, fitK() * 0.5, 8);
    V.x = cx - (cx - V.x) * k2 / V.k;
    V.y = cy - (cy - V.y) * k2 / V.k;
    V.k = k2;
    V.fitted = false;
    applyT(true);
  }
  function zoomCenter(f) { const r = viewRect(); zoomAt(r.width / 2, r.height / 2, f); }
  function zoomTo(box) {
    const r = viewRect();
    const [x, y, w, bh] = box;
    V.k = clamp(Math.min(r.width / (w * 3.2), r.height / (bh * 3.2)), fitK(), 6);
    V.x = r.width / 2 - (x + w / 2) * V.k;
    V.y = r.height / 2 - (y + bh / 2) * V.k;
    V.fitted = false;
    applyT(true);
  }
  function loadPhoto(it) {
    const img = $('#photo');
    const stage = $('#stage');
    const url = new URL(`images/${it.id}.jpg`, location.href).href;
    V.w = it.w; V.h = it.h;
    img.width = it.w; img.height = it.h;
    $('#openImg').href = url;
    drawOverlay(it);
    fit();
    if (img.src === url && img.complete && img.naturalWidth) { stage.style.visibility = ''; return; }
    const seq = ++loadSeq;
    stage.style.visibility = 'hidden';
    $('#vload').textContent = 'Loading photo…';
    $('#vload').hidden = false;
    img.onload = () => { if (seq === loadSeq) { stage.style.visibility = ''; $('#vload').hidden = true; } };
    img.onerror = () => { if (seq === loadSeq) $('#vload').textContent = 'Could not load this photo. Check your connection and reload.'; };
    img.src = url;
  }
  function drawOverlay(it) {
    const svg = $('#overlay');
    svg.setAttribute('viewBox', `0 0 ${it.w} ${it.h}`);
    svg.setAttribute('width', it.w);
    svg.setAttribute('height', it.h);
    svg.replaceChildren();
    for (const [x, y, w, bh] of it.phys) svg.append(s('rect', { class: 'phys', x, y, width: w, height: bh }));
    for (const d of it.devices) {
      const [x, y, w, bh] = d.box;
      const g = s('g', { class: `od ${d.id[0]}`, 'data-id': d.id, 'data-x': x, 'data-y': y });
      g.append(s('rect', { class: 'box', x, y, width: w, height: bh }));
      const tag = s('g', { class: 'tag' });
      tag.append(s('rect', { class: 'tagbg', x: 0, y: -20, width: 10 + 9.5 * d.id.length, height: 20, rx: 3 }));
      const t = s('text', { x: 5, y: -5 });
      t.textContent = d.id;
      tag.append(t);
      g.append(tag);
      svg.append(g);
    }
    placeTags();
  }
  function placeTags() {
    const k = 1 / V.k;                          // keep the ID tags the same size on screen at any zoom
    for (const g of $$('#overlay .od')) {
      const x = +g.dataset.x, y = +g.dataset.y;
      const ty = y - 20 * k < 0 ? y + 20 * k : y;
      g.lastChild.setAttribute('transform', `translate(${x} ${ty}) scale(${k})`);
    }
  }
  function highlight(id) {
    for (const g of $$('#overlay .od')) g.classList.toggle('hl', g.dataset.id === id);
    for (const b of $$('#devices .dev')) b.classList.toggle('hl', b.dataset.dev === id);
  }
  function setBoxes(on) {
    boxesOn = on;
    $('#overlay').style.display = on ? '' : 'none';
    $('#boxBtn').setAttribute('aria-pressed', String(on));
    saveSettings({ boxes: on });
  }
  function renderDevices(it) {
    const ul = $('#devices');
    ul.replaceChildren();
    if (!it.devices.length) {
      ul.append(h('li', { class: 'muted' }, 'ROADWork boxed no temporary signs, boards or police in this photo.'));
      return;
    }
    for (const d of it.devices) {
      ul.append(h('li', {}, h('button', { type: 'button', class: 'dev', 'data-dev': d.id, title: `${d.id}: ${d.label}. Click to zoom.` },
        h('span', { class: `did ${d.id[0]}` }, d.id), h('span', { class: 'dlabel' }, d.label))));
    }
  }

  // ---------- navigation ----------
  function showItem() {
    const it = ITEMS[IDX];
    $('#posText').textContent = `${IDX + 1} / ${ITEMS.length}`;
    $('#imgId').textContent = it.id;
    $('#imgPos').textContent = `photo ${IDX + 1} of ${ITEMS.length}`;
    $('#tags').textContent = it.tags.length ? it.tags.join(', ') : 'none';
    $('#desc').textContent = it.description || 'none';
    if (shownId !== it.id) {
      renderDevices(it);
      renderDevpick(it);
      loadPhoto(it);
      $('#form').scrollTop = 0;
      if (ITEMS[IDX + 1]) new Image().src = `images/${ITEMS[IDX + 1].id}.jpg`;
    }
    fillForm();
    shownId = it.id;
    $('#prevBtn').disabled = $('#backBtn').disabled = IDX === 0;
    $('#nextBtn').disabled = IDX === ITEMS.length - 1;
    $('#doneBtn').textContent = IDX === ITEMS.length - 1 ? 'Next unfinished ▶' : 'Next photo ▶';
  }
  function go(i) {
    if (!ITEMS.length) return;
    i = clamp(i, 0, ITEMS.length - 1);
    if (i === IDX && shownId === ITEMS[i].id) return;
    const left = status(rec(ITEMS[IDX].id));
    if (shownId && left.started && !left.done) toast(`Photo ${IDX + 1} still has ${left.missing.length} open question${left.missing.length > 1 ? 's' : ''}.`);
    IDX = i;
    store.set(idxKey(), IDX);
    history.replaceState(null, '', `${location.pathname}${location.search}#${IDX + 1}`);
    showItem();
    if (needPush()) scheduleSync(800);
  }
  function nextUnfinished() {
    for (let j = 1; j <= ITEMS.length; j++) {
      const i = (IDX + j) % ITEMS.length;
      if (!status(rec(ITEMS[i].id)).done) {
        if (i === IDX) return toast('This is the only unfinished photo.');
        return go(i);
      }
    }
    toast('All photos are done. Thank you! Check that the top-right button says "Saved to GitHub".');
  }
  function updateProgress() {
    const done = ITEMS.filter(it => status(rec(it.id)).done).length;
    $('#progText').textContent = `${done} / ${ITEMS.length} done`;
    $('#progBar').style.width = `${ITEMS.length ? (100 * done) / ITEMS.length : 0}%`;
  }
  function refresh() {
    if (!ITEMS.length) return;
    fillForm();
    updateProgress();
    renderSync();
    if ($('#gridDlg').open) openGrid();
  }

  // ---------- dialogs ----------
  function openGrid() {
    const grid = $('#grid');
    const todoOnly = $('input[name="gfilter"]:checked').value === 'todo';
    grid.replaceChildren();
    ITEMS.forEach((it, i) => {
      const st = status(rec(it.id));
      if (todoOnly && st.done) return;
      const cls = st.done ? 'done' : st.started ? 'part' : 'new';
      grid.append(h('button', { type: 'button', class: `tile ${cls}${i === IDX ? ' cur' : ''}`, 'data-i': i, title: it.id },
        h('img', { src: `images/thumbs/${it.id}.jpg`, alt: '', loading: 'lazy' }),
        h('span', { class: 'n' }, String(i + 1)),
        h('span', { class: 'st' }, st.done ? 'done' : st.started ? `${st.missing.length} open` : 'not started')));
    });
    if (!grid.childElementCount) grid.append(h('p', { class: 'small' }, 'Every photo is done.'));
    if (!$('#gridDlg').open) $('#gridDlg').showModal();
    const cur = $('.tile.cur', grid);
    if (cur) cur.scrollIntoView({ block: 'center' });
  }
  function openExample() {
    const ex = C.example;
    const tbl = $('#exTbl');
    if (!tbl.childElementCount) {
      $('#exImg').src = ex.image;
      for (const [k, v] of Object.entries(ex.labels)) {
        const shown = FIELD[k] && !FIELD[k].multi ? pretty(v) : String(v);
        tbl.append(h('tr', {}, h('td', {}, pretty(k)), h('td', {}, shown)));
      }
    }
    $('#exampleDlg').showModal();
  }
  let fixedWho = false;
  function openSetup(chooseWho) {
    const st = settings();
    $('#whoPick').hidden = !chooseWho;
    $('#whoFixed').hidden = chooseWho || !WHO;
    if (WHO) $('#whoFixed').textContent = `You are annotator ${WHO}, with ${ITEMS.length} photos.`;
    $('#nameIn').value = st.name || (S && S.name) || '';
    $('#tokenIn').value = st.token || '';
    for (const k of ['owner', 'repo', 'branch', 'dir', 'api']) $(`#${k}In`).value = st[k] || '';
    setConnMsg('');
    if (!$('#setupDlg').open) $('#setupDlg').showModal();
  }
  function setConnMsg(text, cls) {
    const m = $('#connMsg');
    m.textContent = text;
    m.className = 'msg' + (cls ? ' ' + cls : '');
  }
  async function onConnect(offline) {
    if (!WHO) {
      const pick = $('input[name="who"]:checked', $('#setupDlg'));
      if (!pick) return setConnMsg('Choose annotator A or B first.', 'err');
      await start(pick.value);
      if (!WHO) return;
    }
    const name = $('#nameIn').value.trim();
    if (!name) return setConnMsg('Type your name first.', 'err');
    const patch = { name, offline };
    for (const k of ['owner', 'repo', 'branch', 'dir', 'api']) {
      const v = $(`#${k}In`).value.trim();
      patch[k] = v && v !== CFG.github[k] ? v : undefined;      // store only real overrides
    }
    if (offline) patch.token = '';
    else {
      const token = $('#tokenIn').value.trim();
      if (!token) return setConnMsg('Paste the token, or click "Work without GitHub".', 'err');
      patch.token = token;
    }
    saveSettings(patch);
    S.name = name;
    saveLocal();
    resetSync();
    if (offline) {
      $('#setupDlg').close();
      renderSync();
      toast('Working without GitHub: answers stay in this browser. Download them from the menu when you finish.');
      return;
    }
    const st = settings();
    if (st.owner === 'OWNER' || st.repo === 'REPO') return setConnMsg('The repository is not set up yet. Ask your supervisor.', 'err');
    setConnMsg('Connecting…');
    $('#connectBtn').disabled = true;
    try {
      await GH.checkRepo();
      await GH.ensureBranch();
      while (sync.busy) await sleep(150);
      await syncNow();
      if (sync.state === 'err') throw new Error(sync.msg);
      setConnMsg(`Connected. Your answers are saved to ${st.owner}/${st.repo}, ${GH.path()} on branch ${st.branch}.`, 'ok');
      setTimeout(() => { if ($('#setupDlg').open) $('#setupDlg').close(); }, 1400);
    } catch (e) {
      setConnMsg(e.message || String(e), 'err');
      renderSync();
    } finally {
      $('#connectBtn').disabled = false;
    }
  }
  function forgetToken() {
    if (unsyncedLabels() && !confirm('Some answers are not on GitHub yet. Forget the token anyway? They stay in this browser.')) return;
    saveSettings({ token: '' });
    resetSync();
    renderSync();
    toast('The token was removed from this browser.');
  }
  function exportJson() {
    if (!WHO) return;
    const blob = new Blob([JSON.stringify(fileObject(S.items), null, 1)], { type: 'application/json' });
    const stamp = nowIso().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
    const a = h('a', { href: URL.createObjectURL(blob), download: `RuleShift_${CFG.batch}_${WHO}_${stamp}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Downloaded your answers.');
  }
  async function importJson(file) {
    let obj;
    try { obj = JSON.parse(await file.text()); } catch (_) { return toast('That file is not valid JSON.', true); }
    if (!obj || typeof obj.items !== 'object' || !obj.items) return toast('That file has no answers in it.', true);
    if (obj.annotator && obj.annotator !== WHO &&
        !confirm(`This file belongs to annotator ${obj.annotator}, but you are ${WHO}. Load it anyway?`)) return;
    const changedAny = mergeIn(obj);
    saveLocal();
    refresh();
    markDirty();
    toast(changedAny ? 'Loaded the answers from the file (newer answers win).' : 'Nothing new in that file.');
  }
  function applyCompact(on) {
    $('#form').classList.toggle('compact', on);
    $('#compactLabel').textContent = on ? 'Long options (show meanings)' : 'Short options (hide meanings)';
    saveSettings({ compact: on });
  }

  let toastTimer = 0;
  function toast(text, err) {
    const t = $('#toast');
    t.textContent = text;
    t.className = 'toast' + (err ? ' err' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, err ? 8000 : 3500);
  }
  function fatal(text) {
    const f = $('#fatal');
    f.textContent = text;
    f.hidden = false;
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(new Error(`Cannot load ${src}`));
      document.head.append(el);
    });
  }

  // ---------- events ----------
  function bindUI() {
    $('#prevBtn').addEventListener('click', () => go(IDX - 1));
    $('#backBtn').addEventListener('click', () => go(IDX - 1));
    $('#nextBtn').addEventListener('click', () => go(IDX + 1));
    $('#doneBtn').addEventListener('click', () => (IDX < ITEMS.length - 1 ? go(IDX + 1) : nextUnfinished()));
    $('#todoBtn').addEventListener('click', nextUnfinished);
    $('#posBtn').addEventListener('click', openGrid);
    $('#exampleBtn').addEventListener('click', openExample);
    $('#syncBtn').addEventListener('click', () => (GH.on() ? syncNow() : openSetup(!WHO)));

    $('#form').addEventListener('click', e => {
      const b = e.target.closest('.opt');
      if (!b || !ITEMS.length) return;
      const r = rec(ITEMS[IDX].id, true);
      if (b.dataset.dev) {
        const ids = new Set(r.main_device_ids || []);
        if (ids.has(b.dataset.dev)) ids.delete(b.dataset.dev); else ids.add(b.dataset.dev);
        r.main_device_ids = ITEMS[IDX].devices.map(d => d.id).filter(id => ids.has(id));
      } else if (b.dataset.f === 'families') {
        let fam = new Set(r.families || []);
        const v = b.dataset.v;
        if (fam.has(v)) fam.delete(v);
        else if (v === 'none') fam = new Set(['none']);
        else { fam.delete('none'); fam.add(v); }
        r.families = FAMILY_ORDER.filter(x => fam.has(x));
      } else {
        const f = b.dataset.f, v = b.dataset.v;
        if (r.labels[f] === v) delete r.labels[f]; else r.labels[f] = v;
      }
      changed(r);
    });
    $('#form').addEventListener('input', e => {
      if (e.target.id !== 'notesIn') return;
      const r = rec(ITEMS[IDX].id, true);
      r.notes = e.target.value;
      r.updated_at = nowIso();
      r.complete = status(r).done;
      saveLocal();
      updateChecks();
      updateProgress();
      markDirty();
    });
    for (const sel of ['#devices', '#devpick']) {
      $(sel).addEventListener('mouseover', e => { const b = e.target.closest('[data-dev]'); if (b) highlight(b.dataset.dev); });
      $(sel).addEventListener('mouseleave', () => highlight(null));
    }
    $('#devices').addEventListener('click', e => {
      const b = e.target.closest('[data-dev]');
      const d = b && ITEMS[IDX].devices.find(x => x.id === b.dataset.dev);
      if (d) { zoomTo(d.box); highlight(d.id); }
    });

    const vw = $('#viewer');
    let drag = null;
    vw.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('.vtools')) return;
      drag = { x: e.clientX, y: e.clientY, vx: V.x, vy: V.y };
      vw.setPointerCapture(e.pointerId);
      vw.classList.add('dragging');
    });
    vw.addEventListener('pointermove', e => {
      if (!drag) return;
      V.x = drag.vx + e.clientX - drag.x;
      V.y = drag.vy + e.clientY - drag.y;
      V.fitted = false;
      applyT(false);
    });
    const endDrag = () => { drag = null; vw.classList.remove('dragging'); };
    vw.addEventListener('pointerup', endDrag);
    vw.addEventListener('pointercancel', endDrag);
    vw.addEventListener('wheel', e => {
      e.preventDefault();
      const r = viewRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)));
    }, { passive: false });
    vw.addEventListener('dblclick', e => { if (!e.target.closest('.vtools')) fit(); });
    $('.vtools').addEventListener('click', e => {
      const b = e.target.closest('[data-z]');
      if (!b) return;
      const z = b.dataset.z;
      if (z === 'fit') fit();
      else if (z === 'one') zoomCenter(1 / V.k);
      else zoomCenter(z === 'in' ? 1.25 : 0.8);
    });
    $('#boxBtn').addEventListener('click', () => setBoxes(!boxesOn));
    addEventListener('resize', () => { if (V.fitted) fit(); });

    const menu = $('#menu');
    menu.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      menu.open = false;
      const act = b.dataset.act;
      if (act === 'settings') openSetup(!WHO);
      else if (!WHO) toast('Choose your annotator letter first.', true);
      else if (act === 'grid') openGrid();
      else if (act === 'compact') applyCompact(!settings().compact);
      else if (act === 'export') exportJson();
      else if (act === 'import') $('#importIn').click();
      else if (act === 'help') $('#helpDlg').showModal();
      else if (act === 'forget') forgetToken();
    });
    document.addEventListener('click', e => { if (!e.target.closest('#menu')) menu.open = false; });
    $('#importIn').addEventListener('change', e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) importJson(f);
    });

    $('#setupDlg form').addEventListener('submit', e => { e.preventDefault(); onConnect(false); });
    $('#connectBtn').addEventListener('click', () => onConnect(false));
    $('#offlineBtn').addEventListener('click', () => onConnect(true));
    $('#setupDlg').addEventListener('cancel', e => { if (!WHO) e.preventDefault(); });
    for (const b of $$('[data-close]')) b.addEventListener('click', () => b.closest('dialog').close());
    $('#grid').addEventListener('click', e => {
      const t = e.target.closest('.tile');
      if (!t) return;
      $('#gridDlg').close();
      go(+t.dataset.i);
    });
    for (const r of $$('input[name="gfilter"]')) r.addEventListener('change', openGrid);

    addEventListener('keydown', e => {
      if (!ITEMS.length || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      if ($('dialog[open]')) return;
      const k = e.key;
      if (k === 'ArrowRight') go(IDX + 1);
      else if (k === 'ArrowLeft') go(IDX - 1);
      else if (k === 'n' || k === 'N') nextUnfinished();
      else if (k === 'g' || k === 'G') openGrid();
      else if (k === 'f' || k === 'F') fit();
      else if (k === 'b' || k === 'B') setBoxes(!boxesOn);
      else if (k === '+' || k === '=') zoomCenter(1.25);
      else if (k === '-' || k === '_') zoomCenter(0.8);
      else if (k === '?') $('#helpDlg').showModal();
      else return;
      e.preventDefault();
    });
    addEventListener('hashchange', () => {
      const n = parseInt(location.hash.slice(1), 10);
      if (Number.isFinite(n)) go(n - 1);
    });

    // time on the current photo: counted in 5 s steps while the page is visible and in use
    let lastInput = Date.now();
    for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) {
      addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true });
    }
    setInterval(() => {
      if (!ITEMS.length || document.visibilityState !== 'visible' || Date.now() - lastInput > 90000 || $('dialog[open]')) return;
      const r = rec(ITEMS[IDX].id, true);
      r.seconds = (r.seconds || 0) + 5;
      showTime(r);
      saveLocal();
    }, 5000);

    addEventListener('storage', e => {
      if (!WHO || e.key !== labelsKey() || !e.newValue) return;
      try { if (mergeIn(JSON.parse(e.newValue))) refresh(); } catch (_) { /* ignore */ }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && needPush()) syncNow();
    });
    addEventListener('beforeunload', e => {
      if (unsyncedLabels()) { syncNow(); e.preventDefault(); e.returnValue = ''; }
    });
  }

  async function start(who) {
    try { await loadScript(`data/tasks_${who}.js`); } catch (e) {
      fatal(`Could not load the photo list for annotator ${who}. Reload the page; if that does not help, tell your supervisor.`);
      return;
    }
    WHO = who;
    store.set('rs:who', who);
    ITEMS = window.RS_TASKS.items;
    $('#whoLabel').textContent = `${pretty(CFG.batch)} · annotator ${who}`;
    if (!fixedWho) {
      const q = new URLSearchParams(location.search);
      q.set('who', who);
      history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
      fixedWho = true;
    }
    loadState();
    const n = parseInt(location.hash.slice(1), 10);
    IDX = clamp(Number.isFinite(n) ? n - 1 : +store.get(idxKey(), 0) || 0, 0, ITEMS.length - 1);
    showItem();
    updateProgress();
    renderSync();
  }

  async function boot() {
    buildForm();
    bindUI();
    const st = settings();
    applyCompact(!!st.compact);
    setBoxes(st.boxes !== false);
    renderSync();
    const q = (new URLSearchParams(location.search).get('who') || '').trim().toUpperCase();
    fixedWho = CFG.annotators.includes(q);
    const who = fixedWho ? q : store.get('rs:who', null);
    if (!CFG.annotators.includes(who)) { openSetup(true); return; }
    await start(who);
    if (!WHO) return;
    if (!st.name || (!GH.on() && !st.offline)) openSetup(false);
    else if (GH.on()) syncNow();
  }

  window.RS_DEBUG = { state: () => S, sync: () => ({ ...sync }), status: id => status(rec(id)), syncNow };
  boot();
})();
