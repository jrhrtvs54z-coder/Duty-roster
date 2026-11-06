/* ENGINE — rotation + watch-bill logic for one squadron that shares the alert with another.
   S = { pilots:[{id,cs,lead,active}], away:[{id,pilot,type,from,to}],
         blocks:[{s,e,late,early}],   // watch start/end ("HHMM"); may that pair enter late / leave early
         cfg:{start,minAt,nightFrom,nightTo,lateIn,earlyOut,maxLate,maxEarly,cycle,anchor,extra:[],skip:[]},
         months:{ 'YYYY-MM': { days:{ 'YYYY-MM-DD': { w:[{s,e,late,early,in:[t,t],out:[t,t],p:[id|null,id|null]}], lock } } } } }
   in/out are each pilot's own report and leave time. Older days carry one r/l per pair instead.
   Every duty day a pilot is not on alert is a rest day. Planned rests (pilots kept off alert on
   a day) are kept by date: months[ym].rest[date] = [ids] with months[ym].restFix[date] = true.
   Lists without restFix were written by an older version and are ignored.
   The squadron is on duty every `cycle` days counted from `anchor` (2 = day on, day off with
   the other squadron); `extra` and `skip` hold swapped days. "Back-to-back" means working two
   of the squadron's duty days in a row. */
