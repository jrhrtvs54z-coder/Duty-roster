(() => {
'use strict';
const E = Eng;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const pad = E.pad;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const AWAY = [['Leave', 'L'], ['Course', 'C'], ['Deployed', 'D'], ['Sick', 'S'], ['Other', 'O']];
const awayCode = t => (AWAY.find(a => a[0] === t) || ['', 'O'])[1];
// late: that pair may enter late (lateIn); early: that pair may leave early (earlyOut)
// A neutral starting template; each squadron sets its own times in Setup.
const DEF_BLOCKS = () => [
  { s: '0800', e: '1400', late: false, early: true }, { s: '1400', e: '2000', late: false, early: true },
  { s: '2000', e: '0200', late: true, early: false }, { s: '0200', e: '0800', late: true, early: false }];
const DEF_CFG = () => ({ start: '0800', minAt: 4, nightFrom: '0000', nightTo: '0600', lateIn: '1800', earlyOut: '2200', maxLate: 3, maxEarly: 3,
  cycle: 2, anchor: todayStr(), extra: [], skip: [], us: 'A', them: 'B' });
const EXAMPLE_CS = ['ATLAS', 'BISHOP', 'COBRA', 'DUSTY', 'EMBER', 'FROST', 'GECKO', 'HAVOC', 'INDIGO', 'JAGUAR', 'KARMA', 'LANCER', 'MOJO', 'NOVA', 'ONYX'];

const A = {
  S: { pilots: [], away: [], blocks: DEF_BLOCKS(), cfg: DEF_CFG(), example: false, months: {} },
  has: false, ready: false, mode: 'loading', why: '', ro: false, status: 'idle', note: '', saveErr: '', localBlocked: false,
  ui: { sheet: null, toast: null, genFrom: null, awayMsg: null, restoreText: '', restoreErr: '', awayForm: null },
  undo: null
};

// ---------- helpers ----------
const icon = {
  up: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="m4 12.5 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="m4 7.5 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  grip: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M4 10h12M4 14h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  prev: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  copy: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="9" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4 13V4.5A1.5 1.5 0 0 1 5.5 3H12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  lock: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="4.5" y="9" width="11" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>'
};
function todayStr() { const n = new Date(); return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()); }
function nowMin() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }
function onNowDate() { const t = todayStr(); return nowMin() >= E.toMin(A.S.cfg.start) ? t : E.addDays(t, -1); }
function fmtDay(ds, year) { const [y, m, d] = ds.split('-').map(Number); return DOW[E.dow(ds)] + ' ' + d + ' ' + MON[m - 1] + (year ? ' ' + y : ''); }
function fmtShort(ds) { const [, m, d] = ds.split('-').map(Number); return d + ' ' + MON[m - 1]; }
function monthEnd(ds) { const days = E.monthDays(ds.slice(0, 7)); return days[days.length - 1]; }
function monthName(ym) { const [y, m] = ym.split('-').map(Number); return MONL[m - 1] + ' ' + y; }
const cs = id => { const p = id && E.pilot(A.S, id); return p ? p.cs : '—'; };
// Display order follows each pilot's rank (set in Pilots → Reorder). The engine ignores it.
const rankKey = p => p.rank != null ? +p.rank : 1e4 + A.S.pilots.indexOf(p);
const byRank = list => list.slice().sort((a, b) => rankKey(a) - rankKey(b));
const activePilots = () => byRank(A.S.pilots.filter(p => p.active !== false));
const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtH = h => (Math.round(h * 10) / 10).toString();
const validHHMM = t => Number.isFinite(E.toMin(t));
const us = () => 'Squadron ' + (A.S.cfg.us || 'A');
const them = () => 'Squadron ' + (A.S.cfg.them || 'B');
const isDuty = ds => E.isDuty(A.S, ds);
const sIn = (w, si) => E.seatIn(w, si, A.S.cfg), sOut = (w, si) => E.seatOut(w, si, A.S.cfg);

// ---------- storage: the page's own database when available, this browser otherwise ----------
function configBody() {
  const S = A.S;
  return { v: 2, pilots: S.pilots, away: S.away, blocks: S.blocks, cfg: S.cfg, example: !!S.example, savedAt: new Date().toISOString() };
}
function monthBody(ym) {
  const m = A.S.months[ym]; if (!m) return null;
  const days = m.days || {}, rest = m.rest || {}, restFix = m.restFix || {};
  return Object.keys(days).length || Object.keys(rest).length || Object.keys(restFix).length ? { days, rest, restFix } : null;
}
function applyConfig(c) {
  if (!c) { A.has = false; return; }
  A.has = true;
  A.S.pilots = Array.isArray(c.pilots) ? c.pilots : [];
  A.S.away = Array.isArray(c.away) ? c.away : [];
  const st0 = (c.cfg && c.cfg.start) || DEF_CFG().start;
  A.S.blocks = (Array.isArray(c.blocks) && c.blocks.length ? c.blocks : DEF_BLOCKS()).map(b => ({
    s: b.s, e: b.e,
    late: b.late != null ? !!b.late : !!(b.r && b.r !== st0),
    early: b.early != null ? !!b.early : !!(b.l && b.l !== st0) }));
  A.S.cfg = Object.assign(DEF_CFG(), c.cfg || {});
  if (!Array.isArray(A.S.cfg.extra)) A.S.cfg.extra = [];
  if (!Array.isArray(A.S.cfg.skip)) A.S.cfg.skip = [];
  A.S.example = !!c.example;
}

const Store = (() => {
  const LKEY = 'alert-duty-roster.v1';
  let db = null, lt = null;
  const ver = new Map(), timers = new Map(), busy = new Set();
  const dirty = k => ver.has(k);
  const setStatus = s => { A.status = s; paint(); };
  function paint() { const el = document.getElementById('save'); if (el) { el.textContent = statusText(); el.className = 'save save-' + A.status; } }

  async function init() {
    const C = window.claude;
    if (!C || typeof C.use !== 'function') return local('standalone');
    let d = null;
    try { d = await C.use('db'); } catch (e) { d = null; }
    if (!d) return local('nodb');
    db = d; A.mode = 'db';
    try { const u = await C.use('user'); if (u && (await u.canEdit()) === false) { A.ro = true; A.status = 'ro'; } } catch (e) { /* unknown: keep editing; a refused write decides */ }
    listen();
  }
  function local(why) {
    A.mode = 'local'; A.why = why;
    try {
      const raw = localStorage.getItem(LKEY);
      if (raw) { const o = JSON.parse(raw); applyConfig(o.config); A.S.months = o.months || {}; } else applyConfig(null);
      A.status = 'local';
    } catch (e) { applyConfig(null); A.localBlocked = true; A.status = 'error'; }
    A.ready = true; render();
  }
  function listen() {
    let gotC = false, gotM = false;
    const timer = setTimeout(() => { if (!(gotC && gotM)) { A.note = 'The saved roster can’t be reached yet. Check the connection; it loads by itself when it can.'; render(); } }, 10000);
    const settle = meta => {
      if (gotC && gotM && !A.ready) { A.ready = true; if (A.status === 'idle') A.status = 'saved'; }
      if (meta && !meta.fromCache && gotC && gotM) { clearTimeout(timer); A.note = ''; }
      if (A.ready) render();
    };
    db.doc('roster/config').onSnapshot(snap => {
      gotC = true;
      if (!dirty('config')) applyConfig(snap.exists ? clone(snap.data()) : null);
      settle(snap.metadata);
    }, err => { clearTimeout(timer); gotC = true; gotM = true; A.note = errText(err); settle(); });
    db.collection('months').onSnapshot(qs => {
      gotM = true;
      qs.docChanges().forEach(ch => {
        const k = ch.doc.id;
        if (dirty('m:' + k)) return;
        if (ch.type === 'removed') delete A.S.months[k]; else A.S.months[k] = clone(ch.doc.data());
      });
      settle(qs.metadata);
    }, err => { clearTimeout(timer); gotC = true; gotM = true; A.note = errText(err); settle(); });
  }
  function errText(e) {
    const c = e && e.code;
    if (c === 'revoked') return 'Access to this roster changed. Reload the page to continue.';
    if (c === 'resource_exhausted') return 'Too many requests right now. The roster refreshes shortly.';
    return 'The saved roster couldn’t be loaded. Reload the page to try again.';
  }
  function touch(k) {
    if (A.ro) return;
    ver.set(k, (ver.get(k) || 0) + 1);
    if (A.mode !== 'db') { clearTimeout(lt); lt = setTimeout(writeLocal, 250); setStatus('saving'); return; }
    clearTimeout(timers.get(k));
    timers.set(k, setTimeout(() => flush(k), 600));
    setStatus('saving');
  }
  async function flush(k, attempt) {
    attempt = attempt || 0;
    timers.delete(k);
    if (!db || !ver.has(k)) return settled();
    if (busy.has(k)) { timers.set(k, setTimeout(() => flush(k, attempt), 250)); return; }
    busy.add(k);
    const v = ver.get(k);
    const ref = k === 'config' ? db.doc('roster/config') : db.doc('months/' + k.slice(2));
    const body = k === 'config' ? (A.has ? configBody() : null) : monthBody(k.slice(2));
    try {
      if (body) await ref.set(body); else await ref.delete();
      busy.delete(k);
      if (ver.get(k) === v) ver.delete(k);
    } catch (e) {
      busy.delete(k);
      const c = e && e.code;
      if (c === 'invalid_argument' || c === 'not_granted') return readOnly();
      if (attempt < 1 && c !== 'quota_exceeded') { timers.set(k, setTimeout(() => flush(k, attempt + 1), 1000 + Math.random() * 1000)); return; }
      A.saveErr = c === 'quota_exceeded' ? 'Storage for this roster is full. Make a backup in Setup, then delete everything and restore recent months only.' : 'Couldn’t save the last change. It stays on this screen and saving retries by itself.';
      setStatus('error'); render();
      timers.set(k, setTimeout(() => flush(k), 15000));
      return;
    }
    settled();
  }
  function settled() { if (!ver.size && !busy.size) { A.saveErr = ''; setStatus(A.ro ? 'ro' : 'saved'); render(); } }
  async function readOnly() {
    A.ro = true; ver.clear(); timers.forEach(t => clearTimeout(t)); timers.clear(); A.status = 'ro';
    try {
      const c = await db.doc('roster/config').get(); applyConfig(c.exists ? clone(c.data()) : null);
      const q = await db.collection('months').get(); A.S.months = {}; q.docs.forEach(d => { A.S.months[d.id] = clone(d.data()); });
    } catch (e) { /* keep what is on screen */ }
    toast('This roster is view only for you. Changes aren’t saved.');
    render();
  }
  function writeLocal() {
    lt = null;
    try { localStorage.setItem(LKEY, JSON.stringify({ config: A.has ? configBody() : null, months: A.S.months })); ver.clear(); A.localBlocked = false; setStatus('local'); }
    catch (e) { ver.clear(); A.localBlocked = true; setStatus('error'); render(); }
  }
  function flushAll() {
    if (A.mode === 'db') [...timers.keys()].forEach(k => { clearTimeout(timers.get(k)); flush(k); });
    else if (lt) { clearTimeout(lt); writeLocal(); }
  }
  return { init, touch, flushAll };
})();
function statusText() {
  if (A.ro) return 'View only';
  if (A.status === 'saving') return 'Saving…';
  if (A.status === 'error') return 'Not saved';
  if (A.mode === 'local' && A.ready) return 'On this device';
  if (A.status === 'saved') return 'Saved';
  return A.mode === 'loading' ? 'Loading…' : '';
}
const touchMonth = ds => Store.touch('m:' + ds.slice(0, 7));
function touchRange(from, to) {
  let ym = from.slice(0, 7); const end = to.slice(0, 7), seen = new Set();
  while (ym <= end && !seen.has(ym)) { seen.add(ym); Store.touch('m:' + ym); ym = E.addMonths(ym, 1); }
}
function touchAllMonths(extra) { new Set([...Object.keys(A.S.months), ...(extra || [])]).forEach(k => Store.touch('m:' + k)); }

// ---------- routing ----------
function route() {
  const h = location.hash.slice(1); let m;
  if ((m = h.match(/^day-(\d{4}-\d{2}-\d{2})$/))) return { v: 'day', ds: m[1] };
  if ((m = h.match(/^month-(\d{4}-\d{2})$/))) return { v: 'month', ym: m[1] };
  if (h === 'month') return { v: 'month', ym: todayStr().slice(0, 7) };
  if (h === 'pilots') return { v: 'pilots' };
  if (h === 'setup') return { v: 'setup' };
  return { v: 'day', ds: todayStr() };
}
function go(h) { if (location.hash.slice(1) === h) render(); else location.hash = h; }

