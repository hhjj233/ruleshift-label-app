/* RuleShift admin view: every question, every photo, and, with a read token, both annotators' answers.
   Read-only: it never writes to GitHub. */
(() => {
  'use strict';

  const C = window.RS_COMMON;
  const CHECKS = window.RS_CHECKS || [];
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pretty = v => String(v).replace(/_/g, ' ');
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid);
    return e;
  }
  function s(tag, attrs) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    return e;
  }
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* ignore */ } },
  };

  if (!C) { document.body.textContent = 'data/common.js is missing.'; return; }
  const CFG = C.config;
  const FIELDS = C.fields;
  const FIELD = Object.fromEntries(FIELDS.map(f => [f.name, f]));
  const ORDER = C.sections.flatMap(([, names]) => names);
  const NOTE_TRIGGERS = new Set(C.note_triggers);
  const EXCLUDE_REQUIRED = ['ego_decision', 'priority_for_full_labeling'];
  const WHO = CFG.annotators;
  const KEY_PATH = 'admin/assignment_key.json';

  let PHOTOS = [];                 // both annotators' photos, sorted by id
  const BY_ID = {};
  const LIST = {};                 // annotator -> photo ids in their order
  const ANS = {};                  // annotator -> answers file, or null
  let KEY = null;                  // private assignment key: { photos: { id: { group, assigned_to, shared } } }
  let connected = false;
  let view = [];                   // photos in the grid after filtering
  let filter = 'all';
  let cur = -1;                    // index in view of the photo shown in detail

  // ---------- answers ----------
  function status(r) {
    const L = (r && r.labels) || {};
    const fam = (r && r.families) || [];
    const notes = ((r && r.notes) || '').trim();
    const excluded = L.priority_for_full_labeling === 'exclude';
    const missing = (excluded ? EXCLUDE_REQUIRED : ORDER).filter(n => (n === 'families' ? !fam.length : !L[n]));
    if ((excluded || Object.values(L).some(v => NOTE_TRIGGERS.has(v))) && !notes) missing.push('notes');
    const started = Object.keys(L).length > 0 || fam.length > 0 || notes !== '' || ((r && r.main_device_ids) || []).length > 0;
    return { done: started && missing.length === 0, started, missing };
  }
  const rec = (who, id) => (ANS[who] && ANS[who].items && ANS[who].items[id]) || null;
  const val = (r, name) => (!r ? '' : name === 'families' ? (r.families || []).join(', ') : ((r.labels || {})[name] || ''));
  const assignedTo = id => {
    const k = KEY && KEY.photos && KEY.photos[id];
    return k ? k.assigned_to.split('+') : WHO.filter(w => LIST[w].includes(id));
  };
  const isShared = id => assignedTo(id).length > 1;
  function differs(id) {
    if (!isShared(id) || !WHO.every(w => status(rec(w, id)).done)) return [];
    return [...ORDER].filter(n => val(rec(WHO[0], id), n) !== val(rec(WHO[1], id), n));
  }
  function kappa(pairs) {
    const n = pairs.length;
    const po = pairs.filter(([a, b]) => a === b).length / n;
    const ca = {}, cb = {};
    for (const [a, b] of pairs) { ca[a] = (ca[a] || 0) + 1; cb[b] = (cb[b] || 0) + 1; }
    const pe = Object.keys(ca).reduce((t, k) => t + ca[k] * (cb[k] || 0), 0) / (n * n);
    return pe === 1 ? 1 : (po - pe) / (1 - pe);
  }

  // ---------- GitHub (read only) ----------
  function settings() { return { token: '', ...CFG.github, ...store.get('rs:admin', {}) }; }
  function b64decode(b64) {
    const bin = atob(String(b64).replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  async function gh(path) {
    const st = settings();
    const base = `${st.api.replace(/\/+$/, '')}/repos/${encodeURIComponent(st.owner)}/${encodeURIComponent(st.repo)}`;
    const url = path == null ? base
      : `${base}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(st.branch)}`;
    let res;
    try {
      res = await fetch(url, { cache: 'no-store', headers: { Authorization: `Bearer ${st.token.trim()}`, Accept: 'application/vnd.github+json' } });
    } catch (_) { throw new Error('Cannot reach GitHub.'); }
    if (res.status === 401) throw new Error('GitHub did not accept the token.');
    if (path == null && res.status === 404) throw new Error('Repository not found, or the token has no access to it.');
    if (res.status === 404) return null;
    if (res.status === 403) throw new Error('The token is not allowed to read this repository.');
    if (!res.ok) throw new Error(`GitHub error ${res.status}.`);
    const j = await res.json();
    return path == null ? j : JSON.parse(b64decode(j.content));
  }
  function setConn(text, cls) {
    const e = $('#connState');
    e.textContent = text;
    e.className = 'conn ' + (cls || 'muted');
  }
  async function loadAnswers() {
    const st = settings();
    if (!st.token) { connected = false; setConn('Answers hidden'); renderAll(); return false; }
    setConn('Loading answers…');
    try {
      await gh(null);
      const dir = st.dir.replace(/^\/+|\/+$/g, '');
      for (const w of WHO) ANS[w] = await gh(`${dir}/${w}.json`);
      KEY = await gh(KEY_PATH);
      connected = true;
      const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setConn(`Answers loaded ${t}`, 'ok');
    } catch (e) {
      connected = false;
      setConn(e.message, 'err');
      renderAll();
      return e.message;
    }
    $('#refreshBtn').hidden = false;
    renderAll();
    return true;
  }

  // ---------- questions ----------
  function counts(name, value) {
    return WHO.map(w => {
      let n = 0;
      for (const r of Object.values((ANS[w] && ANS[w].items) || {})) {
        if (!r.updated_at) continue;
        if (name === 'families' ? (r.families || []).includes(value) : (r.labels || {})[name] === value) n++;
      }
      return h('span', { class: 'w' }, h('span', { class: `who ${w}` }, w), ` ${n}`);
    });
  }
  function renderQuestions() {
    const root = $('#qlist');
    root.replaceChildren(h('p', { class: 'lead' },
      `${ORDER.length} questions per photo, plus a note. Each annotator labels ${LIST[WHO[0]].length} photos. ` +
      (connected ? 'Next to each option: how many photos each annotator gave that answer.' : 'Connect to see how often each option was chosen.')));
    let num = 0;
    for (const [title, names] of C.sections) {
      root.append(h('h2', { class: 'sec-title' }, title));
      for (const n of names) {
        const f = FIELD[n];
        num += 1;
        const list = h('ul', { class: 'olist' });
        for (const o of f.options) {
          list.append(h('li', {}, h('span', { class: 'ov' }, pretty(o.value)), h('span', { class: 'om' }, o.meaning),
            connected ? h('span', { class: 'oc' }, counts(n, o.value)) : null));
        }
        const key = n === 'relation_to_permanent';
        root.append(h('section', { class: `qcard${key ? ' key' : ''}` },
          h('div', { class: 'qtop' }, h('h3', {}, `${num}. ${f.question}`), h('code', { class: 'colname' }, n)),
          h('p', { class: 'qmeta' }, `${f.multi ? 'Several answers allowed' : 'One answer'} · required${key ? ' · the key question' : ''}`),
          list, h('p', { class: 'tip' }, f.tip)));
      }
    }
    root.append(h('h2', { class: 'sec-title' }, 'Note and rules'));
    root.append(h('section', { class: 'qcard' },
      h('div', { class: 'qtop' }, h('h3', {}, 'Notes: one or two sentences.'), h('code', { class: 'colname' }, 'notes')),
      h('ul', { class: 'rules' },
        h('li', {}, `Required when any answer is ${C.note_triggers.map(pretty).join(', ')}, and for photos with priority exclude.`),
        h('li', {}, 'A photo is done when every question is answered, plus the note when it is required. Photos with priority exclude need only the ego decision, the priority and a note.'),
        h('li', {}, 'Optional: the IDs of the devices that make up the main temporary control. Time on each photo is recorded automatically.'))));
    root.append(h('section', { class: 'qcard' },
      h('h3', {}, 'Consistency hints shown to annotators'),
      h('p', { class: 'qmeta' }, 'They appear under the questions when answers contradict each other. They never block an answer.'),
      h('ul', { class: 'rules' }, CHECKS.map(([, m]) => h('li', {}, m)))));
  }

  // ---------- photo grid ----------
  function tileBadges(id) {
    const out = [];
    if (!connected) return out;
    const grp = KEY && KEY.photos && KEY.photos[id] && KEY.photos[id].group;
    for (const w of assignedTo(id)) {
      const st = status(rec(w, id));
      const cls = st.done ? 'done' : st.started ? 'part' : '';
      out.push(h('span', { class: `bdg ${cls}` }, h('span', { class: `who ${w}` }, w), st.done ? ' done' : st.started ? ` ${st.missing.length} open` : ' —'));
    }
    const d = differs(id);
    if (d.length) out.push(h('span', { class: 'bdg diff', title: d.join(', ') }, `${d.length} differ`));
    if (grp) out.push(h('span', { class: 'bdg grp' }, grp));
    return out;
  }
  function applyFilter() {
    view = PHOTOS.filter(it => {
      if (filter === 'all') return true;
      if (filter === 'shared') return isShared(it.id);
      if (filter === 'diff') return differs(it.id).length > 0;
      if (filter === 'todo') return assignedTo(it.id).some(w => !status(rec(w, it.id)).done);
      return assignedTo(it.id).includes(filter);
    });
  }
  function renderGrid() {
    const bar = $('#pfilters');
    const opts = [['all', `All ${PHOTOS.length}`]];
    if (connected) {
      for (const w of WHO) opts.push([w, `${w} (${PHOTOS.filter(it => assignedTo(it.id).includes(w)).length})`]);
      opts.push(['shared', `Shared (${PHOTOS.filter(it => isShared(it.id)).length})`]);
      opts.push(['todo', 'Not finished']);
      opts.push(['diff', `Answers differ (${PHOTOS.filter(it => differs(it.id).length).length})`]);
    } else if (filter !== 'all') filter = 'all';
    bar.replaceChildren(...opts.map(([k, label]) => h('button', { type: 'button', class: 'chipbtn', 'data-f': k, 'aria-pressed': String(filter === k) }, label)),
      connected ? null : h('span', { class: 'small' }, 'Connect to filter by annotator and see their answers.'));
    applyFilter();
    const grid = $('#pgrid');
    grid.replaceChildren(...view.map((it, i) => h('button', { type: 'button', class: 'ptile', 'data-i': i, title: it.id },
      h('img', { src: `images/thumbs/${it.id}.jpg`, alt: '', loading: 'lazy' }),
      h('span', { class: 'n' }, String(PHOTOS.indexOf(it) + 1)),
      h('span', { class: 'pid' }, it.id),
      h('span', { class: 'badges' }, tileBadges(it.id)))));
    if (!view.length) grid.append(h('p', { class: 'empty' }, 'No photos match this filter.'));
  }

  // ---------- photo detail ----------
  const V = { k: 1, x: 0, y: 0, w: 1, h: 1, fitted: true };
  let boxesOn = true;
  const viewRect = () => $('#viewer').getBoundingClientRect();
  const fitK = () => { const r = viewRect(); return Math.min(r.width / V.w, r.height / V.h) || 1; };
  function applyT(scaleChanged) {
    $('#stage').style.transform = `translate(${V.x}px, ${V.y}px) scale(${V.k})`;
    if (!scaleChanged) return;
    const k = 1 / V.k;
    for (const g of $$('#overlay .od')) {
      const x = +g.dataset.x, y = +g.dataset.y;
      g.lastChild.setAttribute('transform', `translate(${x} ${y - 20 * k < 0 ? y + 20 * k : y}) scale(${k})`);
    }
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
  function zoomTo([x, y, w, bh]) {
    const r = viewRect();
    V.k = clamp(Math.min(r.width / (w * 3.2), r.height / (bh * 3.2)), fitK(), 6);
    V.x = r.width / 2 - (x + w / 2) * V.k;
    V.y = r.height / 2 - (y + bh / 2) * V.k;
    V.fitted = false;
    applyT(true);
  }
  function drawPhoto(it) {
    const img = $('#photo');
    img.width = it.w; img.height = it.h;
    img.src = `images/${it.id}.jpg`;
    $('#openImg').href = img.src;
    V.w = it.w; V.h = it.h;
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
    const ul = $('#devices');
    ul.replaceChildren(...(it.devices.length ? it.devices.map(d => h('li', {},
      h('button', { type: 'button', class: 'dev', 'data-dev': d.id, title: `${d.id}: ${d.label}. Click to zoom.` },
        h('span', { class: `did ${d.id[0]}` }, d.id), h('span', { class: 'dlabel' }, d.label))))
      : [h('li', { class: 'muted' }, 'ROADWork boxed no temporary signs, boards or police in this photo.')]));
    $('#tags').textContent = it.tags.length ? it.tags.join(', ') : 'none';
    $('#desc').textContent = it.description || 'none';
    fit();
  }
  function highlight(id) {
    for (const g of $$('#overlay .od')) g.classList.toggle('hl', g.dataset.id === id);
  }
  function answerRow(id, f, who) {
    const picks = {};
    for (const w of who) {
      const r = rec(w, id);
      const vals = !r ? [] : f.multi ? (r.families || []) : [(r.labels || {})[f.name]].filter(Boolean);
      for (const v of vals) (picks[v] = picks[v] || []).push(w);
    }
    const vals2 = who.map(w => val(rec(w, id), f.name));
    const diff = who.length > 1 && vals2.every(Boolean) && vals2[0] !== vals2[1];
    const key = f.name === 'relation_to_permanent';
    return h('div', { class: `arow${key ? ' key' : ''}${diff ? ' diff' : ''}` },
      h('div', { class: 'aq' }, h('span', {}, f.question), h('code', {}, f.name)),
      h('div', { class: 'aopts' }, f.options.map(o => {
        const ws = picks[o.value] || [];
        return h('span', { class: `aopt${ws.length ? ' picked' : ''}${ws.map(w => ' p' + w).join('')}`, title: o.meaning },
          pretty(o.value), ws.map(w => h('span', { class: `who ${w}` }, w)));
      })));
  }
  function renderAnswers(it) {
    const root = $('#ans');
    const who = connected ? assignedTo(it.id) : [];
    root.replaceChildren();
    if (connected) {
      root.append(h('div', { class: 'legend-who' }, who.map(w => {
        const st = status(rec(w, it.id));
        const name = (ANS[w] && ANS[w].name) || '';
        return h('span', {}, h('span', { class: `who ${w}` }, w), ` ${name} · ${st.done ? 'done' : st.started ? `${st.missing.length} open` : 'not started'}`);
      })));
    } else {
      root.append(h('p', { class: 'small' }, 'These are the questions as the annotators see them. Connect to see each annotator\'s answers on this photo.'));
    }
    for (const [title, names] of C.sections) {
      root.append(h('h2', { class: 'sec-title' }, title));
      for (const n of names) root.append(answerRow(it.id, FIELD[n], who));
    }
    root.append(h('h2', { class: 'sec-title' }, 'Notes and time'));
    if (!who.length) root.append(h('p', { class: 'small' }, 'No answers shown.'));
    for (const w of who) {
      const r = rec(w, it.id);
      if (!r) { root.append(h('p', { class: 'anote' }, h('span', { class: `who ${w}` }, w), ' no answer yet')); continue; }
      const devs = (r.main_device_ids || []).join(', ');
      root.append(h('p', { class: 'anote' }, h('span', { class: `who ${w}` }, w), ` ${r.notes ? r.notes : '(no note)'}`,
        h('span', { class: 'muted' }, ` · ${((r.seconds || 0) / 60).toFixed(1)} min${devs ? ` · devices ${devs}` : ''}`)));
      for (const [test, msg] of CHECKS) if (test(r.labels || {})) root.append(h('p', { class: 'awarn' }, `${w}: ${msg}`));
    }
  }
  function openDetail(i) {
    if (!view.length) return;
    cur = clamp(i, 0, view.length - 1);
    const it = view[cur];
    $('#gridWrap').hidden = true;
    $('#detail').hidden = false;
    $('#dId').textContent = it.id;
    $('#dPos').textContent = `${cur + 1} / ${view.length}`;
    $('#dBadges').replaceChildren(...tileBadges(it.id));
    $('#dPrev').disabled = cur === 0;
    $('#dNext').disabled = cur === view.length - 1;
    drawPhoto(it);
    renderAnswers(it);
    $('#ans').scrollTop = 0;
    history.replaceState(null, '', `#photo=${encodeURIComponent(it.id)}`);
  }
  function closeDetail() {
    $('#detail').hidden = true;
    $('#gridWrap').hidden = false;
    cur = -1;
    history.replaceState(null, '', '#photos');
  }

  // ---------- students ----------
  function renderStudents() {
    const root = $('#stu');
    root.replaceChildren();
    if (!connected) {
      root.append(h('p', { class: 'lead' }, 'Connect with a read token to see progress, agreement and disagreements.'),
        h('button', { type: 'button', class: 'btn primary', id: 'stuConnect' }, 'Connect'));
      return;
    }
    root.append(h('h2', { class: 'sec-title' }, 'Progress'));
    const rows = WHO.map(w => {
      const ids = LIST[w];
      const recs = ids.map(id => rec(w, id));
      const done = recs.filter(r => status(r).done);
      const mins = done.map(r => (r.seconds || 0) / 60).sort((a, b) => a - b);
      const med = mins.length ? mins[Math.floor(mins.length / 2)] : 0;
      const flagged = done.filter(r => CHECKS.some(([test]) => test(r.labels || {}))).length;
      const a = ANS[w];
      return h('tr', {}, h('td', {}, h('span', { class: `who ${w}` }, w), ` ${(a && a.name) || ''}`),
        h('td', { class: 'num' }, `${done.length} / ${ids.length}`),
        h('td', { class: 'num' }, String(recs.filter(r => status(r).started).length)),
        h('td', { class: 'num' }, med ? `${med.toFixed(1)} min` : '–'),
        h('td', { class: 'num' }, String(flagged)),
        h('td', {}, a && a.saved_at ? new Date(a.saved_at).toLocaleString() : a ? '–' : 'no answers yet'));
    });
    root.append(h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Annotator', 'Done', 'Started', 'Median time (done)', 'Done with a hint', 'Last saved'].map(t => h('th', {}, t)))),
      h('tbody', {}, rows)));

    const shared = PHOTOS.filter(it => isShared(it.id)).map(it => it.id);
    const both = shared.filter(id => WHO.every(w => status(rec(w, id)).done));
    root.append(h('h2', { class: 'sec-title' }, 'Agreement on the shared photos'),
      h('p', { class: 'small' }, `${both.length} of ${shared.length} shared photos are done by both annotators. Kappa needs some spread in the answers; with few photos it jumps around.`));
    if (both.length) {
      const qrows = ORDER.map(n => {
        const pairs = both.map(id => [val(rec(WHO[0], id), n), val(rec(WHO[1], id), n)]).filter(([a, b]) => a && b);
        if (!pairs.length) return h('tr', {}, h('td', {}, pretty(n)), h('td', { class: 'num' }, '0'), h('td', {}, '–'), h('td', {}, '–'));
        const agree = pairs.filter(([a, b]) => a === b).length / pairs.length;
        return h('tr', {}, h('td', {}, pretty(n)), h('td', { class: 'num' }, String(pairs.length)),
          h('td', { class: 'num' }, `${Math.round(100 * agree)}%`), h('td', { class: 'num' }, kappa(pairs).toFixed(2)));
      });
      root.append(h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Question', 'Photos', 'Agreement', 'Kappa'].map(t => h('th', {}, t)))), h('tbody', {}, qrows)));
      const dis = both.filter(id => val(rec(WHO[0], id), 'relation_to_permanent') !== val(rec(WHO[1], id), 'relation_to_permanent'));
      root.append(h('h2', { class: 'sec-title' }, `Key question disagreements (${dis.length})`));
      if (dis.length) {
        root.append(h('table', { class: 't' },
          h('thead', {}, h('tr', {}, ['Photo', WHO[0], WHO[1], `Note ${WHO[0]}`, `Note ${WHO[1]}`].map(t => h('th', {}, t)))),
          h('tbody', {}, dis.map(id => h('tr', {},
            h('td', {}, h('button', { type: 'button', class: 'linkbtn', 'data-photo': id }, id)),
            ...WHO.map(w => h('td', {}, pretty(val(rec(w, id), 'relation_to_permanent')))),
            ...WHO.map(w => h('td', {}, (rec(w, id) || {}).notes || '')))))));
      } else root.append(h('p', { class: 'small' }, 'None so far.'));
    }
  }

  // ---------- tabs and events ----------
  function showTab(tab) {
    for (const b of $$('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    $('#pQuestions').hidden = tab !== 'questions';
    $('#pPhotos').hidden = tab !== 'photos';
    $('#pStudents').hidden = tab !== 'students';
  }
  function route() {
    const hs = decodeURIComponent(location.hash.slice(1));
    if (hs.startsWith('photo=')) {
      showTab('photos');
      if (filter !== 'all' && !view.some(it => it.id === hs.slice(6))) { filter = 'all'; renderGrid(); }
      const i = view.findIndex(it => it.id === hs.slice(6));
      if (i >= 0) { openDetail(i); return; }
    }
    const tab = ['questions', 'photos', 'students'].includes(hs) ? hs : 'questions';
    showTab(tab);
    if (tab === 'photos' && cur >= 0) closeDetail();
  }
  function renderAll() {
    renderQuestions();
    renderGrid();
    renderStudents();
    if (cur >= 0 && !$('#detail').hidden) {
      const id = view[cur] && view[cur].id;
      applyFilter();
      const i = view.findIndex(it => it.id === id);
      if (i >= 0) openDetail(i); else closeDetail();
    }
  }
  function openConn() {
    const st = settings();
    $('#tokenIn').value = st.token || '';
    for (const k of ['owner', 'repo', 'branch', 'dir', 'api']) $(`#${k}In`).value = st[k] || '';
    $('#connMsg').textContent = '';
    $('#connMsg').className = 'msg';
    $('#connDlg').showModal();
  }
  async function doConnect() {
    const patch = { token: $('#tokenIn').value.trim() };
    for (const k of ['owner', 'repo', 'branch', 'dir', 'api']) {
      const v = $(`#${k}In`).value.trim();
      patch[k] = v && v !== CFG.github[k] ? v : undefined;
    }
    if (!patch.token) { $('#connMsg').textContent = 'Paste a token first.'; $('#connMsg').className = 'msg err'; return; }
    store.set('rs:admin', patch);
    $('#connMsg').textContent = 'Connecting…';
    $('#connMsg').className = 'msg';
    const ok = await loadAnswers();
    if (ok === true) {
      const missing = WHO.filter(w => !ANS[w]);
      $('#connMsg').textContent = missing.length ? `Connected. No answers yet from annotator ${missing.join(' and ')}.` : 'Connected.';
      $('#connMsg').className = 'msg ok';
      setTimeout(() => { if ($('#connDlg').open) $('#connDlg').close(); }, 1200);
    } else {
      $('#connMsg').textContent = ok || 'Could not connect.';
      $('#connMsg').className = 'msg err';
    }
  }
  function bind() {
    for (const b of $$('.tabs button')) b.addEventListener('click', () => { location.hash = b.dataset.tab; });
    addEventListener('hashchange', route);
    $('#connectBtn').addEventListener('click', openConn);
    $('#refreshBtn').addEventListener('click', loadAnswers);
    $('#goBtn').addEventListener('click', doConnect);
    $('#connDlg form').addEventListener('submit', e => { e.preventDefault(); doConnect(); });
    $('#cancelBtn').addEventListener('click', () => $('#connDlg').close());
    $('#forgetBtn').addEventListener('click', () => {
      store.set('rs:admin', {});
      for (const w of WHO) ANS[w] = null;
      KEY = null;
      connected = false;
      $('#refreshBtn').hidden = true;
      setConn('Answers hidden');
      renderAll();
      $('#connDlg').close();
    });
    $('#pfilters').addEventListener('click', e => {
      const b = e.target.closest('[data-f]');
      if (!b) return;
      filter = b.dataset.f;
      renderGrid();
    });
    $('#pgrid').addEventListener('click', e => { const t = e.target.closest('.ptile'); if (t) openDetail(+t.dataset.i); });
    $('#stu').addEventListener('click', e => {
      if (e.target.closest('#stuConnect')) return openConn();
      const b = e.target.closest('[data-photo]');
      if (b) location.hash = `photo=${encodeURIComponent(b.dataset.photo)}`;
    });
    $('#backBtn').addEventListener('click', closeDetail);
    $('#dPrev').addEventListener('click', () => openDetail(cur - 1));
    $('#dNext').addEventListener('click', () => openDetail(cur + 1));
    $('#devices').addEventListener('click', e => {
      const b = e.target.closest('[data-dev]');
      const d = b && view[cur] && view[cur].devices.find(x => x.id === b.dataset.dev);
      if (d) { zoomTo(d.box); highlight(d.id); }
    });
    $('#devices').addEventListener('mouseover', e => { const b = e.target.closest('[data-dev]'); if (b) highlight(b.dataset.dev); });
    $('#devices').addEventListener('mouseleave', () => highlight(null));
    $('#boxBtn').addEventListener('click', () => {
      boxesOn = !boxesOn;
      $('#overlay').style.display = boxesOn ? '' : 'none';
      $('#boxBtn').setAttribute('aria-pressed', String(boxesOn));
    });
    $('.vtools').addEventListener('click', e => {
      const b = e.target.closest('[data-z]');
      if (!b) return;
      if (b.dataset.z === 'fit') fit();
      else { const r = viewRect(); zoomAt(r.width / 2, r.height / 2, b.dataset.z === 'in' ? 1.25 : 0.8); }
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
    const end = () => { drag = null; vw.classList.remove('dragging'); };
    vw.addEventListener('pointerup', end);
    vw.addEventListener('pointercancel', end);
    vw.addEventListener('wheel', e => {
      e.preventDefault();
      const r = viewRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)));
    }, { passive: false });
    vw.addEventListener('dblclick', e => { if (!e.target.closest('.vtools')) fit(); });
    addEventListener('resize', () => { if (V.fitted && !$('#detail').hidden) fit(); });
    addEventListener('keydown', e => {
      if ($('#detail').hidden || $('dialog[open]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest && e.target.closest('input, textarea')) return;
      if (e.key === 'ArrowRight') openDetail(cur + 1);
      else if (e.key === 'ArrowLeft') openDetail(cur - 1);
      else if (e.key === 'Escape') closeDetail();
      else if (e.key === 'f' || e.key === 'F') fit();
      else if (e.key === 'b' || e.key === 'B') $('#boxBtn').click();
      else return;
      e.preventDefault();
    });
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

  async function boot() {
    try {
      for (const w of WHO) {
        await loadScript(`data/tasks_${w}.js`);
        LIST[w] = window.RS_TASKS.items.map(it => it.id);
        for (const it of window.RS_TASKS.items) BY_ID[it.id] = it;
      }
    } catch (e) {
      const f = $('#fatal');
      f.textContent = 'Could not load the photo lists. Reload the page.';
      f.hidden = false;
      return;
    }
    PHOTOS = Object.values(BY_ID).sort((a, b) => (a.id < b.id ? -1 : 1));
    bind();
    renderAll();
    route();
    if (settings().token) { await loadAnswers(); route(); }
  }
  boot();
})();