const Eng = (() => {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  // Cost weights for the watch assignment (tuned by simulation)
  const W = { h: 0.5, n: 1.5, same: 8, pair: 3, lead: 1e6, nul: 1000, light: 12, lightShare: 0.8 };

  // ---- time of day ("HHMM", relative to shift change) ----
  function toMin(t) {
    if (typeof t !== 'string' || !/^\d{4}$/.test(t)) return NaN;
    const h = +t.slice(0, 2), m = +t.slice(2);
    return h > 23 || m > 59 ? NaN : h * 60 + m;
  }
  const hhmm = m => { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + pad(m % 60); };
  const rel = (t, start) => (toMin(t) - toMin(start) + 1440) % 1440;
  const ov = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
  const endRel = (t, start) => { const v = rel(t, start); return v === 0 ? 1440 : v; };

  const lateT = cfg => cfg.lateIn || '1800', earlyT = cfg => cfg.earlyOut || '2200';
  const capLate = cfg => cfg.maxLate == null ? 3 : Math.max(0, +cfg.maxLate);
  const capEarly = cfg => cfg.maxEarly == null ? 3 : Math.max(0, +cfg.maxEarly);
  // may this pair enter late / leave early? (older records: a pair-level r/l other than shift change)
  const lateOK = (w, cfg) => w.late != null ? !!w.late : !!(w.r && w.r !== cfg.start);
  const earlyOK = (w, cfg) => w.early != null ? !!w.early : !!(w.l && w.l !== cfg.start);
  const seatIn = (w, si, cfg) => (w.in && w.in[si]) || w.r || cfg.start;
  const seatOut = (w, si, cfg) => (w.out && w.out[si]) || w.l || cfg.start;

  function geom(b, cfg) {
    const rs = rel(b.s, cfg.start), re = endRel(b.e, cfg.start);
    let n1 = rel(cfg.nightFrom, cfg.start), n2 = rel(cfg.nightTo, cfg.start);
    if (n2 <= n1) n2 += 1440;
    const nm = (ov(rs, re, n1, n2) + ov(rs, re, n1 - 1440, n2 - 1440)) || 0;
    const late = lateOK(b, cfg), early = earlyOK(b, cfg);
    const li = rel(lateT(cfg), cfg.start), eo = endRel(earlyT(cfg), cfg.start);
    const ok = [rs, re].every(Number.isFinite) && re > rs && (!late || li <= rs) && (!early || eo >= re);
    return { rs, re, h: (re - rs) / 60, nh: nm / 60, night: nm >= 180, ok, late, early };
  }
  function seatGeom(w, si, cfg) {
    const ri = rel(seatIn(w, si, cfg), cfg.start), ro = endRel(seatOut(w, si, cfg), cfg.start);
    return { ri, ro, pres: (ro - ri) / 60, lateIn: ri > 0, earlyOut: ro < 1440 };
  }
  // pilots at the alert building through the shift: [{a, b, n}] in minutes after shift change
  function atBuilding(ws, cfg, filled) {
    const seats = [];
    ws.forEach(w => [0, 1].forEach(si => { if (filled(w, si)) seats.push(seatGeom(w, si, cfg)); }));
    const pts = new Set([0, 1440]); seats.forEach(g => { pts.add(g.ri); pts.add(g.ro); });
    const xs = [...pts].filter(Number.isFinite).sort((a, b) => a - b), segs = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i], b = xs[i + 1];
      const n = seats.filter(g => g.ri <= a && a < g.ro).length;
      const last = segs[segs.length - 1];
      if (last && last.n === n) last.b = b; else segs.push({ a, b, n });
    }
    return segs;
  }
  const minAtBuilding = (ws, cfg, filled) => Math.min(...atBuilding(ws, cfg, filled).map(s => s.n));

  // ---- calendar dates ("YYYY-MM-DD", UTC arithmetic) ----
  const pd = ds => { const [y, m, d] = ds.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const fd = dt => dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
  const addDays = (ds, n) => { const dt = pd(ds); dt.setUTCDate(dt.getUTCDate() + n); return fd(dt); };
  const diffDays = (a, b) => Math.round((pd(b) - pd(a)) / 864e5);
  const dow = ds => pd(ds).getUTCDay();
  function monthDays(ym) {
    const [y, m] = ym.split('-').map(Number);
    const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return Array.from({ length: n }, (_, i) => ym + '-' + pad(i + 1));
  }
  function addMonths(ym, n) {
    const [y, m] = ym.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + n, 1));
    return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1);
  }

  // ---- the squadron's duty days ----
  const cycleOf = S => Math.max(1, Math.min(7, +S.cfg.cycle || 2));
  function isDuty(S, ds) {
    const c = S.cfg;
    if (c.skip && c.skip.includes(ds)) return false;
    if (c.extra && c.extra.includes(ds)) return true;
    if (!c.anchor) return true;
    const k = cycleOf(S);
    return ((diffDays(c.anchor, ds) % k) + k) % k === 0;
  }
  function stepDuty(S, ds, dir) {
    if (!ds) return null;
    let d = ds;
    for (let i = 0; i < 31; i++) { d = addDays(d, dir); if (isDuty(S, d)) return d; }
    return null;
  }
  const prevDuty = (S, ds) => stepDuty(S, ds, -1);
  const nextDuty = (S, ds) => stepDuty(S, ds, 1);
  const dutyDays = (S, from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) if (isDuty(S, d)) out.push(d); return out; };

  // ---- state access ----
  function getDay(S, ds) { if (!ds) return null; const m = S.months[ds.slice(0, 7)]; return (m && m.days && m.days[ds]) || null; }
  function setDay(S, ds, day) {
    const k = ds.slice(0, 7);
    if (!S.months[k]) S.months[k] = { days: {} };
    if (!S.months[k].days) S.months[k].days = {};
    if (day) S.months[k].days[ds] = day; else delete S.months[k].days[ds];
  }
  function onIds(S, ds) {
    const d = getDay(S, ds), set = new Set();
    if (d) d.w.forEach(w => w.p.forEach(id => { if (id) set.add(id); }));
    return set;
  }
  const awayOn = (S, pid, ds) => S.away.find(a => a.pilot === pid && a.from <= ds && ds <= a.to) || null;
  const restFrom = ds => addDays(ds, -2);   // older data kept rest lists on the shift two days before
  // pilots kept off alert on ds (planned rest)
  function getRest(S, ds) {
    const m = S.months[ds.slice(0, 7)];
    return m && m.restFix && m.restFix[ds] && m.rest && m.rest[ds] ? m.rest[ds].slice() : [];
  }
  function setRest(S, ds, ids, fixed) {
    const k = ds.slice(0, 7);
    if (!S.months[k]) S.months[k] = { days: {} };
    const m = S.months[k];
    m.rest = m.rest || {}; m.restFix = m.restFix || {};
    if (ids && ids.length) m.rest[ds] = [...new Set(ids)]; else delete m.rest[ds];
    if (fixed) m.restFix[ds] = true;
    const old = getDay(S, restFrom(ds)); if (old && old.rest) delete old.rest;
  }
  const restFixed = (S, ds) => { const m = S.months[ds.slice(0, 7)]; return !!(m && m.restFix && m.restFix[ds]); };
  const restOn = (S, pid, ds) => getRest(S, ds).includes(pid);
  // planned duty days off alert in a row around ds; next = the next planned duty day on alert
  function offRun(S, pid, ds) {
    const off = d => !!d && !!getDay(S, d) && !onIds(S, d).has(pid) && !awayOn(S, pid, d);
    let a = ds, b = ds, n = 1, at = 1, next = null, d = prevDuty(S, ds), k = 0;
    for (; off(d) && k < 60; d = prevDuty(S, d), k++) { a = d; n++; at++; }
    for (d = nextDuty(S, ds), k = 0; off(d) && k < 60; d = nextDuty(S, d), k++) { b = d; n++; }
    if (d && getDay(S, d) && onIds(S, d).has(pid)) next = d;
    return { from: a, to: b, n, at, next };
  }
  const freeOn = (S, p, ds) => p.active !== false && !awayOn(S, p.id, ds) && !restOn(S, p.id, ds);
  const leadSet = S => new Set(S.pilots.filter(p => p.lead && p.active !== false).map(p => p.id));
  const pilot = (S, id) => S.pilots.find(p => p.id === id) || null;
  // Two non-leads may not stand a watch together (only enforced once leads are marked).
  function pairOk(S, a, b) {
    const L = leadSet(S);
    if (!L.size || !a || !b) return true;
    return L.has(a) || L.has(b);
  }
  // how many duty days in a row this pilot works if put on `ds` (previous and following ones)
  function runAround(S, ds, id, lockedOnly) {
    let back = 0, d = ds;
    while (back < 3) { d = prevDuty(S, d); if (!d || !onIds(S, d).has(id)) break; back++; }
    let fwd = 0; d = ds;
    while (fwd < 3) {
      d = nextDuty(S, d); const day = getDay(S, d);
      if (!day || (lockedOnly && !day.lock) || !onIds(S, d).has(id)) break; fwd++;
    }
    return { back, fwd, run: 1 + back + fwd };
  }

  // ---- per-pilot statistics over the duty days in [from, to] ----
  function stats(S, from, to) {
    const st = {};
    S.pilots.forEach(p => {
      st[p.id] = { avail: 0, duties: 0, doubles: 0, triples: 0, hours: 0, nightH: 0, nights: 0,
        presH: 0, lateN: 0, earlyN: 0, restN: 0, rested: 0, away: 0, last: null, lastRs: null, pairs: {} };
    });
    const days = dutyDays(S, from, to);

    let prev = onIds(S, prevDuty(S, from)), prev2 = onIds(S, prevDuty(S, prevDuty(S, from)));
    if (days.length && days[0] !== from) { /* from is not a duty day: prev already points before it */ }
    days.forEach(ds => {
      const day = getDay(S, ds), on = new Set();
      if (day) day.w.forEach(w => {
        const g = geom(w, S.cfg);
        w.p.forEach((id, si) => {
          const x = st[id]; if (!x) return;
          on.add(id);
          const sg = seatGeom(w, si, S.cfg);
          x.duties++; x.hours += g.h; x.nightH += g.nh; x.presH += sg.pres;
          if (g.night) x.nights++;
          if (sg.lateIn) x.lateN++;
          if (sg.earlyOut) x.earlyN++;
          x.last = ds; x.lastRs = g.rs;
          if (prev.has(id)) { x.doubles++; if (prev2.has(id)) x.triples++; }
        });
        const [a, b] = w.p;
        if (a && b && st[a] && st[b]) {
          st[a].pairs[b] = (st[a].pairs[b] || 0) + 1;
          st[b].pairs[a] = (st[b].pairs[a] || 0) + 1;
        }
      });
      S.pilots.forEach(p => {
        if (awayOn(S, p.id, ds)) st[p.id].away++;
        else if (restOn(S, p.id, ds)) st[p.id].rested++;
        else if (p.active !== false) st[p.id].avail++;
        if (day && p.active !== false && !awayOn(S, p.id, ds) && !on.has(p.id)) st[p.id].restN++; // a rest day
      });
      prev2 = prev; prev = on;
    });
    return st;
  }

  // ---- who is on: rested pilots first, back-to-back duty days spread fairly ----
  function pickCrew(S, ds, st) {
    const need = S.blocks.length * 2, k = cycleOf(S);
    const p1 = prevDuty(S, ds), p2 = prevDuty(S, p1);
    const d1 = nextDuty(S, ds), d2 = nextDuty(S, d1);
    const y1 = onIds(S, p1), y2 = onIds(S, p2);
    const n1 = getDay(S, d1), n2 = getDay(S, d2);
    const t1 = n1 && n1.lock ? onIds(S, d1) : new Set();
    const t2 = n1 && n1.lock && n2 && n2.lock ? onIds(S, d2) : new Set();
    const avail = S.pilots.filter(p => freeOn(S, p, ds));
    const scored = avail.map((p, i) => {
      const back = y1.has(p.id) ? (y2.has(p.id) ? 2 : 1) : 0;
      const fwd = t1.has(p.id) ? (t2.has(p.id) ? 2 : 1) : 0;
      const run = 1 + back + fwd;
      const x = st[p.id], av = Math.max(x.avail, 1);
      const rest = x.last ? Math.min(Math.round(diffDays(x.last, ds) / k), 4) : 4;
      let sc = run === 1 ? 0 : run === 2 ? 100 : 1000 * (run - 2);
      if (run >= 2) sc += 300 * x.doubles / av;
      sc += 20 * x.duties / av - 3 * rest + i * 0.001;
      return { id: p.id, sc };
    }).sort((a, b) => a.sc - b.sc);
    // Flight leads (when marked) rotate as their own pool: one per pair, rested leads first;
    // the other seats come from everyone else.
    const leads = leadSet(S);
    let crew, rest;
    if (leads.size) {
      const lp = scored.filter(s => leads.has(s.id)).slice(0, S.blocks.length); // a lead may work a third day in a row
      const others = scored.filter(s => !lp.includes(s));
      crew = lp.concat(others.slice(0, need - lp.length)).sort((a, b) => a.sc - b.sc);
      rest = others.slice(need - lp.length);
    } else {
      crew = scored.slice(0, need); rest = scored.slice(need);
    }
    const swapIn = (outPred, inPred) => {
      for (let j = crew.length - 1; j >= 0; j--) {
        if (!outPred(crew[j].id)) continue;
        const q = rest.findIndex(s => inPred(s.id) && s.sc < 1000);
        if (q < 0) return false;
        const [inn] = rest.splice(q, 1); rest.push(crew[j]); crew[j] = inn;
        return true;
      }
      return false;
    };
    // The duty day after next is locked and the next one is not: leave enough people free
    // for the next one, or it can only be filled with third duty days in a row.
    if (n2 && n2.lock && !(n1 && n1.lock)) {
      const c2 = onIds(S, d2);
      const free1 = S.pilots.filter(p => freeOn(S, p, d1)).length;
      const maxOv = Math.max(0, free1 - need);
      let o = crew.filter(s => c2.has(s.id)).length, guard = 0;
      while (o > maxOv && guard++ < need && swapIn(id => c2.has(id), id => !c2.has(id))) o--;
    }
    return crew.map(s => s.id);
  }

  // ---- pairs and watches: lowest-cost split of the crew across the watch blocks ----
  function assign(S, ds, crew, st) {
    const B = S.blocks.map(b => ({ b, g: geom(b, S.cfg) }));
    const nb = B.length, n = nb * 2;
    if (!nb) return [];
    const ids = crew.slice(0, n); while (ids.length < n) ids.push(null);
    const real = ids.filter(Boolean);
    const y1 = onIds(S, prevDuty(S, ds));
    // Fair share per shift worked: someone who has worked more shifts is expected to carry
    // proportionally more watch hours, night hours and time at the building.
    const all = Object.values(st), tot = k => all.reduce((s, x) => s + x[k], 0);
    const dsum = Math.max(tot('duties'), 1);
    const rH = tot('hours') / dsum, rN = tot('nightH') / dsum;
    const dev = (x, k, r) => x[k] - x.duties * r;
    const leads = leadSet(S), useLead = real.some(id => leads.has(id));
    const order = id => {
      if (!id) return 1e9;
      const i = S.pilots.findIndex(p => p.id === id);
      return (leads.has(id) ? -1000 : 0) + i;
    };
    // per pilot x block cost, shifted so the minimum is 0 (keeps pruning valid)
    const cost = ids.map(id => {
      const light = !!(id && (pilot(S, id) || {}).light);
      const row = B.map(({ g }) => {
        if (!id) return 0;
        const x = st[id];
        let c = W.h * dev(x, 'hours', rH * (light ? W.lightShare : 1)) * g.h + W.n * dev(x, 'nightH', rN) * g.nh;
        if (light) c += W.light * g.h; // fewer watch hours: the shortest watches
        if (x.lastRs === g.rs) c += W.same;
        return c;
      });
      const m = Math.min(...row);
      return row.map(c => c - m);
    });
    const pairCost = (a, b) => {
      if (!a || !b) return 0;
      const k = st[a].pairs[b] || 0;
      let c = W.pair * k * k;
      if (useLead && !leads.has(a) && !leads.has(b)) c += W.lead;
      return c;
    };
    const slotCost = (bi, i, j) => {
      const a = ids[i], b = ids[j];
      let c = cost[i][bi] + cost[j][bi] + pairCost(a, b);
      if (!a || !b) c += W.nul * (nb - bi) * ((a ? 0 : 1) + (b ? 0 : 1));
      if (useLead && (!a || !b) && !leads.has(a || b)) c += W.lead / 2;
      return c;
    };

    let best = null, bestC = Infinity;
    if (n <= 10) {
      const used = new Array(n).fill(false), cur = [];
      const rec = (bi, acc) => {
        if (acc >= bestC) return;
        if (bi === nb) { bestC = acc; best = cur.map(x => x.slice()); return; }
        for (let i = 0; i < n; i++) {
          if (used[i]) continue; used[i] = true;
          for (let j = i + 1; j < n; j++) {
            if (used[j]) continue; used[j] = true;
            cur.push([i, j]); rec(bi + 1, acc + slotCost(bi, i, j)); cur.pop();
            used[j] = false;
          }
          used[i] = false;
        }
      };
      rec(0, 0);
    } else {
      // larger templates: greedy start + pairwise-swap improvement (deterministic)
      const left = ids.map((_, i) => i), arr = [];
      for (let bi = 0; bi < nb; bi++) {
        let bc = Infinity, bp = null;
        for (let x = 0; x < left.length; x++) for (let y = x + 1; y < left.length; y++) {
          const c = slotCost(bi, left[x], left[y]); if (c < bc) { bc = c; bp = [x, y]; }
        }
        arr.push([left[bp[0]], left[bp[1]]]);
        left.splice(bp[1], 1); left.splice(bp[0], 1);
      }
      const total = a => a.reduce((s, [i, j], bi) => s + slotCost(bi, i, j), 0);
      let cur = total(arr), improved = true, guard = 0;
      while (improved && guard++ < 60) {
        improved = false;
        for (let b1 = 0; b1 < nb; b1++) for (let s1 = 0; s1 < 2; s1++)
          for (let b2 = b1 + 1; b2 < nb; b2++) for (let s2 = 0; s2 < 2; s2++) {
            const t = arr[b1][s1]; arr[b1][s1] = arr[b2][s2]; arr[b2][s2] = t;
            const c = total(arr);
            if (c < cur - 1e-9) { cur = c; improved = true; }
            else { arr[b2][s2] = arr[b1][s1]; arr[b1][s1] = t; }
          }
      }
      best = arr;
    }
    const ws = B.map(({ b, g }, bi) => {
      const p = [ids[best[bi][0]], ids[best[bi][1]]].sort((a, c) => order(a) - order(c));
      return { s: b.s, e: b.e, late: g.late, early: g.early, in: [S.cfg.start, S.cfg.start], out: [S.cfg.start, S.cfg.start], p };
    });
    perks(S, ws, st, y1);
    return ws;
  }

  // ---- who enters late and who leaves early: at most maxLate / maxEarly a day ----
  // Back-to-back pilots first, then whoever has had the fewest of either so far.
  function perks(S, ws, st, y1) {
    const c = S.cfg, start = c.start;
    ws.forEach(w => { w.in = [start, start]; w.out = [start, start]; });
    const idx = id => S.pilots.findIndex(p => p.id === id);
    const prio = id => {
      const x = (st && st[id]) || { lateN: 0, earlyN: 0, duties: 0 };
      return (y1 && y1.has(id) ? -1000 : 0) + 10 * (x.lateN + x.earlyN) / Math.max(1, x.duties) + idx(id) * 0.001;
    };
    const seats = []; ws.forEach((w, wi) => w.p.forEach((id, si) => { if (id) seats.push({ wi, si, id }); }));
    const got = new Set();
    const give = (ok, cap, set) => seats.filter(t => ok(ws[t.wi], c) && !got.has(t.id))
      .sort((a, b) => prio(a.id) - prio(b.id)).slice(0, cap).forEach(t => { set(t); got.add(t.id); });
    give(lateOK, capLate(c), t => { ws[t.wi].in[t.si] = lateT(c); });
    give(earlyOK, capEarly(c), t => { ws[t.wi].out[t.si] = earlyT(c); });
    // never below the minimum at the alert building: take perks back, least deserving first
    const filled = (w, si) => !!w.p[si];
    let guard = 0;
    while (minAtBuilding(ws, c, filled) < c.minAt && guard++ < 16) {
      const h = seats.filter(t => ws[t.wi].in[t.si] !== start || ws[t.wi].out[t.si] !== start).sort((a, b) => prio(b.id) - prio(a.id))[0];
      if (!h) break;
      ws[h.wi].in[h.si] = start; ws[h.wi].out[h.si] = start;
    }
    return ws;
  }

  // ---- plan the squadron's unlocked duty days in [from, to] ----
  function generate(S, from, to) {
    let made = 0;
    // clear rest lists an older version wrote automatically (they are ignored anyway)
    for (let ds = from; ds <= addDays(to, 2); ds = addDays(ds, 1)) {
      const m = S.months[ds.slice(0, 7)];
      if (m && m.rest && m.rest[ds] && !(m.restFix && m.restFix[ds])) delete m.rest[ds];
    }
    for (let ds = from; ds <= to; ds = addDays(ds, 1)) {
      const day = getDay(S, ds);
      if (day && day.lock) continue;
      if (!isDuty(S, ds)) { if (day) setDay(S, ds, null); continue; } // the other squadron's day
      const st = stats(S, addDays(ds, -60), addDays(ds, -1));
      const crew = pickCrew(S, ds, st);
      const nd = { w: assign(S, ds, crew, st), lock: false };
      setDay(S, ds, nd);
      made++;
    }
    return made;
  }

  // ---- checks ----
  function templateCheck(S) {
    const G = S.blocks.map(b => geom(b, S.cfg));
    const bad = G.map((g, i) => g.ok ? null : i).filter(i => i !== null);
    const iv = G.filter(g => g.ok).map(g => [g.rs, g.re]).sort((a, b) => a[0] - b[0]);
    const gaps = []; let t = 0;
    for (const [a, b] of iv) { if (a > t) gaps.push([t, a]); t = Math.max(t, b); }
    if (t < 1440) gaps.push([t, 1440]);
    const sim = S.blocks.map((b, i) => ({ s: b.s, e: b.e, late: lateOK(b, S.cfg), early: earlyOK(b, S.cfg), p: ['t' + i + 'a', 't' + i + 'b'] }));
    perks(S, sim, null, null);
    const segs = atBuilding(sim, S.cfg, () => true);
    const minAt = segs.length ? Math.min(...segs.map(s => s.n)) : 0;
    const low = segs.filter(s => s.n < S.cfg.minAt);
    return { G, bad, gaps, segs, minAt, low, okAt: minAt >= S.cfg.minAt, sim,
      lateSeats: G.filter(g => g.late).length * 2, earlySeats: G.filter(g => g.early).length * 2 };
  }

  function dayIssues(S, ds) {
    const d = getDay(S, ds); if (!d) return [];
    const out = [];
    const cs = id => (pilot(S, id) || { cs: '?' }).cs;
    const empty = d.w.reduce((n, w) => n + w.p.filter(x => !x).length, 0);
    if (empty) out.push({ k: 'short', t: empty + ' empty seat' + (empty > 1 ? 's' : '') + ' — fewer than ' + d.w.length * 2 + ' pilots available' });
    const p1 = prevDuty(S, ds), y1 = onIds(S, p1), y2 = onIds(S, prevDuty(S, p1));
    const seen = new Set(), leads = leadSet(S);
    d.w.forEach((w, i) => {
      w.p.forEach(id => {
        if (!id) return;
        if (seen.has(id)) out.push({ k: 'dup', id, t: cs(id) + ' is on two watches' });
        seen.add(id);
        const a = awayOn(S, id, ds), pp = pilot(S, id);
        if (a) out.push({ k: 'away', id, t: cs(id) + ' is away (' + a.type.toLowerCase() + ')' });
        if (pp && pp.active === false) out.push({ k: 'gone', id, t: cs(id) + ' is no longer on the roster' });
        if (restOn(S, id, ds)) out.push({ k: 'rest', id, t: cs(id) + ' is kept off alert today (planned rest)' });
      });
      if (leads.size && w.p.some(Boolean) && !w.p.some(id => id && leads.has(id)))
        out.push({ k: 'lead', t: w.p.every(Boolean) ? 'Pair ' + (i + 1) + ': ' + w.p.map(cs).join(' and ') + ' are both non-leads' : 'Pair ' + (i + 1) + ' has no flight lead' });
    });
    let nl = 0, ne = 0;
    d.w.forEach(w => w.p.forEach((id, si) => { if (!id) return; const g = seatGeom(w, si, S.cfg); if (g.lateIn) nl++; if (g.earlyOut) ne++; }));
    if (nl > capLate(S.cfg)) out.push({ k: 'capL', t: nl + ' enter late; the most allowed is ' + capLate(S.cfg) });
    if (ne > capEarly(S.cfg)) out.push({ k: 'capE', t: ne + ' leave early; the most allowed is ' + capEarly(S.cfg) });
    const low = atBuilding(d.w, S.cfg, (w, si) => !!w.p[si]).filter(s => s.n < S.cfg.minAt);
    low.forEach(s => out.push({ k: 'cov', t: 'Only ' + s.n + ' at the alert building ' + hhmm(s.a + toMin(S.cfg.start)) + '–' + hhmm(s.b + toMin(S.cfg.start)) + ' (need ' + S.cfg.minAt + ')' }));
    return out;
  }

  return { W, toMin, hhmm, rel, geom, atBuilding, addDays, diffDays, dow, monthDays, addMonths, pad,
    isDuty, prevDuty, nextDuty, dutyDays, cycleOf, runAround, pairOk, perks, seatGeom, seatIn, seatOut, lateOK, earlyOK, lateT, earlyT, capLate, capEarly, minAtBuilding,
    restOn, restFrom, freeOn, getRest, setRest, restFixed, offRun,
    getDay, setDay, onIds, awayOn, leadSet, pilot, stats, pickCrew, assign, generate, templateCheck, dayIssues };
})();
if (typeof module !== 'undefined') module.exports = Eng;