// ---------- actions ----------
function remember() { A.undo = { months: clone(A.S.months), cfg: clone(A.S.cfg) }; }
function doGenerate(from, to, msg) {
  if (A.ro) return;
  remember();
  const n = E.generate(A.S, from, to);
  touchRange(from, E.addDays(to, 2));
  toast(msg || ('Planned ' + n + ' duty day' + (n === 1 ? '' : 's') + ' · ' + fmtShort(from) + (to !== from ? ' – ' + fmtShort(to) : '')), true);
  const nextYm = E.addMonths(to.slice(0, 7), 1);
  if (to === monthEnd(to) && A.S.months[nextYm] && Object.keys(A.S.months[nextYm].days || {}).length) {
    setTimeout(() => toast(monthName(nextYm) + ' was planned before this change. Generate it again to keep the rotation even.'), 3500);
  }
  render();
}
function undo() {
  if (!A.undo) return;
  const keys = new Set([...Object.keys(A.S.months), ...Object.keys(A.undo.months)]);
  const cfgChanged = JSON.stringify(A.undo.cfg) !== JSON.stringify(A.S.cfg);
  A.S.months = A.undo.months; A.S.cfg = A.undo.cfg; A.undo = null;
  keys.forEach(k => Store.touch('m:' + k));
  if (cfgChanged) Store.touch('config');
  toast('Undone'); render();
}
function setSeat(ds, wi, si, pid, giveRest) {
  const S = A.S, day = E.getDay(S, ds); if (!day || A.ro) return;
  remember();
  const old = day.w[wi].p[si];
  if (pid) day.w.forEach((w, a) => w.p.forEach((x, b) => { if (x === pid && !(a === wi && b === si)) w.p[b] = old; }));
  day.w[wi].p[si] = pid || null;
  day.lock = true;
  let keep = E.getRest(S, ds), ch = false, note = '';
  if (pid && keep.includes(pid)) { keep = keep.filter(x => x !== pid); ch = true; note = ' ' + cs(pid) + '’s planned rest is cancelled.'; }
  if (giveRest && old && !keep.includes(old)) { keep.push(old); ch = true; }
  if (ch) { E.setRest(S, ds, keep, true); touchMonth(E.restFrom(ds)); }
  touchMonth(ds);
  toast((giveRest && old && pid ? cs(old) + ' rests, ' + cs(pid) + ' takes watch ' + (wi + 1) + '. Day locked.' : 'Saved and locked. Generate won’t change this day.') + note, true);
}
// Every duty day a pilot isn't on alert is a rest day. A planned rest keeps a pilot off alert on a
// day, so Generate leaves them off; it can run over several duty days in a row.
const restingOn = ds => { const on = E.onIds(A.S, ds); return activePilots().filter(p => !on.has(p.id) && !E.awayOn(A.S, p.id, ds)); };
function keepEdit(edits, msg) {
  if (A.ro) return;
  const S = A.S, before = clone(S.months); let changed = false, clash = null;
  edits.forEach(([ds, fn]) => {
    const next = fn(E.getRest(S, ds)); if (!next) return;
    E.setRest(S, ds, next, true); changed = true;
    touchMonth(ds); touchMonth(E.restFrom(ds));
    const on = next.filter(id => E.onIds(S, ds).has(id));
    if (on.length && !clash) clash = { ds, on };
  });
  if (!changed) return;
  A.undo = { months: before, cfg: clone(S.cfg) };
  if (clash) {
    const d = E.getDay(S, clash.ds), who = clash.on.map(cs).join(', ') + (clash.on.length > 1 ? ' are' : ' is');
    A.ui.awayMsg = d && d.lock ? { text: who + ' on alert ' + fmtDay(clash.ds) + ', a locked day. Change the watch bill there to give the rest.', from: clash.ds, open: true }
      : { text: who + ' on alert ' + fmtDay(clash.ds) + '. Re-plan from that day to give the rest.', from: clash.ds };
  }
  toast(msg, true);
  render();
}
const keepOff = (ds, pid) => keepEdit([[ds, ids => ids.includes(pid) ? null : ids.concat(pid)]], cs(pid) + ' kept off alert ' + fmtDay(ds) + '. Generate leaves them off.');
const release = (ds, pid) => keepEdit([[ds, ids => ids.includes(pid) ? ids.filter(x => x !== pid) : null]], cs(pid) + ' can go on alert ' + fmtDay(ds) + ' again.');
// rest this day and the next duty day (or the one after the planned rests already there)
function keepNext(ds, pid) {
  let d = E.nextDuty(A.S, ds), k = 0;
  while (d && E.restOn(A.S, pid, d) && k++ < 30) d = E.nextDuty(A.S, d);
  if (!d) return;
  const add = ids => ids.includes(pid) ? null : ids.concat(pid);
  keepEdit([[ds, add], [d, add]], cs(pid) + ' rests through ' + fmtDay(d) + ' (kept off alert).');
}
function restChips(ds, ids, plain) {
  const kept = new Set(plain ? [] : E.getRest(A.S, ds));
  return ids.length ? ids.map(id => '<span class="tag tag-sm rest' + (kept.has(id) ? ' kept" title="Kept off alert (planned rest)' : '') + '">' + esc(cs(id)) + (kept.has(id) ? '<small>KEPT OFF</small>' : '') + '</span>').join('') : '<span class="note">Nobody</span>';
}
// Switch one pilot between the normal time and entering late / leaving early, within the daily limits.
function togglePerk(ds, wi, si, kind) {
  const S = A.S, c = S.cfg, day = E.getDay(S, ds); if (!day || A.ro) return;
  const w = day.w[wi], id = w.p[si]; if (!id) return;
  const before = clone(A.S.months);
  day.w.forEach(x => { x.in = [0, 1].map(k => E.seatIn(x, k, c)); x.out = [0, 1].map(k => E.seatOut(x, k, c)); x.late = E.lateOK(x, c); x.early = E.earlyOK(x, c); delete x.r; delete x.l; });
  const count = k => day.w.reduce((n, x) => n + x.p.filter((pid, j) => pid && (k === 'late' ? E.seatGeom(x, j, c).lateIn : E.seatGeom(x, j, c).earlyOut)).length, 0);
  const late = kind === 'late', arr = late ? w.in : w.out, perkT = late ? E.lateT(c) : E.earlyT(c), cap = late ? E.capLate(c) : E.capEarly(c);
  if (arr[si] !== c.start) arr[si] = c.start;
  else {
    if (count(kind) >= cap) { A.S.months = before; toast((late ? 'Already ' + cap + ' entering late' : 'Already ' + cap + ' leaving at ' + perkT) + ' (the most allowed). Switch one back first.'); render(); return; }
    arr[si] = perkT;
    if (E.minAtBuilding(day.w, c, (x, j) => !!x.p[j]) < c.minAt) { A.S.months = before; toast('That would leave fewer than ' + c.minAt + ' at the alert building.'); render(); return; }
  }
  A.undo = { months: before, cfg: clone(c) };
  day.lock = true; touchMonth(ds);
  toast(cs(id) + (arr[si] === c.start ? (late ? ' reports at ' + c.start : ' stays to ' + c.start) : (late ? ' enters late at ' + perkT : ' leaves at ' + perkT)) + '. Day locked.', true);
  render();
}
function movePilot(pid, to) {
  if (A.ro) return;
  const list = activePilots(), from = list.findIndex(p => p.id === pid);
  if (from < 0) return;
  to = Math.max(0, Math.min(list.length - 1, to));
  if (to === from) { render(); return; }
  const [p] = list.splice(from, 1); list.splice(to, 0, p);
  list.forEach((x, i) => { x.rank = i + 1; });
  byRank(A.S.pilots.filter(x => x.active === false)).forEach((x, i) => { x.rank = list.length + 1 + i; });
  Store.touch('config');
  render();
}
function conflictsFor(pid, from, to) {
  const t = todayStr(), out = [];
  for (let ds = from > t ? from : t; ds <= to; ds = E.addDays(ds, 1)) {
    if (E.onIds(A.S, ds).has(pid)) out.push(ds);
    if (out.length > 60) break;
  }
  return out;
}
function lastPlanned() {
  let last = null;
  Object.values(A.S.months).forEach(m => Object.keys((m && m.days) || {}).forEach(d => { if (!last || d > last) last = d; }));
  return last;
}
function replanFrom(ds) {
  const last = lastPlanned();
  doGenerate(ds, last && last > monthEnd(ds) ? last : monthEnd(ds));
}
function swapDay(ds, ours) {
  if (A.ro) return;
  remember();
  const c = A.S.cfg;
  c.extra = c.extra.filter(d => d !== ds); c.skip = c.skip.filter(d => d !== ds);
  if (ours !== E.isDuty(A.S, ds)) (ours ? c.extra : c.skip).push(ds);
  Store.touch('config');
  if (ours) { E.generate(A.S, ds, ds); touchMonth(ds); }
  else { E.setDay(A.S, ds, null); touchMonth(ds); }
  const nx = E.nextDuty(A.S, ds);
  A.ui.awayMsg = nx ? { text: (ours ? us() + ' now has ' : them() + ' now has ') + fmtDay(ds) + '. Re-plan the following duty days so the rotation stays even.', from: nx } : null;
  toast((ours ? us() : them()) + ' has ' + fmtDay(ds), true);
  render();
}
// The installed app (GitHub Pages) keeps everything on the phone: no account, no server.
const MKEY = 'alert-duty-roster.meta';
function meta() { try { return JSON.parse(localStorage.getItem(MKEY) || '{}') || {}; } catch (e) { return {}; } }
function setMeta(patch) { try { localStorage.setItem(MKEY, JSON.stringify(Object.assign(meta(), patch))); } catch (e) { /* storage blocked: the banner says so */ } }
const isApp = () => A.mode === 'local' && A.why === 'standalone';
const installed = () => !!((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone);
const daysSince = ds => ds ? E.diffDays(ds, todayStr()) : null;
function keepData() {
  if (!isApp()) return;
  setMeta({ since: meta().since || todayStr() });
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}
async function backupFile() {
  Store.flushAll();
  const name = 'duty-roster-backup-' + todayStr() + '.json';
  try {
    const file = new File([backupText()], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'Duty roster backup' });
    else {
      const url = URL.createObjectURL(file), a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    setMeta({ lastBackup: todayStr(), snooze: null });
    toast('Backup ready. Keep the file somewhere safe, like iCloud Drive or Google Drive.');
    render();
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    openSheet({ type: 'backup' });
  }
}
function backupLine() {
  const lb = meta().lastBackup, n = daysSince(lb);
  return lb ? 'Last backup ' + fmtDay(lb, lb.slice(0, 4) !== todayStr().slice(0, 4)) + (n > 0 ? ', ' + n + ' day' + (n === 1 ? '' : 's') + ' ago.' : ', today.') + (n > 30 ? ' Time for a new one.' : '') : 'No backup yet. Back up once a month so a lost or new phone doesn’t cost you the roster.';
}
function needsBackup() {
  if (!isApp() || !A.has || A.S.example || A.ro) return false;
  const m = meta(); if (m.snooze && m.snooze > todayStr()) return false;
  return m.lastBackup ? daysSince(m.lastBackup) > 30 : daysSince(m.since || todayStr()) >= 3;
}
function registerSW() {
  if (!('serviceWorker' in navigator) || window.claude || !document.querySelector('link[rel="manifest"]')) return;
  if (!(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return;
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('A new version of the app is ready.', false, { label: 'Reload', act: 'reload-app' }); });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}
function createRoster(list, anchor) {
  const t = todayStr();
  A.S.pilots = list.map(c => ({ id: newId(), cs: c, lead: false, active: true }));
  A.S.away = []; A.S.blocks = DEF_BLOCKS(); A.S.cfg = Object.assign(DEF_CFG(), { anchor: anchor || t }); A.S.example = false; A.has = true;
  const old = Object.keys(A.S.months); A.S.months = {};
  E.generate(A.S, t, monthEnd(t));
  Store.touch('config'); touchAllMonths(old);
  keepData();
  go('day-' + (E.isDuty(A.S, t) ? t : E.nextDuty(A.S, t)));
}
function loadExample() {
  const t = todayStr(), ym = t.slice(0, 7), end = monthEnd(t);
  const old = Object.keys(A.S.months);
  A.S.pilots = EXAMPLE_CS.map((c, i) => ({ id: 'x' + (i + 1), cs: c, lead: false, active: true }));
  A.S.away = [{ id: 'xa1', pilot: 'x12', type: 'Course', from: ym + '-15', to: end }];
  A.S.blocks = DEF_BLOCKS(); A.S.cfg = DEF_CFG(); A.S.example = true; A.has = true; A.S.months = {};
  E.generate(A.S, ym + '-01', end);
  Store.touch('config'); touchAllMonths(old);
  A.undo = null;
  go('day-' + t);
}
function wipe() {
  const old = Object.keys(A.S.months);
  A.S.months = {}; A.S.pilots = []; A.S.away = []; A.S.example = false; A.has = false; A.undo = null;
  Store.touch('config'); old.forEach(k => Store.touch('m:' + k));
  go('day-' + todayStr());
}
function restore(obj) {
  const old = Object.keys(A.S.months);
  applyConfig(obj.config);
  A.S.months = obj.months || {}; A.undo = null;
  Store.touch('config'); touchAllMonths(old);
  keepData();
  toast('Backup restored'); go('month-' + todayStr().slice(0, 7));
}
function parseBackup(text) {
  let o; try { o = JSON.parse(text); } catch (e) { return 'This isn’t a roster backup. Paste the whole text you copied from Backup.'; }
  if (!o || typeof o !== 'object' || !o.config || !Array.isArray(o.config.pilots)) return 'This backup has no pilot list. Paste the whole text you copied from Backup.';
  if (o.months && typeof o.months !== 'object') return 'The months in this backup are damaged.';
  return o;
}
async function copyText(text, what) {
  try { await navigator.clipboard.writeText(text); toast(what + ' copied'); }
  catch (e) { A.ui.sheet = { type: 'copy', text, what }; render(); setTimeout(() => { const ta = $('#copy-ta'); if (ta) { ta.focus(); ta.select(); } }, 30); }
}
function dayText(ds) {
  const S = A.S, d = E.getDay(S, ds); if (!d) return '';
  const nx = E.addDays(ds, 1);
  const L = ['ALERT DUTY — ' + us().toUpperCase() + ' — ' + fmtDay(ds, true).toUpperCase(), 'Shift ' + S.cfg.start + ' → ' + S.cfg.start + ' ' + DOW[E.dow(nx)] + ' ' + fmtShort(nx), ''];
  d.w.forEach((w, i) => L.push((i + 1) + ') ' + w.p.map(id => id ? cs(id) : 'EMPTY').join(' / ') + '   ' + w.s + '–' + w.e));
  L.push('');
  timeGroups(ds, d).forEach(g => L.push(g.label + ': ' + (g.ids.length ? g.ids.map(cs).join(', ') : 'nobody') + (g.unplanned ? ' (not planned yet)' : '')));
  const resting = restingOn(ds);
  L.push('Rest day today (not on alert): ' + (resting.length ? resting.map(p => p.cs).join(', ') : 'nobody'));
  L.push('', S.cfg.minAt + ' pilots at the alert building at all times.', 'Primary back-up: next cappers.');
  const away = activePilots().map(p => ({ p, a: E.awayOn(S, p.id, ds) })).filter(x => x.a);
  if (away.length) L.push('Away: ' + away.map(x => x.p.cs + ' (' + x.a.type.toLowerCase() + ')').join(', '));
  return L.join('\n');
}
function monthTSV(ym) {
  const days = E.dutyDays(A.S, ym + '-01', monthEnd(ym + '-01')), st = E.stats(A.S, ym + '-01', monthEnd(ym + '-01'));
  const L = [['Pilot', ...days.map(d => fmtShort(d)), 'Shifts', 'Back-to-back', 'Watch hours', 'Night watches', 'Rest days'].join('\t')];
  matrixPilots(days).forEach(p => {
    const row = [p.cs];
    days.forEach(ds => {
      const a = E.awayOn(A.S, p.id, ds), d = E.getDay(A.S, ds); let v = '';
      if (d) d.w.forEach((w, i) => { if (w.p.includes(p.id)) v = String(i + 1); });
      if (!v && a) v = awayCode(a.type);
      if (!v && d && p.active !== false) v = 'R';
      row.push(v);
    });
    const x = st[p.id]; row.push(x.duties, x.doubles, fmtH(x.hours), x.nights, x.restN);
    L.push(row.join('\t'));
  });
  return L.join('\n');
}
function backupText() { return JSON.stringify({ app: 'alert-duty-roster', v: 2, exportedAt: new Date().toISOString(), config: configBody(), months: A.S.months }); }

let toastTimer = null;
function toast(msg, withUndo, action) {
  A.ui.toast = { msg, undo: !!withUndo && !!A.undo, action: action || null };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { A.ui.toast = null; paintToast(); }, action ? 20000 : withUndo ? 7000 : 3500);
  paintToast();
}
function paintToast() {
  let el = document.getElementById('toast');
  if (!A.ui.toast) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  const ac = A.ui.toast.action, key = A.ui.toast.msg + '|' + A.ui.toast.undo + '|' + (ac ? ac.act : '');
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.innerHTML = esc(A.ui.toast.msg) + (A.ui.toast.undo ? '<button type="button" data-act="undo">Undo</button>' : '') + (ac ? '<button type="button" data-act="' + ac.act + '">' + esc(ac.label) + '</button>' : '');
}

// ---------- render ----------
function render() {
  const r = route(), app = $('#app');
  const mx = $('.mx-wrap'), sx = mx ? mx.scrollLeft : null;
  const bsb = $('.bs-body'), bsKey = A.ui.sheet && A.ui.sheet._shown ? A.ui.sheet : null, by = bsb && bsKey ? bsb.scrollTop : 0;
  const focusId = document.activeElement && document.activeElement.id;
  let body;
  if (!A.ready) body = viewLoading();
  else if (!A.has) body = A.ro ? viewEmptyRO() : viewOnboard();
  else if (r.v === 'month') body = viewMonth(r.ym);
  else if (r.v === 'pilots') body = viewPilots();
  else if (r.v === 'setup') body = viewSetup();
  else body = viewDay(r.ds);
  app.innerHTML = header(r) + '<main class="wrap">' + topNotes() + body + '</main>' + sheet();
  document.body.classList.toggle('has-sheet', !!A.ui.sheet);
  const mx2 = $('.mx-wrap');
  if (mx2) { if (sx !== null && r.v === 'month' && A._lastYm === r.ym) mx2.scrollLeft = sx; else scrollToToday(mx2); }
  if (r.v === 'month') A._lastYm = r.ym;
  if (A.ui.sheet) {
    const nb = $('.bs-body'); if (nb && by && bsKey === A.ui.sheet) nb.scrollTop = by;
    const keep = focusId && document.getElementById(focusId);
    if (keep && keep.closest('.bs') && !keep.disabled) { keep.focus({ preventScroll: true }); keep.scrollIntoView({ block: 'nearest' }); }
    else { const f = $('.bs [data-autofocus]') || $('.bs button'); if (f && !A.ui.sheet._focused) { f.focus({ preventScroll: true }); A.ui.sheet._focused = true; } }
  } else if (focusId) { const el = document.getElementById(focusId); if (el && el.focus) el.focus(); }
  paintToast();
}
function scrollToToday(wrap) {
  const th = wrap.querySelector('th.today') || wrap.querySelector('th.next');
  if (th) wrap.scrollLeft = Math.max(0, th.offsetLeft - 140);
}
function header(r) {
  const t = todayStr();
  const dayH = 'day-' + (r.v === 'day' ? r.ds : t);
  const tabs = [['day', 'Day', dayH], ['month', 'Month', 'month-' + (r.v === 'month' ? r.ym : (r.v === 'day' ? r.ds : t).slice(0, 7))], ['pilots', 'Pilots', 'pilots'], ['setup', 'Setup', 'setup']];
  return '<header class="top"><div class="wrap top-row"><div class="brand"><span class="brand-name disp">Alert Duty Roster</span>' +
    (A.has ? '<span class="brand-sub">SQN ' + esc(A.S.cfg.us || 'A') + ' · ' + activePilots().length + ' PILOTS · ' + A.S.blocks.length * 2 + ' PER SHIFT</span>' : '') +
    '</div><span id="save" class="save save-' + A.status + '" aria-live="polite">' + esc(statusText()) + '</span></div>' +
    (A.has && A.ready ? '<nav class="wrap tabs" aria-label="Views">' + tabs.map(([v, l, h]) => '<a class="tab" href="#' + h + '"' + (r.v === v ? ' aria-current="page"' : '') + '>' + l + '</a>').join('') + '</nav>' : '') +
    '</header>';
}
function topNotes() {
  let h = '';
  if (A.note) h += '<div class="banner banner-bad">' + esc(A.note) + '</div>';
  if (A.saveErr) h += '<div class="banner banner-bad">' + esc(A.saveErr) + '</div>';
  if (A.ready && A.mode === 'local' && A.why === 'nodb') h += '<div class="banner">Not signed in to claude.ai, so the saved roster can’t load here. Anything you change stays in this browser.</div>';
  if (A.ready && A.localBlocked) h += '<div class="banner banner-bad">This browser blocks saving. Use Setup → Backup before you close the page.</div>';
  if (A.ready && needsBackup()) h += '<div class="banner"><span><b>Back up the roster.</b> It lives only on this phone. ' + esc(backupLine()) + '</span><span class="row"><button class="btn btn-sm btn-primary" data-act="backup-file">Back up now</button><button class="btn btn-sm btn-quiet" data-act="backup-later">Later</button></span></div>';
  if (A.ready && A.has && A.S.example && !A.ro) h += '<div class="banner banner-ex"><span><b>Example roster.</b> Rename the pilots, add leave and courses, then generate your month.</span><button class="btn btn-sm" data-act="dismiss-example">Got it</button></div>';
  return h;
}
function viewLoading() {
  return '<div class="col"><div class="card load"><b class="disp">Loading the roster</b>The watch bill, the month and your pilots appear here in a moment.</div></div>';
}
function viewEmptyRO() {
  return '<div class="col"><div class="card load"><b class="disp">No roster yet</b>Nothing has been saved to this roster. Ask the scheduler to set it up.</div></div>';
}
function viewOnboard() {
  const t = todayStr();
  return '<div class="col ob"><div class="section"><p class="eyebrow">First time here</p><h1 class="disp">Set up the alert roster</h1>' +
    '<p>Type the callsigns of your squadron, one per line. Your squadron shares the alert with the other squadron, day on and day off. On each of your duty days the app picks the crew, spreads back-to-back duty days fairly, and builds the watch bill.</p></div>' +
    '<div class="card pad section"><div class="field"><label for="ob-cs">Callsigns</label><textarea id="ob-cs" class="inp mono" rows="9" placeholder="One callsign per line"></textarea></div>' +
    '<div class="field"><label for="ob-day">Your squadron is on duty</label><input id="ob-day" class="inp" type="date" value="' + t + '"><span class="note">Pick any one of your duty days. The app counts every other day from it.</span></div>' +
    '<div class="row"><button class="btn btn-primary" data-act="create">Create roster</button><button class="btn" data-act="restore-open">Restore a backup</button><button class="btn" data-act="example">Load an example</button></div>' +
    '<p class="note" id="ob-msg"></p></div>' +
    (() => { const b = DEF_BLOCKS(), c = DEF_CFG(); return '<div class="callout"><span>Starting watches: ' + b.map(x => x.s + '–' + x.e).join(', ') + '. Up to ' + c.maxLate + ' pilots on the later watches enter late at ' + c.lateIn + ', and up to ' + c.maxEarly + ' on the earlier watches leave at ' + c.earlyOut + '.</span><span>Set your squadron’s own times in Setup.</span></div>'; })() + '</div>';
}

// ----- day -----
function backupOf(day, wi) {
  const G = day.w.map(w => E.geom(w, A.S.cfg).rs);
  const me = G[wi]; let best = -1, bestRs = Infinity, min = -1, minRs = Infinity;
  G.forEach((rs, i) => { if (i === wi) return; if (rs > me && rs < bestRs) { best = i; bestRs = rs; } if (rs < minRs) { min = i; minRs = rs; } });
  return best >= 0 ? best : min;
}
function dayNav(ds) {
  const pv = E.prevDuty(A.S, ds), nx = E.nextDuty(A.S, ds), next = E.addDays(ds, 1);
  return '<div class="dayhead">' + (pv ? '<a class="btn navbtn" href="#day-' + pv + '" aria-label="Previous duty day, ' + fmtDay(pv) + '">' + icon.prev + '</a>' : '<span></span>') +
    '<div><h1 class="disp">' + esc(fmtDay(ds)) + '</h1><p class="sub">Shift ' + A.S.cfg.start + ' → ' + A.S.cfg.start + ' ' + DOW[E.dow(next)] + ' ' + esc(fmtShort(next)) + '</p></div>' +
    (nx ? '<a class="btn navbtn" href="#day-' + nx + '" aria-label="Next duty day, ' + fmtDay(nx) + '">' + icon.next + '</a>' : '<span></span>') + '</div>';
}
function viewDay(ds) {
  const S = A.S, day = E.getDay(S, ds), t = todayStr(), now = onNowDate(), duty = isDuty(ds);
  let h = '<div class="col">' + dayNav(ds);
  const nowLink = ds !== now && isDuty(now) ? '<a class="nowlink" href="#day-' + now + '">On duty now: ' + esc(fmtDay(now)) + ' crew</a>' : (ds !== t ? '<a class="nowlink" href="#day-' + t + '">Today</a>' : '');
  if (!duty) {
    const pv = E.prevDuty(S, ds), nx = E.nextDuty(S, ds);
    h += '<div class="spread"><div class="row"><span class="flag flag-mute">' + esc(them().toUpperCase()) + '</span>' + (ds === now ? '<span class="flag flag-mute">ON DUTY NOW</span>' : '') + '</div>' + nowLink + '</div>';
    const y = E.addDays(ds, -1), yd = isDuty(y) ? E.getDay(S, y) : null, ending = [];
    if (yd) yd.w.forEach(w => w.p.forEach((id, si) => { if (id) ending.push({ id, t: sOut(w, si) }); }));
    const endIds = new Set(ending.map(x => x.id));
    const resting = activePilots().filter(p => !endIds.has(p.id) && !E.awayOn(S, p.id, ds)).map(p => p.id);
    const awayB = activePilots().map(p => ({ p, a: E.awayOn(S, p.id, ds) })).filter(x => x.a);
    h += '<div class="bday"><p class="disp" style="font-size:22px">' + esc(them()) + ' has this shift</p><p class="muted">A rest day for ' + esc(us()) + (ending.length ? ', once the ' + esc(fmtDay(y)) + ' crew comes off alert' : '') + '. Your duty days are either side.</p><div class="row">' +
      (pv ? '<a class="btn" href="#day-' + pv + '">' + icon.prev + esc(fmtDay(pv)) + '</a>' : '') + (nx ? '<a class="btn btn-primary" href="#day-' + nx + '">' + esc(fmtDay(nx)) + icon.next + '</a>' : '') + '</div>' +
      (ending.length ? '<div class="section" style="gap:8px"><p class="eyebrow">Coming off alert at ' + S.cfg.start + ' · ' + esc(fmtShort(y)) + ' shift · ' + ending.length + '</p><div class="tags">' + ending.map(x => '<span class="tag tag-sm off">' + esc(cs(x.id)) + (x.t !== S.cfg.start ? ' <small style="color:var(--ok)">OUT ' + x.t + '</small>' : '') + '</span>').join('') + '</div></div>' : '') +
      '<div class="section" style="gap:8px"><p class="eyebrow">Rest day · ' + resting.length + '</p><div class="tags">' + restChips(ds, resting, true) + '</div></div>' +
      (awayB.length ? '<div class="section" style="gap:8px"><p class="eyebrow">Away · ' + awayB.length + '</p><div class="tags">' + awayB.map(x => '<span class="tag tag-sm away" title="' + esc(x.a.type) + '">' + esc(x.p.cs) + ' · ' + awayCode(x.a.type) + '</span>').join('') + '</div></div>' : '') +
      (day ? '<p class="note">An older watch bill is stored for this day.' + (A.ro ? '' : ' <button class="btn btn-sm btn-quiet" data-act="drop-day" data-ds="' + ds + '">Delete it</button>') + '</p>' : '') +
      (A.ro ? '' : '<div><button class="btn btn-sm" data-act="swap-in" data-ds="' + ds + '">' + esc(us()) + ' takes this day</button></div>') + '</div>';
    return h + '</div>';
  }
  const when = ds === now ? '<span class="flag flag-ok">ON DUTY NOW</span>' : ds === t ? '<span class="flag flag-mute">STARTS ' + S.cfg.start + ' TODAY</span>' : '';
  h += '<div class="spread dayflags"><div class="row"><span class="flag flag-mute">' + esc(us().toUpperCase()) + '</span>' + when + (day && day.lock ? '<span class="flag flag-mute">LOCKED</span>' : '') + nowLink + '</div>' +
    (day ? '<button class="btn btn-sm btn-primary" data-act="copy-day" data-ds="' + ds + '">' + icon.copy + 'Copy for WhatsApp</button>' : '') + '</div>';
  if (A.ui.awayMsg) h += msgBanner();
  if (!day) {
    h += '<div class="card pad section"><p class="eyebrow">Watch bill</p><p style="margin:0">This duty day isn’t planned yet.</p>' +
      (A.ro ? '' : '<div class="row"><button class="btn btn-primary" data-act="plan-rest" data-ds="' + ds + '">Plan ' + fmtShort(ds) + ' – ' + fmtShort(monthEnd(ds)) + '</button><button class="btn" data-act="plan-day" data-ds="' + ds + '">Plan this day only</button></div>') +
      '</div></div>';
    return h;
  }
  const issues = E.dayIssues(S, ds);
  const pv = E.prevDuty(S, ds), nx = E.nextDuty(S, ds);
  const y1 = E.onIds(S, pv), y2 = E.onIds(S, E.prevDuty(S, pv)), t1 = E.onIds(S, nx), nd = E.getDay(S, nx);
  const fwdFix = '';
  const badIds = new Set(issues.filter(i => i.id).map(i => i.id));
  if (issues.length) h += '<ul class="issues">' + issues.map(i => '<li' + (i.k === 'capR' ? ' class="w"' : '') + '>' + esc(i.t) + '</li>').join('') + (fwdFix ? '<li class="fix">' + fwdFix + '</li>' : '') + '</ul>';
  h += '<section class="card bill" aria-label="Watch bill"><div class="bill-top"><p class="eyebrow">Watch bill</p><p class="eyebrow">' + (A.ro ? '' : 'Tap a name to change it') + '</p></div>';
  let nLate = 0, nEarly = 0;
  day.w.forEach((w, wi) => {
    const g = E.geom(w, S.cfg), bk = backupOf(day, wi);
    const tags = w.p.map((id, si) => {
      if (!id) return A.ro ? '<span class="tag empty">EMPTY</span>' : '<button class="tag empty" data-act="pick" data-ds="' + ds + '" data-wi="' + wi + '" data-si="' + si + '" aria-label="Fill empty seat">EMPTY</button>';
      const tri = y1.has(id) && y2.has(id), dbl = y1.has(id);
      const cls = 'tag' + (dbl ? ' dbl' : '') + (badIds.has(id) ? ' bad' : '');
      const lead = (E.pilot(S, id) || {}).lead ? ' ★' : '';
      const inner = esc(cs(id)) + lead + (tri ? '<small>3RD</small>' : dbl ? '<small>B2B</small>' : '');
      const title = tri ? 'Third duty day in a row' : dbl ? 'Also on the last duty day (' + fmtDay(pv) + ')' : '';
      return A.ro ? '<span class="' + cls + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + inner + '</span>'
        : '<button class="' + cls + '" data-act="pick" data-ds="' + ds + '" data-wi="' + wi + '" data-si="' + si + '" aria-label="Change ' + esc(cs(id)) + ' on watch ' + (wi + 1) + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + inner + '</button>';
    }).join('');
    // only pilots who come in late or go home early get a time chip; everyone else uses the shift change
    const chip = (id, si, kind, tm) => A.ro ? '<span class="lv early">' + esc(cs(id)) + ' ' + tm + '</span>'
      : '<button class="lv early" data-act="perk" data-kind="' + kind + '" data-ds="' + ds + '" data-wi="' + wi + '" data-si="' + si + '" aria-label="' + esc(cs(id)) + (kind === 'late' ? ' enters late at ' : ' leaves at ') + tm + '. Tap to put them back on ' + S.cfg.start + '.">' + esc(cs(id)) + ' ' + tm + '</button>';
    const ins = [], outs = [];
    w.p.forEach((id, si) => {
      if (!id) return;
      const sg = E.seatGeom(w, si, S.cfg);
      if (sg.lateIn) { ins.push(chip(id, si, 'late', sIn(w, si))); nLate++; }
      if (sg.earlyOut) { outs.push(chip(id, si, 'early', sOut(w, si))); nEarly++; }
    });
    const meta = (ins.length ? '<span>In ' + ins.join(' ') + '</span>' : '') + (outs.length ? '<span>Out ' + outs.join(' ') + '</span>' : '') +
      (bk >= 0 ? '<span>Back-up <b>' + day.w[bk].p.map(id => id ? esc(cs(id)) : '—').join(' / ') + '</b></span>' : '');
    h += '<div class="bill-row' + (g.night ? ' is-night' : '') + '"><span class="bill-n disp">' + (wi + 1) + '</span><div class="bill-pair">' + tags + '</div>' +
      '<div class="bill-time"><b>' + w.s + '–' + w.e + '</b><span>' + fmtH(g.h) + ' h' + (g.night ? ' · night' : '') + '</span></div>' +
      (meta ? '<div class="bill-meta">' + meta + '</div>' : '') + '</div>';
  });
  const capL = E.capLate(S.cfg), capE = E.capEarly(S.cfg), anyLate = day.w.some(w => E.geom(w, S.cfg).late), anyEarly = day.w.some(w => E.geom(w, S.cfg).early);
  h += '<div class="bill-foot">' + (anyLate ? '<span>Late in <b>' + nLate + '</b> of ' + capL + ' · ' + E.lateT(S.cfg) + '</span>' : '') +
    (anyEarly ? '<span>Leave early <b>' + nEarly + '</b> of ' + capE + ' · ' + E.earlyT(S.cfg) + '</span>' : '') +
    '<span>Everyone else in and out at ' + S.cfg.start + '</span></div></section>';
  // off duty: resting today, off the next duty day, away
  const resting = restingOn(ds).map(p => p.id);
  const away = activePilots().map(p => ({ p, a: E.awayOn(S, p.id, ds) })).filter(x => x.a);
  const ng = timeGroups(ds, day).find(g => g.rest);
  const edit = d => A.ro ? '' : '<button class="btn btn-sm" data-act="rest-open" data-ds="' + d + '">Edit</button>';
  h += '<section class="card pad off" aria-label="Off duty">' +
    '<div class="off-row"><p class="eyebrow">Resting today · not on alert · ' + resting.length + '</p><div class="tags">' + restChips(ds, resting) + edit(ds) + '</div></div>' +
    (ng ? '<div class="off-row"><p class="eyebrow">Off the next duty day · ' + DOW[E.dow(ng.ds)] + ' ' + esc(fmtShort(ng.ds)) + ' · ' + ng.ids.length + '</p><div class="tags">' + restChips(ng.ds, ng.ids) + edit(ng.ds) + '</div>' +
      (ng.unplanned ? '<p class="note">' + esc(fmtDay(ng.ds)) + ' isn’t planned yet' + (ng.ids.length ? '; these are kept off it' : '') + '.</p>' : ng.again.length ? '<p class="note">On alert again, back-to-back: ' + esc(ng.again.map(cs).join(', ')) + '</p>' : '') + '</div>' : '') +
    (away.length ? '<div class="off-row"><p class="eyebrow">Away · ' + away.length + '</p><div class="tags">' + away.map(x => '<span class="tag tag-sm away" title="' + esc(x.a.type) + '">' + esc(x.p.cs) + ' · ' + awayCode(x.a.type) + '</span>').join('') + '</div></div>' : '') +
    '</section>';
  // the timeline, with the standing orders under it
  h += '<figure class="card pad strip"><figcaption class="eyebrow">Shift timeline · ' + S.cfg.start + ' → ' + S.cfg.start + '</figcaption>' + strip(day.w, true) +
    '<p class="callout callout-sm"><span>' + S.cfg.minAt + ' pilots at the alert building all the time</span><span>Primary back-up: “next cappers”</span></p></figure>';
  if (!A.ro) h += '<div class="row">' + (day.lock ? '<button class="btn" data-act="unlock" data-ds="' + ds + '">Unlock day</button>' : '<button class="btn" data-act="lock" data-ds="' + ds + '">' + icon.lock + 'Lock day</button>') +
    '<button class="btn btn-quiet" data-act="replan-day" data-ds="' + ds + '">Re-plan this day</button></div>';
  if (!A.ro) h += '<p class="note">Locked days keep their crew when you generate. Changing a name or a time locks the day. Swapped with ' + esc(them()) + '? <button class="btn btn-sm btn-quiet" data-act="swap-out" data-ds="' + ds + '">Give this day to ' + esc(them()) + '</button></p>';
  return h + '</div>';
}
// Groups the crew by when they come in and when they go home.
function timeGroups(ds, day) {
  const S = A.S, start = S.cfg.start, nx = E.addDays(ds, 1), nxTxt = DOW[E.dow(nx)] + ' ' + fmtShort(nx);
  const late = {}, early = {};
  day.w.forEach(w => w.p.forEach((id, si) => {
    if (!id) return;
    const r = sIn(w, si), l = sOut(w, si);
    if (r !== start) (late[r] = late[r] || []).push(id);
    if (l !== start) (early[l] = early[l] || []).push(id);
  }));
  const byTime = o => Object.keys(o).sort((a, b) => E.rel(a, start) - E.rel(b, start));
  const out = [], capL = E.capLate(S.cfg), capE = E.capEarly(S.cfg);
  byTime(late).forEach(t => out.push({ label: 'Enters late at night · ' + t + ' · ' + late[t].length + ' of max ' + capL, ids: late[t] }));
  if (!Object.keys(late).length) out.push({ label: 'Enters late at night · max ' + capL, ids: [] });
  byTime(early).forEach(t => out.push({ label: 'Leaves at ' + t + ' · ' + nxTxt + ' · ' + early[t].length + ' of max ' + capE, ids: early[t] }));
  if (!Object.keys(early).length) out.push({ label: 'Leaves at ' + E.earlyT(S.cfg) + ' · max ' + capE, ids: [] });
  // who gets off the next duty day: today's crew not on alert then
  const nd = E.nextDuty(S, ds);
  if (nd) {
    const crew = [...E.onIds(S, ds)], ndOn = E.onIds(S, nd), planned = !!E.getDay(S, nd);
    out.push({ rest: true, ds: nd, label: 'Rest day ' + DOW[E.dow(nd)] + ' ' + fmtShort(nd) + ' · off the next duty day',
      ids: planned ? crew.filter(id => !ndOn.has(id)) : crew.filter(id => E.restOn(S, id, nd)), again: planned ? crew.filter(id => ndOn.has(id)) : [], unplanned: !planned });
  }
  return out;
}
function msgBanner() {
  const m = A.ui.awayMsg;
  const go1 = m.open ? '<a class="btn btn-sm btn-primary" href="#day-' + m.from + '" data-act="dismiss-msg">Open ' + esc(fmtShort(m.from)) + '</a>'
    : '<button class="btn btn-sm btn-primary" data-act="replan-from" data-ds="' + m.from + '">Re-plan from ' + esc(fmtShort(m.from)) + '</button>';
  return '<div class="banner"><span>' + esc(m.text) + '</span><span class="row">' + go1 + '<button class="btn btn-sm btn-quiet" data-act="dismiss-msg">Not now</button></span></div>';
}
function strip(ws, withNames) {
  const S = A.S, G = ws.map(w => E.geom(w, S.cfg)), pct = m => (m / 14.4).toFixed(3) + '%';
  const pres = withNames ? ws : E.templateCheck(S).sim;
  const n1 = E.rel(S.cfg.nightFrom, S.cfg.start); let n2 = E.rel(S.cfg.nightTo, S.cfg.start); if (n2 <= n1) n2 += 1440;
  let h = '<div class="strip-plot">';
  const marks = [...new Set(pres.flatMap(w => [0, 1].map(si => E.seatGeom(w, si, S.cfg))).flatMap(g => [g.ri, g.ro]).filter(m => m > 0 && m < 1440))];
  marks.forEach(m => { h += '<div class="strip-rep" style="left:' + pct(m) + '"></div>'; });
  h += '<div class="strip-rows"><div class="strip-night" style="left:' + pct(n1) + ';width:' + pct(Math.min(n2, 1440) - n1) + '"><span>NIGHT</span></div>' + ws.map((w, i) => {
    const g = G[i]; if (!g.ok) return '<div class="strip-row"><span class="strip-bar bad" style="left:0;width:100%">' + (i + 1) + ' · check times</span></div>';
    const label = withNames && w.p ? w.p.map(id => id ? cs(id) : '—').join('·') : w.s + '–' + w.e;
    return '<div class="strip-row"><span class="strip-bar' + (withNames && w.p && w.p.some(x => !x) ? ' bad' : '') + '" style="left:' + pct(g.rs) + ';width:' + pct(g.re - g.rs) + '" title="Watch ' + (i + 1) + ' ' + w.s + '–' + w.e + '"><b>' + (i + 1) + '</b>' + esc(label) + '</span></div>';
  }).join('') + '</div>';
  const segs = E.atBuilding(pres, S.cfg, (w, si) => !!(w.p && w.p[si]));
  h += '<div class="strip-cap">At the alert building</div><div class="strip-at">' + segs.map(sg =>
    '<span class="' + (sg.n < S.cfg.minAt ? 'bad' : '') + '" style="left:' + pct(sg.a) + ';width:' + pct(sg.b - sg.a) + '" title="' + sg.n + ' at the alert building ' + E.hhmm(sg.a + E.toMin(S.cfg.start)) + '–' + E.hhmm(sg.b + E.toMin(S.cfg.start)) + '">' + sg.n + '</span>').join('') + '</div></div>';
  const s0 = E.toMin(S.cfg.start); let t = '<span class="l" style="left:0">' + S.cfg.start + '</span><span class="r" style="left:100%">' + S.cfg.start + '</span>';
  for (let hr = 0; hr < 24; hr += 3) { const rm = (hr * 60 - s0 + 1440) % 1440; if (rm > 150 && rm < 1290) t += '<span style="left:' + pct(rm) + '">' + pad(hr) + '</span>'; }
  return h + '<div class="strip-ticks" aria-hidden="true">' + t + '</div>';
}

// ----- month -----
function matrixPilots(days) {
  const used = new Set(); days.forEach(ds => E.onIds(A.S, ds).forEach(id => used.add(id)));
  return byRank(A.S.pilots.filter(p => p.active !== false || used.has(p.id)));
}
function viewMonth(ym) {
  const S = A.S, first = ym + '-01', last = monthEnd(first), t = todayStr();
  const days = E.dutyDays(S, first, last), cols = days;
  const st = E.stats(S, first, last);
  const pilots = matrixPilots(days);
  const planned = days.filter(d => E.getDay(S, d));
  const issueDays = planned.filter(d => E.dayIssues(S, d).length);
  let dbl = 0, tri = 0; Object.values(st).forEach(x => { dbl += x.doubles; tri += x.triples; });
  const avail = days.map(d => activePilots().filter(p => !E.awayOn(S, p.id, d)).length);
  const minAv = avail.length ? Math.min(...avail) : activePilots().length, need = S.blocks.length * 2;
  const nextDutyDay = isDuty(t) ? t : E.nextDuty(S, t);
  const genDefault = A.ui.genFrom && A.ui.genFrom.slice(0, 7) === ym ? A.ui.genFrom : (t.slice(0, 7) === ym ? t : first);
  let h = '<div class="monthhead"><a class="btn navbtn" href="#month-' + E.addMonths(ym, -1) + '" aria-label="Previous month">' + icon.prev + '</a><h1 class="disp">' + monthName(ym) + '</h1><a class="btn navbtn" href="#month-' + E.addMonths(ym, 1) + '" aria-label="Next month">' + icon.next + '</a></div>';
  h += '<div class="kpis"><div class="kpi"><b class="num">' + planned.length + '/' + days.length + '</b><span>' + esc(us()) + ' duty days planned</span></div>' +
    '<div class="kpi' + (dbl ? ' warn' : '') + '"><b class="num">' + dbl + '</b><span>back-to-back duty days</span></div>' +
    '<div class="kpi"><b class="num">' + tri + '</b><span>third duty day in a row</span></div>' +
    '<div class="kpi' + (issueDays.length ? ' bad' : '') + '"><b class="num">' + issueDays.length + '</b><span>days that need a look</span></div></div>';
  const minDbl = Math.max(0, 2 * need - minAv);
  h += '<div class="card pad section" style="gap:6px"><p class="eyebrow">Manning</p><p style="margin:0">Lowest availability on a duty day this month: <b>' + minAv + ' of ' + activePilots().length + '</b> pilots for ' + need + ' seats. ' +
    (minAv < need ? 'Some seats will be empty.' : minAv * 2 < 3 * need ? 'With fewer than ' + Math.ceil(1.5 * need) + ' available, some pilots work three duty days in a row.' :
      minDbl ? 'At least <b>' + minDbl + '</b> pilot' + (minDbl === 1 ? '' : 's') + ' must work back-to-back duty days (24 h off between) each time; each pilot away adds one more.' : 'Everyone can get at least one full duty day off between shifts.') + '</p>' + leadNote() + '</div>';
  if (A.ui.awayMsg) h += msgBanner();
  if (!A.ro) h += '<div class="card pad gen"><div class="field"><label for="gen-from">Generate from</label><input id="gen-from" class="inp" type="date" min="' + first + '" max="' + last + '" value="' + genDefault + '"></div>' +
    '<button class="btn btn-primary" data-act="gen" data-ym="' + ym + '">Generate to ' + fmtShort(last) + '</button><button class="btn" data-act="copy-month" data-ym="' + ym + '">' + icon.copy + 'Copy for Excel</button>' +
    '<p class="note" style="flex-basis:100%">Plans ' + esc(us()) + '’s duty days only (every ' + (E.cycleOf(S) === 2 ? 'other day' : E.cycleOf(S) + ' days') + '). Locked days and days before the start date stay as they are.</p></div>';
  if (!days.length) return h + '<p class="note">No ' + esc(us()) + ' duty days this month. Check the duty days in Setup.</p>';
  if (!A.ro) h += '<div class="spread"><p class="eyebrow">Pilots in rank order</p><button class="btn btn-sm" data-act="ord-open">' + icon.grip + 'Reorder</button></div>';
  h += '<div class="mx-wrap"><table class="mx" aria-label="' + esc(us()) + ' duty matrix for ' + monthName(ym) + '"><thead><tr><th class="mx-name" scope="col">Pilot</th>';
  cols.forEach(ds => {
    const d = E.getDay(S, ds), wd = E.dow(ds);
    const cls = [isDuty(ds) ? '' : 'oth', ds === t ? 'today' : '', ds === nextDutyDay && ds !== t ? 'next' : '', d && E.dayIssues(S, ds).length ? 'has-issue' : '', d && d.lock ? 'locked' : '', (S.cfg.extra || []).includes(ds) ? 'swap' : ''].filter(Boolean).join(' ');
    h += '<th scope="col"' + (cls ? ' class="' + cls + '"' : '') + '><a href="#day-' + ds + '" aria-label="' + fmtDay(ds) + '"' + ((S.cfg.extra || []).includes(ds) ? ' title="Swapped in from ' + esc(them()) + '"' : '') + '><span>' + DOW[wd].slice(0, 2) + '</span><b>' + (+ds.slice(8)) + '</b></a></th>';
  });
  h += '</tr></thead><tbody>';
  pilots.forEach(p => {
    h += '<tr><th class="mx-name" scope="row">' + esc(p.cs) + (p.lead ? ' ★' : '') + (p.role ? ' <span class="role">' + esc(p.role) + '</span>' : '') + '</th>';
    cols.forEach(ds => {
      const d = E.getDay(S, ds), a = E.awayOn(S, p.id, ds);
      let wi = -1; if (d) d.w.forEach((w, i) => { if (w.p.includes(p.id)) wi = i; });
      if (wi >= 0) {
        const pv = E.prevDuty(S, ds), y1 = E.onIds(S, pv).has(p.id), y2 = y1 && E.onIds(S, E.prevDuty(S, pv)).has(p.id);
        const night = E.geom(d.w[wi], S.cfg).night;
        const cls = y2 ? 'c-tri' : y1 ? 'c-dbl' : night ? 'c-night' : 'c-on';
        h += '<td class="' + cls + (a ? ' c-bad' : '') + '" data-act="cell" data-ds="' + ds + '" title="' + esc(p.cs) + ' · ' + fmtDay(ds) + ' · watch ' + (wi + 1) + (y2 ? ' · third duty day in a row' : y1 ? ' · back-to-back' : '') + '">' + (wi + 1) + '</td>';
      } else if (a) h += '<td class="c-away" data-act="cell" data-ds="' + ds + '" title="' + esc(p.cs) + ' · ' + esc(a.type) + '">' + awayCode(a.type) + '</td>';
      else if (d && p.active !== false) { const k = E.restOn(S, p.id, ds); h += '<td class="c-rest' + (k ? ' kept' : '') + '" data-act="cell" data-ds="' + ds + '" title="' + esc(p.cs) + ' · ' + fmtDay(ds) + ' · rest day' + (k ? ', kept off alert' : '') + '">R</td>'; }
      else h += '<td data-act="cell" data-ds="' + ds + '"></td>';
    });
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  h += '<div class="legend"><span><i class="sw" style="background:var(--accent-soft);color:var(--tag-ink)">1</i>Watch number</span><span><i class="sw" style="background:var(--night);color:var(--night-ink)">2</i>Night watch</span>' +
    '<span><i class="sw" style="background:var(--warn-soft);color:var(--warn)">3</i>Back-to-back (also on the last duty day)</span><span><i class="sw" style="background:var(--warn-soft);color:var(--warn);box-shadow:inset 0 -2px 0 var(--warn)">4</i>Third duty day in a row</span>' +
    '<span><i class="sw" style="color:var(--ok);font-weight:400">R</i>Rest day (not on alert)</span><span><i class="sw" style="background:var(--ok-soft);color:var(--ok);box-shadow:inset 0 0 0 1px var(--ok)">R</i>Kept off alert (planned rest)</span><span><i class="sw" style="background:var(--away);color:var(--away-ink)">L</i>Leave · C course · D deployed · S sick · O other</span><span>Only ' + esc(us()) + '’s duty days are shown; ' + esc(them()) + '’s days are rest days for everyone not coming off a shift.</span></div>';
  h += '<section class="card section" style="gap:0"><div class="pad" style="padding-bottom:6px"><p class="eyebrow">Fairness · ' + monthName(ym) + '</p></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pilot</th><th>Shifts</th><th>B2B</th><th>3 in a row</th><th>Watch hrs</th><th>Nights</th><th>Late in</th><th>Out ' + esc(E.earlyT(S.cfg)) + '</th><th>Rest days</th><th>Away</th></tr></thead><tbody>' +
    pilots.map(p => { const x = st[p.id]; return '<tr><td class="mono">' + esc(p.cs) + (p.role ? ' <span class="role">' + esc(p.role) + '</span>' : '') + (p.light ? ' <span class="flag flag-ok" title="Fewer watch hours">LIGHT</span>' : '') + '</td><td>' + x.duties + '</td><td' + (x.doubles ? ' class="w"' : '') + '>' + x.doubles + '</td><td' + (x.triples ? ' class="w"' : '') + '>' + x.triples + '</td><td>' + fmtH(x.hours) + '</td><td>' + x.nights + '</td><td>' + x.lateN + '</td><td>' + x.earlyN + '</td><td>' + x.restN + '</td><td>' + (x.away || '') + '</td></tr>'; }).join('') +
    '</tbody></table></div><p class="note pad" style="padding-top:8px">Counts are over ' + esc(us()) + '’s ' + days.length + ' duty days. A rest day is a planned duty day off alert; ' + esc(them()) + '’s days are not counted. Away counts duty days missed.</p></section>';
  return h;
}

function leadNote() {
  const S = A.S, L = activePilots().filter(p => p.lead).length, nb = S.blocks.length;
  if (!L) return '';
  if (L < nb) return '<p class="note" style="color:var(--bad)">Only ' + L + ' flight lead' + (L === 1 ? '' : 's') + ' for ' + nb + ' pairs: some pairs will be two non-leads. Mark more leads.</p>';
  if (L < Math.ceil(1.5 * nb)) return '<p class="note" style="color:var(--warn)">' + L + ' flight leads for ' + nb + ' pairs: the leads work most duty days, and some pairs may end up without one.</p>';
  return '<p class="note">' + L + ' flight leads for ' + nb + ' pairs.</p>';
}

// ----- pilots -----
function viewPilots() {
  const S = A.S, act = activePilots(), gone = byRank(S.pilots.filter(p => p.active === false)), t = todayStr();
  const dis = A.ro ? ' disabled' : '';
  let h = '<div class="col">';
  h += '<section class="section"><div class="spread"><h2 class="eyebrow">' + esc(us()) + ' pilots · ' + act.length + '</h2>' + (A.ro ? '' : '<button class="btn btn-sm" data-act="ord-open">' + icon.grip + 'Reorder</button>') + '</div><div class="card list">' +
    act.map((p, i) => '<div class="pl"><span class="pl-n" aria-label="Rank ' + (i + 1) + '">' + (i + 1) + '</span><input class="inp mono cs-in" id="cs-' + p.id + '" data-pid="' + p.id + '" value="' + esc(p.cs) + '" maxlength="14" aria-label="Callsign"' + dis + '>' +
      '<input class="inp role-in" id="role-' + p.id + '" data-pid="' + p.id + '" value="' + esc(p.role || '') + '" maxlength="5" placeholder="Role" aria-label="Role, for example CO or XO"' + dis + '>' +
      '<div class="pl-opts"><label class="chk"><input type="checkbox" class="lead-in" data-pid="' + p.id + '"' + (p.lead ? ' checked' : '') + dis + '>Flight lead</label>' +
      '<label class="chk"><input type="checkbox" class="light-in" data-pid="' + p.id + '"' + (p.light ? ' checked' : '') + dis + '>Fewer watch hrs</label>' +
      (A.ro ? '' : '<button class="btn btn-sm btn-quiet" data-act="deact" data-pid="' + p.id + '">Remove</button>') + '</div></div>').join('') +
    (A.ro ? '' : '<div class="li"><input class="inp mono" id="new-cs" maxlength="14" placeholder="New callsign" aria-label="New callsign"><span></span><button class="btn btn-sm" data-act="add-pilot">Add pilot</button></div>') +
    '</div><p class="note">Every pair needs a flight lead: two non-leads never stand a watch together. Fewer watch hours gives that pilot the shortest watches (about 7 h instead of 8.5 h) and a smaller share of watch hours.</p>' + leadNote() + '</section>';
  if (gone.length) h += '<section class="section"><h2 class="eyebrow">Removed · kept for past rosters</h2><div class="card list">' + gone.map(p => '<div class="li"><span class="mono">' + esc(p.cs) + '</span><span></span>' + (A.ro ? '' : '<button class="btn btn-sm btn-quiet" data-act="react" data-pid="' + p.id + '">Put back</button>') + '</div>').join('') + '</div></section>';
  h += '<section class="section"><h2 class="eyebrow">Leave, courses and deployments</h2>';
  if (!A.ro) {
    const f = A.ui.awayForm || { pilot: act[0] ? act[0].id : '', type: 'Leave', from: t, to: E.addDays(t, 6) };
    h += '<div class="card pad section"><div class="awayform">' +
      '<div class="field"><label for="aw-p">Pilot</label><select id="aw-p" class="inp">' + act.map(p => '<option value="' + p.id + '"' + (p.id === f.pilot ? ' selected' : '') + '>' + esc(p.cs) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="aw-t">Type</label><select id="aw-t" class="inp">' + AWAY.map(([n]) => '<option' + (n === f.type ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="aw-f">From</label><input id="aw-f" class="inp" type="date" value="' + f.from + '"></div>' +
      '<div class="field"><label for="aw-to">To</label><input id="aw-to" class="inp" type="date" value="' + f.to + '"></div>' +
      '<button class="btn btn-primary" data-act="add-away">Add</button></div><p class="note" id="aw-msg" role="alert"></p></div>';
    if (A.ui.awayMsg) h += msgBanner();
  }
  const periods = S.away.slice().sort((a, b) => (a.to < t) - (b.to < t) || a.from.localeCompare(b.from));
  h += periods.length ? '<div class="card list">' + periods.map(a => {
    const p = E.pilot(S, a.pilot), past = a.to < t, missed = E.dutyDays(S, a.from, a.to).length;
    return '<div class="li"><div style="min-width:0"><span class="mono" style="font-weight:700">' + esc(p ? p.cs : '—') + '</span> <span class="flag flag-mute">' + awayCode(a.type) + '</span><div class="note">' + esc(a.type) + ' · ' + fmtDay(a.from) + ' → ' + fmtDay(a.to, a.to.slice(0, 4) !== t.slice(0, 4)) + ' · ' + missed + ' duty day' + (missed === 1 ? '' : 's') + (past ? ' · finished' : '') + '</div></div><span></span>' +
      (A.ro ? '<span></span>' : '<button class="btn btn-sm btn-quiet btn-danger" data-act="del-away" data-aid="' + a.id + '">Delete</button>') + '</div>';
  }).join('') + '</div>' : '<p class="note">Nobody is away. Add leave, courses and deployments here and the rotation works around them.</p>';
  h += '</section>';
  const need = S.blocks.length * 2, n = act.length, d = Math.max(0, 2 * need - n);
  h += '<div class="callout"><span>' + n + ' pilots for ' + need + ' seats on each ' + esc(us()) + ' duty day: ' + (d ? 'at least ' + d + ' pilot' + (d === 1 ? '' : 's') + ' must work back-to-back duty days each time, and each pilot away adds one more.' : 'everyone can get a full duty day off between shifts.') + '</span>' +
    '<span>Below ' + Math.ceil(1.5 * need) + ' available, someone works three duty days in a row.</span></div>';
  return h + '</div>';
}

// ----- setup -----
function viewSetup() {
  const S = A.S, tc = E.templateCheck(S), dis = A.ro ? ' disabled' : '', c = S.cfg, t = todayStr();
  const nx = isDuty(t) ? t : E.nextDuty(S, t);
  let h = '<div class="col">';
  h += '<section class="section"><h2 class="eyebrow">Duty days</h2><div class="card pad section">' +
    '<div class="grid2"><div class="field"><label for="cfg-us">Your squadron</label><input id="cfg-us" class="inp" maxlength="12" value="' + esc(c.us) + '"' + dis + '></div>' +
    '<div class="field"><label for="cfg-them">Other squadron</label><input id="cfg-them" class="inp" maxlength="12" value="' + esc(c.them) + '"' + dis + '></div>' +
    '<div class="field"><label for="cfg-anchor">One of your duty days</label><input id="cfg-anchor" class="inp" type="date" value="' + esc(c.anchor) + '"' + dis + '></div>' +
    '<div class="field"><label for="cfg-cycle">On duty every</label><select id="cfg-cycle" class="inp"' + dis + '>' + [1, 2, 3, 4].map(k => '<option value="' + k + '"' + (E.cycleOf(S) === k ? ' selected' : '') + '>' + ({ 1: 'day', 2: 'other day', 3: '3rd day', 4: '4th day' })[k] + '</option>').join('') + '</select></div></div>' +
    '<p style="margin:0">' + esc(us()) + ' is next on duty <b>' + (nx ? esc(fmtDay(nx)) : '—') + '</b>, then ' + [1, 2, 3].map(i => { let d = nx; for (let k = 0; k < i && d; k++) d = E.nextDuty(S, d); return d ? esc(fmtDay(d)) : ''; }).filter(Boolean).join(', ') + '.</p>';
  const sw = [...(c.extra || []).map(d => [d, true]), ...(c.skip || []).map(d => [d, false])].sort((a, b) => a[0].localeCompare(b[0]));
  h += sw.length ? '<div class="list" style="border-top:1px solid var(--line)">' + sw.map(([d, ours]) => '<div class="li" style="padding-inline:0"><span>' + esc(fmtDay(d, true)) + ' · ' + esc(ours ? us() + ' takes it' : them() + ' takes it') + '</span><span></span>' + (A.ro ? '<span></span>' : '<button class="btn btn-sm btn-quiet" data-act="unswap" data-ds="' + d + '">Undo swap</button>') + '</div>').join('') + '</div>' : '<p class="note">Swapped a day with ' + esc(them()) + '? Open that day and use the swap button there.</p>';
  h += '</div></section>';
  if (A.ui.awayMsg) h += msgBanner();
  h += '<section class="section"><h2 class="eyebrow">Watches in a shift · ' + S.blocks.length + ' pairs</h2><div class="card list">';
  S.blocks.forEach((b, i) => {
    const g = tc.G[i];
    h += '<div class="blk"><span class="blk-n disp">' + (i + 1) + '</span>' +
      [['s', 'Start'], ['e', 'End']].map(([k, lab]) => '<div class="field f-' + k + '"><label for="b' + i + k + '">' + lab + '</label><input id="b' + i + k + '" class="inp mono inp-time blk-in" data-i="' + i + '" data-k="' + k + '" value="' + esc(b[k]) + '" inputmode="numeric" maxlength="4" pattern="[0-9]{4}"' + (validHHMM(b[k]) ? '' : ' aria-invalid="true"') + dis + '></div>').join('') +
      '<div class="blk-chks f-c"><label class="chk"><input type="checkbox" class="blk-flag" data-i="' + i + '" data-k="late"' + (b.late ? ' checked' : '') + dis + '>Can enter late (' + esc(E.lateT(c)) + ')</label><label class="chk"><input type="checkbox" class="blk-flag" data-i="' + i + '" data-k="early"' + (b.early ? ' checked' : '') + dis + '>Can leave at ' + esc(E.earlyT(c)) + '</label></div>' +
      '<div class="blk-info">' + (g.ok ? fmtH(g.h) + ' h watch' + (g.night ? ' · night' : '') : '<span style="color:var(--bad)">' + (g.late && E.rel(E.lateT(c), c.start) > g.rs ? 'This watch starts before ' + esc(E.lateT(c)) + ', so its pilots can’t enter late. ' : '') + (g.early && E.rel(E.earlyT(c), c.start) < g.re ? 'This watch ends after ' + esc(E.earlyT(c)) + ', so its pilots can’t leave then.' : '') + (g.re <= g.rs ? 'The watch must end after it starts.' : '') + '</span>') + '</div>' +
      (A.ro || S.blocks.length < 2 ? '<span class="blk-x"></span>' : '<button class="btn btn-sm btn-quiet btn-danger blk-x" data-act="del-block" data-i="' + i + '" aria-label="Remove watch ' + (i + 1) + '">Remove</button>') + '</div>';
  });
  h += '</div>' + (A.ro || S.blocks.length >= 6 ? '' : '<div class="row"><button class="btn" data-act="add-block">Add a watch</button></div>') +
    '<p class="note">Times are 24-hour, HHMM. Tick which pairs may enter late or leave early; the daily limits are under Shift. Changes apply to days you generate from now on.</p></section>';
  h += '<figure class="card pad strip"><figcaption class="eyebrow">Shift timeline</figcaption>' + strip(S.blocks, false) + '</figure>';
  const s0 = E.toMin(c.start), tm = m => E.hhmm(m + s0);
  const gapTxt = tc.gaps.map(([a, b]) => tm(a) + '–' + tm(b)).join(', ');
  h += '<section class="card pad section"><p class="eyebrow">Checks</p><ul class="checks">' +
    '<li><span class="' + (tc.gaps.length ? 'no' : 'ok') + '">' + (tc.gaps.length ? '✕' : '✓') + '</span><span>' + (tc.gaps.length ? 'No pair on watch ' + gapTxt : 'A pair is on watch from ' + c.start + ' to ' + c.start + ' with no gaps') + '</span></li>' +
    '<li><span class="' + (tc.okAt ? 'ok' : 'no') + '">' + (tc.okAt ? '✓' : '✕') + '</span><span>' + (tc.okAt ? 'At least ' + tc.minAt + ' at the alert building all the time (need ' + c.minAt + ')' : 'Only ' + tc.low.map(s => s.n + ' from ' + tm(s.a) + ' to ' + tm(s.b)).join(', ') + ' (need ' + c.minAt + ')') + '</span></li>' +
    (tc.bad.length ? '<li><span class="no">✕</span><span>Fix the times on watch ' + tc.bad.map(i => i + 1).join(', ') + '</span></li>' : '') +
    (() => { const L = activePilots().filter(p => p.lead).length, nb = S.blocks.length; return L ? '<li><span class="' + (L >= Math.ceil(1.5 * nb) ? 'ok' : 'no') + '">' + (L >= Math.ceil(1.5 * nb) ? '✓' : '✕') + '</span><span>' + L + ' flight leads for ' + nb + ' pairs' + (L >= Math.ceil(1.5 * nb) ? '' : ' — mark more leads in Pilots, or some pairs will lack one') + '</span></li>' : ''; })() + '</ul></section>';
  h += '<section class="section"><h2 class="eyebrow">Shift</h2><div class="card pad grid2">' +
    '<div class="field"><label for="cfg-start">Shift change</label><input id="cfg-start" class="inp mono inp-time" value="' + c.start + '" inputmode="numeric" maxlength="4"' + dis + '></div>' +
    '<div class="field"><label for="cfg-late">Late entry time</label><input id="cfg-late" class="inp mono inp-time" value="' + esc(E.lateT(c)) + '" inputmode="numeric" maxlength="4"' + dis + '></div>' +
    '<div class="field"><label for="cfg-maxlate">Most entering late</label><input id="cfg-maxlate" class="inp" type="number" min="0" max="16" value="' + E.capLate(c) + '"' + dis + '></div>' +
    '<div class="field"><label for="cfg-early">Early leave time</label><input id="cfg-early" class="inp mono inp-time" value="' + esc(E.earlyT(c)) + '" inputmode="numeric" maxlength="4"' + dis + '></div>' +
    '<div class="field"><label for="cfg-maxearly">Most leaving early</label><input id="cfg-maxearly" class="inp" type="number" min="0" max="16" value="' + E.capEarly(c) + '"' + dis + '></div>' +
    '<div class="field"><label for="cfg-min">At the building, minimum</label><input id="cfg-min" class="inp" type="number" min="1" max="40" value="' + c.minAt + '"' + dis + '></div>' +
    '<div class="field"><label for="cfg-n1">Night from</label><input id="cfg-n1" class="inp mono inp-time" value="' + c.nightFrom + '" inputmode="numeric" maxlength="4"' + dis + '></div>' +
    '<div class="field"><label for="cfg-n2">Night to</label><input id="cfg-n2" class="inp mono inp-time" value="' + c.nightTo + '" inputmode="numeric" maxlength="4"' + dis + '></div>' +
    '</div><p class="note">Each duty day, up to ' + E.capLate(c) + ' pilots enter late and up to ' + E.capEarly(c) + ' leave at ' + esc(E.earlyT(c)) + '. Every duty day a pilot is not on alert is a rest day; the day view shows who rests and who gets the next duty day off. To give a pilot rest on a set day, or several duty days in a row, use Edit under Rest day: Generate keeps them off alert. A pilot on alert can rest instead, with someone off alert taking the watch. Back-to-back pilots get late entry and early leave first; after that they rotate so everyone gets a fair share. On the watch bill, tap a time to change it for that day.</p></section>';
  h += '<section class="section"><h2 class="eyebrow">Your data</h2><div class="card pad section"><p style="margin:0">' +
    (A.mode === 'db' ? 'Saved with this page, so it’s the same on your phone and computer. People you share the page with can see it; only editors can change it.'
      : isApp() ? 'Saved on this phone only: no account and no server. Removing the app from your home screen deletes it, so back up once a month and keep the file somewhere safe, like iCloud Drive or Google Drive.'
      : 'Saved in this browser only. Make a backup before you clear the browser or switch devices.') + '</p>' +
    (isApp() ? '<p class="note" style="margin:0">' + esc(backupLine()) + '</p>' : '') +
    (isApp() && !installed() ? '<p class="note" style="margin:0"><b>Install it:</b> iPhone, Safari → Share → Add to Home Screen. Android, Chrome → ⋮ → Add to Home screen. On iPhone the home-screen app keeps its own data, so back up here first, then restore in the app.</p>' : '') +
    '<div class="row">' + (isApp() ? '<button class="btn btn-primary" data-act="backup-file">Back up now</button><button class="btn" data-act="backup">Copy as text</button>' : '<button class="btn" data-act="backup">Backup</button>') + (A.ro ? '' : '<button class="btn" data-act="restore-open">Restore</button><button class="btn" data-act="example">Load example</button><button class="btn btn-danger" data-act="wipe">Delete everything</button>') + '</div></div></section>';
  return h + '</div>';
}

// ----- sheets -----
function sheet() {
  const s = A.ui.sheet; if (!s) return '';
  let head = '', body = '', foot = '';
  if (s.type === 'pick') {
    const S = A.S, day = E.getDay(S, s.ds); if (!day) return '';
    const w = day.w[s.wi], cur = w.p[s.si];
    const nx = E.nextDuty(S, s.ds), nxDay = E.getDay(S, nx), nxOpen = !!nxDay && !nxDay.lock;
    const st = E.stats(S, s.ds.slice(0, 7) + '-01', monthEnd(s.ds));
    const where = id => { let r = null; day.w.forEach((x, i) => x.p.forEach((y, j) => { if (y === id) r = { i, j }; })); return r; };
    const row = (p, info, flag, disabled) => '<button class="pick' + (p.id === cur ? ' cur' : '') + '" data-act="seat" data-pid="' + p.id + '"' + (disabled ? ' disabled' : '') + '><span class="tag tag-sm">' + esc(p.cs) + '</span><span class="pick-info">' + info + '</span>' + (flag || '<span></span>') + '</button>';
    const free = [], onDuty = [], away = [], blocked = [], kept = [];
    activePilots().forEach(p => {
      const a = E.awayOn(S, p.id, s.ds), wh = where(p.id), n = st[p.id].duties;
      if (a) { away.push(row(p, esc(a.type), '<span class="flag flag-mute">' + awayCode(a.type) + '</span>', true)); return; }
      if (wh && s.rest) return;
      if (!wh && E.restOn(S, p.id, s.ds)) {
        const okP = E.pairOk(S, p.id, w.p[1 - s.si]);
        kept.push(row(p, okP ? 'Kept off alert today. Picking them cancels that planned rest.' : 'Kept off alert today, and a non-lead like ' + esc(cs(w.p[1 - s.si])), '<span class="flag ' + (okP ? 'flag-warn">KEPT OFF' : 'flag-bad">NO LEAD') + '</span>', !okP)); return;
      }
      if (wh) {
        const okSwap = p.id === cur || (E.pairOk(S, p.id, w.p[1 - s.si]) && E.pairOk(S, cur, day.w[wh.i].p[1 - wh.j]) || wh.i === s.wi);
        onDuty.push(row(p, p.id === cur ? 'In this seat now' : okSwap ? 'On watch ' + (wh.i + 1) + ' — swap seats' : 'Swap would put two non-leads together', okSwap ? '' : '<span class="flag flag-bad">NO LEAD</span>', p.id === cur || !okSwap)); return;
      }
      if (!E.pairOk(S, p.id, w.p[1 - s.si])) { blocked.push(row(p, 'Non-lead, and ' + esc(cs(w.p[1 - s.si])) + ' is a non-lead too', '<span class="flag flag-bad">NO LEAD</span>', true)); return; }
      const r = E.runAround(S, s.ds, p.id, false);
      const flag = r.run >= 3 ? '<span class="flag flag-warn">' + r.run + ' IN A ROW</span>' : r.run === 2 ? '<span class="flag flag-warn">B2B</span>' : '<span class="flag flag-ok">RESTED</span>';
      const sides = [r.back ? 'worked the last duty day' : '', r.fwd ? 'on the next duty day' : ''].filter(Boolean).join(' and ');
      free.push({ k: r.run, n, html: row(p, n + ' shift' + (n === 1 ? '' : 's') + ' this month' + (sides ? ' · ' + sides : ''), flag) });
    });
    free.sort((a, b) => a.k - b.k || a.n - b.n);
    const allLong = free.length && free.every(x => x.k >= 3);
    const mate = w.p[1 - s.si];
    head = s.rest && cur ? '<h2 class="disp">' + esc(cs(cur)) + ' rests · who takes watch ' + (s.wi + 1) + '?</h2><p>' + esc(fmtDay(s.ds)) + ' · ' + w.s + '–' + w.e + (mate ? ' · partner ' + esc(cs(mate)) + ((E.pilot(S, mate) || {}).lead ? ' (lead)' : '') : '') + '</p>'
      : '<h2 class="disp">Watch ' + (s.wi + 1) + ' · ' + w.s + '–' + w.e + '</h2><p>' + esc(fmtDay(s.ds)) + ' · ' + (cur ? 'replacing ' + esc(cs(cur)) : 'empty seat') + (mate ? ' · partner ' + esc(cs(mate)) + ((E.pilot(S, mate) || {}).lead ? ' (lead)' : '') : '') + '</p>';
    const g0 = E.geom(w, S.cfg), sg0 = cur ? E.seatGeom(w, s.si, S.cfg) : null;
    const perkBtn = (kind, on, label) => '<button class="btn btn-sm' + (on ? ' is-on' : '') + '" data-act="perk" data-kind="' + kind + '" data-ds="' + s.ds + '" data-wi="' + s.wi + '" data-si="' + s.si + '" aria-pressed="' + on + '">' + label + (on ? ' ✓' : '') + '</button>';
    const perks = cur && !s.rest && (g0.late || g0.early) ? '<p class="eyebrow bs-group">' + esc(cs(cur)) + '’s times · normally ' + S.cfg.start + '</p><div class="row">' +
      (g0.late ? perkBtn('late', sg0.lateIn, 'Enters late at ' + E.lateT(S.cfg)) : '') + (g0.early ? perkBtn('early', sg0.earlyOut, 'Leaves at ' + E.earlyT(S.cfg)) : '') + '</div>' : '';
    body = perks + '<p class="eyebrow bs-group">Resting today · best first</p>' +
      (allLong ? '<p class="note">Everyone resting today worked the last duty day and is on the next one, so whoever you pick works three in a row' + (nxOpen ? ' unless you re-plan from ' + esc(fmtDay(nx)) : '') + '.</p>' : '') +
      (free.length ? free.map(x => x.html).join('') : '<p class="note">Nobody else is free that day.</p>') +
      (kept.length ? '<p class="eyebrow bs-group">Kept off alert today</p>' + kept.join('') : '') +
      (s.rest ? '' : '<p class="eyebrow bs-group">On this shift</p>' + onDuty.join('')) +
      (blocked.length ? '<p class="eyebrow bs-group">Needs a flight lead partner</p>' + blocked.join('') : '') + (away.length ? '<p class="eyebrow bs-group">Away</p>' + away.join('') : '');
    foot = (cur && !s.rest ? '<button class="btn btn-danger" data-act="seat" data-pid="">Leave seat empty</button>' : '') + '<button class="btn" data-act="' + (s.rest ? 'rest-back' : 'close') + '" data-autofocus>' + (s.rest ? 'Back' : 'Cancel') + '</button>';
  } else if (s.type === 'copy') {
    head = '<h2 class="disp">Copy ' + esc(s.what.toLowerCase()) + '</h2><p>Your browser blocked the copy button. Select the text and copy it.</p>';
    body = '<textarea id="copy-ta" class="inp mono" rows="10" readonly>' + esc(s.text) + '</textarea>';
    foot = '<button class="btn" data-act="close" data-autofocus>Done</button>';
  } else if (s.type === 'backup') {
    head = '<h2 class="disp">Backup</h2><p>All pilots, leave, watches, duty days and every planned month. Paste it into Restore on any device.</p>';
    body = '<textarea id="backup-ta" class="inp mono" rows="8" readonly>' + esc(backupText()) + '</textarea>';
    foot = '<button class="btn btn-primary" data-act="copy-backup" data-autofocus>' + icon.copy + 'Copy backup</button><button class="btn" data-act="close">Close</button>';
  } else if (s.type === 'restore') {
    head = '<h2 class="disp">Restore a backup</h2><p>This replaces everything here with the backup.</p>';
    body = '<div class="field"><label for="restore-ta">Backup text</label><textarea id="restore-ta" class="inp mono" rows="7" placeholder="Paste the backup here">' + esc(A.ui.restoreText) + '</textarea></div>' +
      '<div class="field"><label for="restore-file">Or choose a backup file</label><input id="restore-file" type="file" accept=".json,.txt,application/json,text/plain"></div>' +
      (A.ui.restoreErr ? '<p class="note" role="alert" style="color:var(--bad)">' + esc(A.ui.restoreErr) + '</p>' : '');
    foot = '<button class="btn btn-primary" data-act="restore-go">Replace with backup</button><button class="btn" data-act="close" data-autofocus>Cancel</button>';
  } else if (s.type === 'rest') {
    const S = A.S, ds = s.ds, day = E.getDay(S, ds), kept = new Set(E.getRest(S, ds));
    const keepBtn = (id, k) => '<button class="btn btn-sm' + (k ? ' is-on' : '') + '" data-act="rest-keep" data-pid="' + id + '" aria-pressed="' + k + '">' + (k ? 'Kept off ✓' : 'Keep off') + '</button>';
    const nextBtn = id => '<button class="btn btn-sm" data-act="rest-next" data-pid="' + id + '">+ Next duty day</button>';
    head = '<h2 class="disp">Rest · ' + esc(fmtDay(ds)) + '</h2><p>' + (day ? 'Everyone not on alert rests. Keep someone off so Generate leaves them off, or let a pilot on alert rest instead.' : 'Not planned yet. Pilots kept off stay off when you generate it.') + '</p>';
    if (day) {
      const resting = restingOn(ds);
      body = '<p class="eyebrow bs-group">Resting · not on alert · ' + resting.length + '</p>' + (resting.length ? resting.map(p => {
        const r = E.offRun(S, p.id, ds), k = kept.has(p.id);
        const info = (r.n > 1 ? 'Off ' + r.n + ' duty days in a row · ' + fmtShort(r.from) + ' – ' + fmtShort(r.to) : 'Off this duty day') + (r.next ? ' · on alert ' + fmtShort(r.next) : '');
        return '<div class="rrow"><span class="tag tag-sm rest' + (k ? ' kept' : '') + '">' + esc(p.cs) + '</span><span class="pick-info">' + esc(info) + '</span><span class="row rrow-act">' + keepBtn(p.id, k) + nextBtn(p.id) + '</span></div>';
      }).join('') : '<p class="note">Nobody. Everyone available is on alert.</p>');
      let onRows = '';
      day.w.forEach((w, wi) => w.p.forEach((id, si) => {
        if (!id) return;
        const k = kept.has(id);
        onRows += '<div class="rrow"><span class="tag tag-sm' + (k ? ' bad' : '') + '">' + esc(cs(id)) + '</span><span class="pick-info">Watch ' + (wi + 1) + ' · ' + w.s + '–' + w.e + (k ? ' · kept off, but on alert' : '') + '</span><span class="row rrow-act"><button class="btn btn-sm" data-act="rest-give" data-wi="' + wi + '" data-si="' + si + '">Rest instead</button>' + (k ? keepBtn(id, true) : '') + '</span></div>';
      }));
      body += '<p class="eyebrow bs-group">On alert · let one rest instead</p>' + (onRows || '<p class="note">Nobody on alert.</p>');
    } else {
      const ps = activePilots().filter(p => !E.awayOn(S, p.id, ds)).sort((a, b) => (kept.has(b.id) ? 1 : 0) - (kept.has(a.id) ? 1 : 0));
      body = '<p class="eyebrow bs-group">Kept off alert · ' + kept.size + '</p>' + ps.map(p => '<div class="rrow"><span class="tag tag-sm' + (kept.has(p.id) ? ' rest kept' : '') + '">' + esc(p.cs) + '</span><span class="pick-info">' + (kept.has(p.id) ? 'Rests this day' : 'Not decided yet') + '</span><span class="row rrow-act">' + keepBtn(p.id, kept.has(p.id)) + (kept.has(p.id) ? nextBtn(p.id) : '') + '</span></div>').join('');
    }
    foot = '<button class="btn btn-primary" data-act="close" data-autofocus>Done</button>';
  } else if (s.type === 'order') {
    const ps = activePilots();
    head = '<h2 class="disp">Pilot order</h2><p>Put the pilots in rank order: drag the handle or use the arrows. The Month and Pilots lists follow it.</p>';
    body = '<ol class="ord" aria-label="Pilot order">' + ps.map((p, i) => '<li class="ord-row" data-pid="' + p.id + '"><span class="ord-n">' + (i + 1) + '</span>' +
      '<span class="ord-cs">' + esc(p.cs) + (p.lead ? ' ★' : '') + (p.role ? ' <span class="role">' + esc(p.role) + '</span>' : '') + '</span>' +
      '<button class="btn btn-sm ord-b" id="ou-' + p.id + '" data-act="ord-up" data-pid="' + p.id + '" aria-label="Move ' + esc(p.cs) + ' up"' + (i ? '' : ' disabled') + '>' + icon.up + '</button>' +
      '<button class="btn btn-sm ord-b" id="od-' + p.id + '" data-act="ord-dn" data-pid="' + p.id + '" aria-label="Move ' + esc(p.cs) + ' down"' + (i < ps.length - 1 ? '' : ' disabled') + '>' + icon.down + '</button>' +
      '<span class="ord-h" title="Drag to move">' + icon.grip + '</span></li>').join('') + '</ol>';
    foot = '<button class="btn btn-primary" data-act="close" data-autofocus>Done</button>';
  } else if (s.type === 'confirm') {
    head = '<h2 class="disp">' + esc(s.title) + '</h2><p>' + esc(s.text) + '</p>';
    foot = '<button class="btn ' + (s.danger ? 'btn-danger' : 'btn-primary') + '" data-act="confirm-yes">' + esc(s.yes) + '</button><button class="btn" data-act="close" data-autofocus>Cancel</button>';
  }
  const fresh = !s._shown; s._shown = true;
  return '<div class="scrim" data-act="close"></div><section class="bs' + (fresh ? ' bs-in' : '') + '" role="dialog" aria-modal="true" aria-labelledby="bs-title"><div class="bs-head"><div id="bs-title">' + head + '</div></div>' +
    (body ? '<div class="bs-body">' + body + '</div>' : '') + '<div class="bs-foot">' + foot + '</div></section>';
}
function openSheet(s) { A.ui.sheet = s; render(); }
function closeSheet() { A.ui.sheet = null; render(); }
function confirmThen(title, text, yes, fn, danger) { openSheet({ type: 'confirm', title, text, yes, fn, danger }); }

// ---------- events ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, d = el.dataset, S = A.S;
  switch (act) {
    case 'close': closeSheet(); break;
    case 'undo': undo(); break;
    case 'pick': openSheet({ type: 'pick', ds: d.ds, wi: +d.wi, si: +d.si }); break;
    case 'seat': { const s = A.ui.sheet; A.ui.sheet = s.rest ? { type: 'rest', ds: s.ds } : null; setSeat(s.ds, s.wi, s.si, d.pid || null, !!s.rest); render(); break; }
    case 'perk': togglePerk(d.ds, +d.wi, +d.si, d.kind); break;
    case 'rest-open': openSheet({ type: 'rest', ds: d.ds }); break;
    case 'ord-open': openSheet({ type: 'order' }); break;
    case 'ord-up': case 'ord-dn': { const i = activePilots().findIndex(p => p.id === d.pid); movePilot(d.pid, i + (act === 'ord-up' ? -1 : 1)); break; }
    case 'rest-keep': { const ds = A.ui.sheet.ds; if (E.restOn(S, d.pid, ds)) release(ds, d.pid); else keepOff(ds, d.pid); break; }
    case 'rest-next': keepNext(A.ui.sheet.ds, d.pid); break;
    case 'rest-give': A.ui.sheet = { type: 'pick', ds: A.ui.sheet.ds, wi: +d.wi, si: +d.si, rest: true }; render(); break;
    case 'rest-back': A.ui.sheet = { type: 'rest', ds: A.ui.sheet.ds }; render(); break;
    case 'cell': go('day-' + d.ds); break;
    case 'plan-day': doGenerate(d.ds, d.ds); break;
    case 'plan-rest': doGenerate(d.ds, monthEnd(d.ds)); break;
    case 'replan-day': { const day = E.getDay(S, d.ds); if (day) day.lock = false; doGenerate(d.ds, d.ds, 'Re-planned ' + fmtShort(d.ds)); break; }
    case 'unlock': case 'lock': { const day = E.getDay(S, d.ds); if (!day) break; day.lock = act === 'lock'; touchMonth(d.ds); toast(act === 'lock' ? 'Locked. Generate won’t change this day.' : 'Unlocked. The next Generate can change this day.'); render(); break; }
    case 'drop-day': E.setDay(S, d.ds, null); touchMonth(d.ds); render(); break;
    case 'swap-in': swapDay(d.ds, true); break;
    case 'swap-out': confirmThen('Give ' + fmtDay(d.ds) + ' to ' + them() + '?', 'This day’s watch bill is removed. You can undo it, or swap it back from Setup.', 'Give the day to ' + them(), () => swapDay(d.ds, false), true); break;
    case 'unswap': { remember(); S.cfg.extra = S.cfg.extra.filter(x => x !== d.ds); S.cfg.skip = S.cfg.skip.filter(x => x !== d.ds); Store.touch('config'); if (!isDuty(d.ds)) { E.setDay(S, d.ds, null); touchMonth(d.ds); } const nx = E.isDuty(S, d.ds) ? d.ds : E.nextDuty(S, d.ds); A.ui.awayMsg = nx ? { text: 'Swap undone for ' + fmtDay(d.ds) + '. Re-plan so the rotation stays even.', from: nx } : null; render(); break; }
    case 'copy-day': copyText(dayText(d.ds), 'Watch bill'); break;
    case 'copy-month': copyText(monthTSV(d.ym), 'Month'); break;
    case 'gen': { const inp = $('#gen-from'); const from = inp && inp.value ? inp.value : d.ym + '-01'; if (from.slice(0, 7) !== d.ym) { toast('Pick a start date in ' + monthName(d.ym)); break; } A.ui.genFrom = from; doGenerate(from, monthEnd(from)); break; }
    case 'create': {
      const raw = ($('#ob-cs') || {}).value || '', anchor = ($('#ob-day') || {}).value || todayStr();
      const list = [...new Set(raw.split(/[\n,;]+/).map(x => x.trim().toUpperCase().slice(0, 14)).filter(Boolean))];
      const need = DEF_BLOCKS().length * 2;
      if (list.length < need) { const m = $('#ob-msg'); if (m) { m.textContent = 'Add at least ' + need + ' callsigns. A shift has ' + need + ' seats and you have ' + list.length + '.'; m.style.color = 'var(--bad)'; } break; }
      createRoster(list, anchor); break;
    }
    case 'example': if (A.has) confirmThen('Load the example?', 'This replaces your pilots, leave and every planned month with an example. Make a backup first if you want to keep them.', 'Replace with example', loadExample, true); else loadExample(); break;
    case 'dismiss-example': S.example = false; Store.touch('config'); render(); break;
    case 'add-pilot': {
      const inp = $('#new-cs'); const v = inp ? inp.value.trim().toUpperCase().slice(0, 14) : '';
      if (!v) { if (inp) inp.focus(); break; }
      if (S.pilots.some(p => p.cs === v && p.active !== false)) { toast(v + ' is already on the rotation'); break; }
      S.pilots.push({ id: newId(), cs: v, lead: false, active: true }); Store.touch('config'); toast(v + ' added. Generate the month to put them on the roster.'); render(); break;
    }
    case 'deact': {
      const p = E.pilot(S, d.pid); if (!p) break;
      p.active = false; Store.touch('config');
      const c = conflictsFor(p.id, todayStr(), lastPlanned() || todayStr());
      A.ui.awayMsg = c.length ? { text: p.cs + ' was removed but is still on ' + c.length + ' planned shift' + (c.length === 1 ? '' : 's') + ' from ' + fmtShort(c[0]) + '.', from: c[0] } : null;
      toast(p.cs + ' removed from the rotation'); render(); break;
    }
    case 'react': { const p = E.pilot(S, d.pid); if (!p) break; p.active = true; Store.touch('config'); render(); break; }
    case 'add-away': {
      const pid = $('#aw-p').value, type = $('#aw-t').value, from = $('#aw-f').value, to = $('#aw-to').value, msg = $('#aw-msg');
      A.ui.awayForm = { pilot: pid, type, from, to };
      if (!pid || !from || !to) { msg.textContent = 'Choose a pilot and both dates.'; break; }
      if (to < from) { msg.textContent = 'The end date is before the start date.'; break; }
      S.away.push({ id: 'a' + newId(), pilot: pid, type, from, to }); Store.touch('config');
      const c = conflictsFor(pid, from, to);
      A.ui.awayMsg = c.length ? { text: cs(pid) + ' is on ' + c.length + ' planned shift' + (c.length === 1 ? '' : 's') + ' in that period.', from: c[0] } : null;
      A.ui.awayForm = null;
      toast(cs(pid) + ' · ' + type.toLowerCase() + ' ' + fmtShort(from) + ' – ' + fmtShort(to)); render(); break;
    }
    case 'del-away': S.away = S.away.filter(a => a.id !== d.aid); Store.touch('config'); render(); break;
    case 'replan-from': A.ui.awayMsg = null; replanFrom(d.ds); break;
    case 'dismiss-msg': A.ui.awayMsg = null; render(); break;
    case 'add-block': { const last = S.blocks[S.blocks.length - 1]; S.blocks.push({ s: last ? last.e : S.cfg.start, e: S.cfg.start, late: false, early: false }); Store.touch('config'); render(); break; }
    case 'del-block': S.blocks.splice(+d.i, 1); Store.touch('config'); render(); break;
    case 'backup': openSheet({ type: 'backup' }); break;
    case 'copy-backup': copyText(backupText(), 'Backup'); break;
    case 'restore-open': A.ui.restoreErr = ''; openSheet({ type: 'restore' }); break;
    case 'restore-go': {
      const ta = $('#restore-ta'); const text = ta ? ta.value : A.ui.restoreText;
      const o = parseBackup(text);
      if (typeof o === 'string') { A.ui.restoreErr = o; A.ui.restoreText = text; render(); break; }
      A.ui.restoreText = ''; A.ui.restoreErr = '';
      confirmThen('Replace with this backup?', 'Backup from ' + (o.exportedAt ? fmtDay(o.exportedAt.slice(0, 10), true) : 'an unknown date') + ' · ' + o.config.pilots.length + ' pilots · ' + Object.keys(o.months || {}).length + ' month(s). Everything here now is replaced.', 'Replace', () => restore(o), true);
      break;
    }
    case 'wipe': confirmThen('Delete everything?', 'Pilots, leave, watches and every planned month are deleted ' + (A.mode === 'db' ? 'for everyone who uses this page' : 'from this ' + (isApp() ? 'phone' : 'browser')) + '. Make a backup first if you might need them.', 'Delete everything', wipe, true); break;
    case 'backup-file': backupFile(); break;
    case 'backup-later': setMeta({ snooze: E.addDays(todayStr(), 7) }); render(); break;
    case 'reload-app': Store.flushAll(); location.reload(); break;
    case 'confirm-yes': { const s = A.ui.sheet; A.ui.sheet = null; if (s && s.fn) s.fn(); else render(); break; }
  }
});
let drag = null;
document.addEventListener('pointerdown', e => {
  const hd = e.target.closest('.ord-h'); if (!hd || A.ro || drag) return;
  const row = hd.closest('.ord-row'), list = row.parentElement, rows = [...list.children];
  const scroller = list.closest('.bs-body');
  const step = rows.length > 1 ? rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top : row.getBoundingClientRect().height;
  drag = { row, list, rows, from: rows.indexOf(row), to: rows.indexOf(row), y0: e.clientY, y: e.clientY, s0: scroller ? scroller.scrollTop : 0, scroller, step, id: e.pointerId };
  try { hd.setPointerCapture(e.pointerId); } catch (_) {}
  row.classList.add('drag'); list.classList.add('dragging');
  e.preventDefault();
  requestAnimationFrame(dragTick);
});
function dragPaint() {
  const d = drag, dy = d.y - d.y0 + (d.scroller ? d.scroller.scrollTop - d.s0 : 0);
  const to = Math.max(0, Math.min(d.rows.length - 1, d.from + Math.round(dy / d.step)));
  d.to = to;
  d.rows.forEach((r, i) => {
    r.style.transform = r === d.row ? 'translateY(' + dy + 'px)'
      : d.from < to && i > d.from && i <= to ? 'translateY(' + -d.step + 'px)'
      : d.from > to && i >= to && i < d.from ? 'translateY(' + d.step + 'px)' : '';
  });
}
function dragTick() { // scroll the list when the row is held near its top or bottom edge
  if (!drag) return;
  const s = drag.scroller;
  if (s) {
    const b = s.getBoundingClientRect(), edge = 56, y = drag.y;
    const v = y < b.top + edge ? -Math.ceil((b.top + edge - y) / 5) : y > b.bottom - edge ? Math.ceil((y - b.bottom + edge) / 5) : 0;
    if (v) { const before = s.scrollTop; s.scrollTop += v; if (s.scrollTop !== before) dragPaint(); }
  }
  requestAnimationFrame(dragTick);
}
document.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; drag.y = e.clientY; dragPaint(); e.preventDefault(); }, { passive: false });
function dragEnd(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null;
  d.rows.forEach(r => { r.style.transform = ''; });
  d.row.classList.remove('drag'); d.list.classList.remove('dragging');
  if (e.type === 'pointerup' && d.to !== d.from) movePilot(d.row.dataset.pid, d.to);
}
document.addEventListener('pointerup', dragEnd);
document.addEventListener('pointercancel', dragEnd);
document.addEventListener('change', e => {
  const el = e.target, S = A.S;
  const hhmmInput = v => { const x = v.trim().replace(/\D/g, ''); if (!validHHMM(x)) { el.setAttribute('aria-invalid', 'true'); toast('Use 24-hour time, four digits, like 0930'); return null; } return x; };
  if (el.classList.contains('cs-in')) {
    const p = E.pilot(S, el.dataset.pid), v = el.value.trim().toUpperCase().slice(0, 14);
    if (!p) return; if (!v) { el.value = p.cs; return; }
    p.cs = v; Store.touch('config'); render(); return;
  }
  if (el.classList.contains('lead-in')) { const p = E.pilot(S, el.dataset.pid); if (p) { p.lead = el.checked; Store.touch('config'); render(); } return; }
  if (el.classList.contains('light-in')) { const p = E.pilot(S, el.dataset.pid); if (p) { p.light = el.checked; Store.touch('config'); toast(p.cs + (p.light ? ' gets the shortest watches from the next Generate' : ' is back to normal watches from the next Generate')); render(); } return; }
  if (el.classList.contains('role-in')) { const p = E.pilot(S, el.dataset.pid); if (p) { p.role = el.value.trim().toUpperCase().slice(0, 5); Store.touch('config'); render(); } return; }
  if (el.classList.contains('blk-flag')) { S.blocks[+el.dataset.i][el.dataset.k] = el.checked; Store.touch('config'); render(); return; }
  if (el.classList.contains('blk-in')) { const v = hhmmInput(el.value); if (v === null) return; S.blocks[+el.dataset.i][el.dataset.k] = v; Store.touch('config'); render(); return; }
  if (el.id === 'cfg-start' || el.id === 'cfg-n1' || el.id === 'cfg-n2' || el.id === 'cfg-early' || el.id === 'cfg-late') {
    const v = hhmmInput(el.value); if (v === null) return;
    const key = { 'cfg-start': 'start', 'cfg-n1': 'nightFrom', 'cfg-n2': 'nightTo', 'cfg-early': 'earlyOut', 'cfg-late': 'lateIn' }[el.id];
    S.cfg[key] = v; Store.touch('config'); render(); return;
  }
  if (el.id === 'cfg-maxlate' || el.id === 'cfg-maxearly') {
    S.cfg[{ 'cfg-maxlate': 'maxLate', 'cfg-maxearly': 'maxEarly' }[el.id]] = Math.max(0, Math.min(16, parseInt(el.value, 10) || 0));
    Store.touch('config'); toast('Limit saved. Generate again to apply it to planned days.'); render(); return;
  }
  if (el.id === 'cfg-min') { S.cfg.minAt = Math.max(1, Math.min(40, parseInt(el.value, 10) || 1)); Store.touch('config'); render(); return; }
  if (el.id === 'cfg-us' || el.id === 'cfg-them') { const v = el.value.trim().slice(0, 12); if (!v) { el.value = S.cfg[el.id === 'cfg-us' ? 'us' : 'them']; return; } S.cfg[el.id === 'cfg-us' ? 'us' : 'them'] = v; Store.touch('config'); render(); return; }
  if (el.id === 'cfg-anchor' || el.id === 'cfg-cycle') {
    if (el.id === 'cfg-anchor') { if (!el.value) return; S.cfg.anchor = el.value; } else S.cfg.cycle = +el.value;
    S.cfg.extra = []; S.cfg.skip = []; Store.touch('config');
    const t = todayStr(), nx = isDuty(t) ? t : E.nextDuty(S, t);
    A.ui.awayMsg = nx ? { text: 'Duty days changed. Planned days on the wrong dates are replaced when you re-plan.', from: nx } : null;
    render(); return;
  }
  if (el.id === 'gen-from') { A.ui.genFrom = el.value; return; }
  if (el.id === 'restore-file' && el.files && el.files[0]) {
    const fr = new FileReader();
    fr.onload = () => { A.ui.restoreText = String(fr.result || ''); A.ui.restoreErr = ''; render(); };
    fr.onerror = () => { A.ui.restoreErr = 'That file couldn’t be read.'; render(); };
    fr.readAsText(el.files[0]);
  }
});
document.addEventListener('input', e => { if (e.target.id === 'restore-ta') A.ui.restoreText = e.target.value; });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && A.ui.sheet) { e.preventDefault(); closeSheet(); }
  if (e.key === 'Enter' && e.target.id === 'new-cs') { e.preventDefault(); const b = $('[data-act="add-pilot"]'); if (b) b.click(); }
});
window.addEventListener('hashchange', () => { A.ui.sheet = null; render(); window.scrollTo(0, 0); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Store.flushAll(); });
window.addEventListener('pagehide', () => Store.flushAll());
setInterval(() => { if (A.ready && !A.ui.sheet && route().v === 'day') { const el = document.activeElement; if (!el || el === document.body) render(); } }, 60000);

render();
Store.init();
registerSW();
})();
