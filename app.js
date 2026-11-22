(function () {
  'use strict';

  const C = window.Calc;
  const STORE_KEY = 'healthtracker.v1';
  const DISMISS_KEY = 'healthtracker.install-dismissed';

  const MEASURES = [
    { key: 'waist', label: 'Waist' },
    { key: 'chest', label: 'Chest' },
    { key: 'hips', label: 'Hips' },
    { key: 'neck', label: 'Neck' },
    { key: 'armL', label: 'Arm L' },
    { key: 'armR', label: 'Arm R' },
    { key: 'thighL', label: 'Thigh L' },
    { key: 'thighR', label: 'Thigh R' },
    { key: 'calfL', label: 'Calf L' },
    { key: 'calfR', label: 'Calf R' }
  ];

  const METRICS = [
    {
      key: 'weight', label: 'Weight',
      pick: e => e.weightKg,
      conv: v => (state.profile.units === 'imperial' ? C.kgToLb(v) : v),
      unit: () => (state.profile.units === 'imperial' ? 'lb' : 'kg')
    },
    {
      key: 'bmi', label: 'BMI',
      pick: e => C.bmi(e.weightKg, state.profile.heightCm),
      conv: v => v,
      unit: () => ''
    },
    {
      key: 'bf', label: 'Body fat',
      pick: e => C.estimateBodyFat(e, state.profile),
      conv: v => v,
      unit: () => '%'
    },
    {
      key: 'bmr', label: 'BMR',
      pick: e => C.bmrMifflin(e.weightKg, state.profile.heightCm, state.profile.age, state.profile.gender),
      conv: v => v,
      unit: () => 'kcal'
    }
  ].concat(MEASURES.map(m => ({
    key: 'm-' + m.key,
    label: m.label,
    pick: e => e.m[m.key],
    conv: v => (state.profile.units === 'imperial' ? C.cmToIn(v) : v),
    unit: () => (state.profile.units === 'imperial' ? 'in' : 'cm')
  })));

  const state = { profile: defaultProfile(), entries: [] };
  let currentView = 'log';
  let toastTimer = null;

  function $(sel) { return document.querySelector(sel); }

  function defaultProfile() {
    return { name: '', gender: '', heightCm: null, age: null, goalWeightKg: null, units: 'metric', theme: 'auto' };
  }

  function numOrNull(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        state.profile = Object.assign(defaultProfile(), data.profile || {});
        state.entries = (Array.isArray(data.entries) ? data.entries : []).map(normalizeEntry);
        state.entries.sort((a, b) => a.ts - b.ts);
      }
    } catch (err) {
      state.profile = defaultProfile();
      state.entries = [];
    }
  }

  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify({ profile: state.profile, entries: state.entries }));
  }

  function normalizeEntry(e) {
    const m = {};
    for (const def of MEASURES) m[def.key] = numOrNull(e.m && e.m[def.key]);
    return {
      id: e.id || C.uid(),
      ts: Number(e.ts),
      weightKg: numOrNull(e.weightKg),
      bodyFatPct: numOrNull(e.bodyFatPct),
      m,
      notes: typeof e.notes === 'string' ? e.notes : ''
    };
  }

  function upsertEntry(entry) {
    const clean = normalizeEntry(entry);
    const dk = C.dayKey(clean.ts);
    const idx = state.entries.findIndex(e => C.dayKey(e.ts) === dk);
    if (idx >= 0) {
      clean.id = state.entries[idx].id;
      state.entries[idx] = clean;
    } else {
      state.entries.push(clean);
    }
    state.entries.sort((a, b) => a.ts - b.ts);
    save();
  }

  function latestEntry() {
    return state.entries.length ? state.entries[state.entries.length - 1] : null;
  }

  function entryForDay(dk) {
    return state.entries.find(e => C.dayKey(e.ts) === dk) || null;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
  }

  function setNumInput(input, v) {
    input.value = (v == null || !isFinite(v)) ? '' : String(C.round2(v));
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.profile.theme || 'auto';
  }

  function isStandalone() {
    return window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }

  function showView(name) {
    if (['log', 'history', 'trends', 'profile'].indexOf(name) < 0) name = 'log';
    currentView = name;
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    if (name === 'log') renderLog();
    if (name === 'history') renderHistory();
    if (name === 'trends') renderTrends();
    if (name === 'profile') renderProfile();
  }

  function statCard(label, value, sub) {
    return '<div class="card stat"><div class="stat-label">' + escapeHtml(label) + '</div>' +
      '<div class="stat-value">' + escapeHtml(value) + '</div>' +
      '<div class="stat-sub">' + escapeHtml(sub) + '</div></div>';
  }

  function renderCards() {
    const el = $('#stat-cards');
    const last = latestEntry();
    const units = state.profile.units;
    if (!last) {
      el.innerHTML = '<div class="card muted">No entries yet — log your first measurement below.</div>';
      return;
    }
    const wSeries = C.series(state.entries, e => e.weightKg);
    const d7 = C.changeOverDays(wSeries, 7);
    const d30 = C.changeOverDays(wSeries, 30);
    const bmi = C.bmi(last.weightKg, state.profile.heightCm);
    const bf = C.estimateBodyFat(last, state.profile);
    const bmr = C.bmrMifflin(last.weightKg, state.profile.heightCm, state.profile.age, state.profile.gender);
    const goal = state.profile.goalWeightKg;
    const d7Txt = d7 == null ? '—' : (d7 >= 0 ? '+' : '') + C.fmtNum(units === 'imperial' ? C.kgToLb(d7) : d7) + (units === 'imperial' ? ' lb' : ' kg');
    const d30Txt = d30 == null ? '—' : (d30 >= 0 ? '+' : '') + C.fmtNum(units === 'imperial' ? C.kgToLb(d30) : d30) + (units === 'imperial' ? ' lb' : ' kg');
    const goalTxt = goal == null ? '—' : (goal - last.weightKg >= 0 ? '+' : '') + C.fmtWeight(goal - last.weightKg, units) + ' to go';
    el.innerHTML =
      statCard('Weight', C.fmtWeight(last.weightKg, units), C.fmtDate(last.ts)) +
      statCard('Change 7d', d7Txt, '30d: ' + d30Txt) +
      statCard('BMI', bmi == null ? '—' : C.fmtNum(bmi), C.bmiCategory(bmi) || 'set height in Profile') +
      statCard('Body fat', bf == null ? '—' : C.fmtNum(bf) + '%', bmr == null ? '' : 'BMR ' + Math.round(bmr) + ' kcal') +
      statCard('Goal', goal == null ? '—' : C.fmtWeight(goal, units), goalTxt);
  }

  function buildMeasuresGrid() {
    const g = $('#measures-grid');
    if (g.children.length) return;
    g.innerHTML = MEASURES.map(m =>
      '<label>' + escapeHtml(m.label) + '<input id="f-m-' + m.key + '" type="number" inputmode="decimal" step="0.1" min="0"></label>'
    ).join('');
  }

  function updatePlaceholders() {
    const imperial = state.profile.units === 'imperial';
    $('#f-weight').placeholder = imperial ? 'lb' : 'kg';
    MEASURES.forEach(m => {
      const inp = $('#f-m-' + m.key);
      if (inp) inp.placeholder = imperial ? 'in' : 'cm';
    });
    $('#p-height').placeholder = imperial ? 'in' : 'cm';
    $('#p-goal').placeholder = imperial ? 'lb' : 'kg';
  }

  function populateForm(e) {
    const d = new Date(e.ts);
    $('#f-date').value = C.dayKey(e.ts);
    $('#f-time').value = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    const imperial = state.profile.units === 'imperial';
    setNumInput($('#f-weight'), e.weightKg == null ? null : (imperial ? C.kgToLb(e.weightKg) : e.weightKg));
    setNumInput($('#f-bfat'), e.bodyFatPct);
    MEASURES.forEach(m => {
      const v = e.m[m.key];
      setNumInput($('#f-m-' + m.key), v == null ? null : (imperial ? C.cmToIn(v) : v));
    });
    $('#f-notes').value = e.notes || '';
    $('#entry-form-title').textContent = 'Edit entry — ' + C.fmtDate(e.ts);
  }

  function clearForm() {
    const now = new Date();
    $('#f-date').value = C.dayKey(now.getTime());
    $('#f-time').value = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    $('#f-weight').value = '';
    $('#f-bfat').value = '';
    MEASURES.forEach(m => { $('#f-m-' + m.key).value = ''; });
    $('#f-notes').value = '';
    $('#entry-form-title').textContent = 'Log entry';
  }

  function readForm() {
    const date = $('#f-date').value;
    const time = $('#f-time').value || '08:00';
    const ts = new Date(date + 'T' + time + ':00').getTime();
    const imperial = state.profile.units === 'imperial';
    const wRaw = numOrNull($('#f-weight').value);
    const m = {};
    MEASURES.forEach(def => {
      const raw = numOrNull($('#f-m-' + def.key).value);
      m[def.key] = raw == null ? null : C.round1(imperial ? C.inToCm(raw) : raw);
    });
    return {
      ts,
      weightKg: wRaw == null ? null : C.round2(imperial ? C.lbToKg(wRaw) : wRaw),
      bodyFatPct: numOrNull($('#f-bfat').value),
      m,
      notes: $('#f-notes').value.trim()
    };
  }

  function formIsEmpty(data) {
    return data.weightKg == null && data.bodyFatPct == null && data.notes === '' &&
      MEASURES.every(def => data.m[def.key] == null);
  }

  function renderLog() {
    buildMeasuresGrid();
    updatePlaceholders();
    renderCards();
  }

  function editEntry(id) {
    const e = state.entries.find(x => x.id === id);
    if (!e) return;
    populateForm(e);
    showView('log');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHistory() {
    const el = $('#history-list');
    if (!state.entries.length) {
      el.innerHTML = '<div class="card muted">No entries yet. Use the Log tab to add your first measurement.</div>';
      return;
    }
    const units = state.profile.units;
    el.innerHTML = state.entries.slice().reverse().map(e => {
      const bmi = C.bmi(e.weightKg, state.profile.heightCm);
      const bf = C.estimateBodyFat(e, state.profile);
      return '<div class="card entry-row" data-id="' + e.id + '">' +
        '<div class="entry-main">' +
        '<div class="entry-date">' + escapeHtml(C.fmtDateTime(e.ts)) + '</div>' +
        '<div class="entry-stats">' + escapeHtml(
          C.fmtWeight(e.weightKg, units) + ' · Waist ' + C.fmtLen(e.m.waist, units) +
          ' · BMI ' + (bmi == null ? '—' : C.round1(bmi)) +
          ' · BF ' + (bf == null ? '—' : C.round1(bf) + '%')
        ) + '</div>' +
        (e.notes ? '<div class="entry-notes">' + escapeHtml(e.notes) + '</div>' : '') +
        '</div>' +
        '<div class="entry-actions">' +
        '<button class="btn small" data-act="edit" type="button">Edit</button>' +
        '<button class="btn small danger" data-act="delete" type="button">Delete</button>' +
        '</div></div>';
    }).join('');
    el.querySelectorAll('.entry-row').forEach(row => {
      const id = row.dataset.id;
      row.querySelector('[data-act="edit"]').addEventListener('click', () => editEntry(id));
      row.querySelector('[data-act="delete"]').addEventListener('click', () => {
        if (window.confirm('Delete this entry? This cannot be undone.')) {
          state.entries = state.entries.filter(e => e.id !== id);
          save();
          renderHistory();
          toast('Entry deleted');
        }
      });
    });
  }

  function buildMetricOptions() {
    const sel = $('#t-metric');
    if (sel.children.length) return;
    sel.innerHTML = METRICS.map(m => '<option value="' + m.key + '">' + escapeHtml(m.label) + '</option>').join('');
  }

  function drawChart(canvas, pts, opts) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(280, canvas.clientWidth || (canvas.parentElement ? canvas.parentElement.clientWidth - 24 : 600));
    const cssH = 320;
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const styles = getComputedStyle(document.documentElement);
    const gridColor = styles.getPropertyValue('--grid').trim() || '#edf0f5';
    const labelColor = styles.getPropertyValue('--muted').trim() || '#6b7280';
    const accent = styles.getPropertyValue('--accent').trim() || '#0a84ff';
    const textColor = styles.getPropertyValue('--text').trim() || '#111827';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    if (!pts.length) {
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'center';
      ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText('No data yet — log your first entry in the Log tab.', cssW / 2, cssH / 2);
      return;
    }
    const vals = pts.map(p => opts.conv(p.v));
    let min = Math.min.apply(null, vals);
    let max = Math.max.apply(null, vals);
    if (opts.goal != null) {
      min = Math.min(min, opts.goal);
      max = Math.max(max, opts.goal);
    }
    if (min === max) { min -= 1; max += 1; }
    const pad = (max - min) * 0.12;
    min -= pad;
    max += pad;
    const L = 48, R = 12, T = 16, B = 28;
    const iw = cssW - L - R;
    const ih = cssH - T - B;
    const x = i => L + (pts.length === 1 ? iw / 2 : (i / (pts.length - 1)) * iw);
    const y = v => T + ih - ((v - min) / (max - min)) * ih;
    const span = max - min;
    const digits = span >= 100 ? 0 : (span >= 10 ? 1 : 2);
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.fillStyle = labelColor;
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const v = min + (i / 4) * span;
      const yy = y(v);
      ctx.beginPath();
      ctx.moveTo(L, yy);
      ctx.lineTo(L + iw, yy);
      ctx.stroke();
      ctx.fillText(v.toFixed(digits), L - 6, yy + 4);
    }
    ctx.textAlign = 'center';
    const n = pts.length;
    const ticks = Math.min(6, n);
    for (let i = 0; i < ticks; i++) {
      const idx = Math.round(i * (n - 1) / Math.max(1, ticks - 1));
      ctx.fillText(C.fmtShortDate(pts[idx].ts), x(idx), cssH - 8);
    }
    if (opts.goal != null) {
      ctx.strokeStyle = '#ff9500';
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(L, y(opts.goal));
      ctx.lineTo(L + iw, y(opts.goal));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff9500';
      ctx.textAlign = 'left';
      ctx.fillText('goal ' + opts.goal.toFixed(digits), L + 4, y(opts.goal) - 5);
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => {
      const px = x(i);
      const py = y(opts.conv(p.v));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.fillStyle = accent;
    pts.forEach((p, i) => {
      const px = x(i);
      const py = y(opts.conv(p.v));
      ctx.beginPath();
      ctx.arc(px, py, i === pts.length - 1 ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(opts.label + (opts.unit ? ' (' + opts.unit + ')' : ''), L, 12);
  }

  function renderTrendStats(pts, metric) {
    const el = $('#trend-stats');
    const cpts = pts.map(p => ({ ts: p.ts, v: metric.conv(p.v) }));
    const s = C.stats(cpts);
    if (!s) {
      el.innerHTML = '<div class="card muted">No data in this range yet.</div>';
      return;
    }
    const span = s.max - s.min;
    const digits = span >= 100 ? 0 : (span >= 10 ? 1 : 2);
    const fmt = v => C.fmtNum(v, digits) + (metric.unit() ? ' ' + metric.unit() : '');
    el.innerHTML =
      statCard('Entries', String(s.count), '') +
      statCard('Start', fmt(s.first), C.fmtDate(s.firstTs)) +
      statCard('Latest', fmt(s.last), C.fmtDate(s.lastTs)) +
      statCard('Change', (s.change >= 0 ? '+' : '') + fmt(s.change), '') +
      statCard('Average', fmt(s.avg), '') +
      statCard('Min / Max', fmt(s.min) + ' / ' + fmt(s.max), '');
  }

  function drawTrend() {
    const metric = METRICS.find(m => m.key === $('#t-metric').value) || METRICS[0];
    const range = $('#t-range').value;
    let pts = C.series(state.entries, metric.pick);
    if (range !== 'all') {
      const lastTs = pts.length ? pts[pts.length - 1].ts : Date.now();
      const cutoff = lastTs - Number(range) * 86400000;
      pts = pts.filter(p => p.ts >= cutoff);
    }
    const goal = metric.key === 'weight' && state.profile.goalWeightKg != null ? metric.conv(state.profile.goalWeightKg) : null;
    drawChart($('#chart'), pts, { conv: metric.conv, goal, unit: metric.unit(), label: metric.label });
    renderTrendStats(pts, metric);
  }

  function renderTrends() {
    buildMetricOptions();
    $('#t-metric').onchange = drawTrend;
    $('#t-range').onchange = drawTrend;
    drawTrend();
  }

  function updateStorageInfo() {
    const raw = localStorage.getItem(STORE_KEY) || '';
    const kb = (raw.length * 2 / 1024).toFixed(1);
    $('#storage-info').textContent = state.entries.length + ' entries stored · about ' + kb + ' KB on this device';
  }

  function renderProfile() {
    const imperial = state.profile.units === 'imperial';
    $('#p-name').value = state.profile.name || '';
    $('#p-gender').value = state.profile.gender || '';
    setNumInput($('#p-height'), state.profile.heightCm == null ? null : (imperial ? C.cmToIn(state.profile.heightCm) : state.profile.heightCm));
    setNumInput($('#p-age'), state.profile.age);
    setNumInput($('#p-goal'), state.profile.goalWeightKg == null ? null : (imperial ? C.kgToLb(state.profile.goalWeightKg) : state.profile.goalWeightKg));
    $('#p-units').value = state.profile.units;
    $('#p-theme').value = state.profile.theme || 'auto';
    updatePlaceholders();
    updateStorageInfo();
  }

  function onProfileChange() {
    const imperial = $('#p-units').value === 'imperial';
    const heightRaw = numOrNull($('#p-height').value);
    const goalRaw = numOrNull($('#p-goal').value);
    state.profile.name = $('#p-name').value.trim();
    state.profile.gender = $('#p-gender').value;
    state.profile.age = numOrNull($('#p-age').value);
    state.profile.heightCm = heightRaw == null ? null : C.round1(imperial ? C.inToCm(heightRaw) : heightRaw);
    state.profile.goalWeightKg = goalRaw == null ? null : C.round2(imperial ? C.lbToKg(goalRaw) : goalRaw);
    state.profile.units = $('#p-units').value;
    state.profile.theme = $('#p-theme').value;
    save();
    applyTheme();
    updatePlaceholders();
    if (currentView === 'log') renderCards();
    if (currentView === 'trends') drawTrend();
    if (currentView === 'history') renderHistory();
    if (currentView === 'profile') renderProfile();
  }

  function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv() {
    const head = ['date', 'time', 'weight_kg', 'bmi', 'bodyfat_pct',
      'waist_cm', 'chest_cm', 'hips_cm', 'neck_cm',
      'arm_l_cm', 'arm_r_cm', 'thigh_l_cm', 'thigh_r_cm', 'calf_l_cm', 'calf_r_cm', 'notes'];
    const rows = state.entries.map(e => {
      const d = new Date(e.ts);
      const bmi = C.bmi(e.weightKg, state.profile.heightCm);
      const bf = C.estimateBodyFat(e, state.profile);
      const vals = [
        C.dayKey(e.ts),
        pad2(d.getHours()) + ':' + pad2(d.getMinutes()),
        e.weightKg, bmi == null ? '' : C.round2(bmi), bf == null ? '' : C.round1(bf)
      ].concat(MEASURES.map(m => e.m[m.key]), [e.notes]);
      return vals.map(csvCell).join(',');
    });
    return head.join(',') + '\n' + rows.join('\n') + '\n';
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type: type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }

  function stamp() { return C.dayKey(Date.now()).replace(/-/g, ''); }

  function exportJson() {
    const payload = {
      app: 'health-tracker',
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: state.profile,
      entries: state.entries
    };
    download('health-tracker-' + stamp() + '.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('JSON exported');
  }

  function exportCsv() {
    download('health-tracker-' + stamp() + '.csv', toCsv(), 'text/csv');
    toast('CSV exported');
  }

  function importJsonText(text) {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || !Array.isArray(data.entries)) {
      throw new Error('Not a Health Tracker export file');
    }
    const entries = data.entries.map(normalizeEntry).filter(e => isFinite(e.ts));
    entries.sort((a, b) => a.ts - b.ts);
    state.entries = entries;
    if (data.profile && typeof data.profile === 'object') {
      state.profile = Object.assign(defaultProfile(), data.profile);
    }
    save();
    applyTheme();
  }

  function wireForm() {
    $('#entry-form').addEventListener('submit', ev => {
      ev.preventDefault();
      const data = readForm();
      if (!isFinite(data.ts)) {
        toast('Pick a valid date');
        return;
      }
      if (formIsEmpty(data)) {
        toast('Nothing to save — fill in at least one field');
        return;
      }
      upsertEntry(data);
      renderCards();
      toast('Saved ' + C.fmtDate(data.ts));
    });
    $('#new-btn').addEventListener('click', () => {
      clearForm();
      toast('New entry');
    });
    $('#f-date').addEventListener('change', () => {
      const e = entryForDay($('#f-date').value);
      if (e) populateForm(e);
      else {
        const keepDate = $('#f-date').value;
        clearForm();
        $('#f-date').value = keepDate;
      }
    });
  }

  function wireTabs() {
    document.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => showView(btn.dataset.view));
    });
    window.addEventListener('hashchange', () => {
      showView((location.hash || '#log').replace('#', ''));
    });
  }

  function wireProfile() {
    $('#profile-form').addEventListener('change', onProfileChange);
  }

  function wireDataButtons() {
    $('#export-json').addEventListener('click', exportJson);
    $('#export-csv').addEventListener('click', exportCsv);
    $('#import-json').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', ev => {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!file) return;
      if (!window.confirm('Replace ALL current data with the contents of "' + file.name + '"?')) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          importJsonText(String(reader.result));
          renderProfile();
          if (currentView !== 'profile') showView(currentView);
          toast('Import complete — ' + state.entries.length + ' entries');
        } catch (err) {
          window.alert('Could not import: ' + err.message);
        }
      };
      reader.onerror = () => window.alert('Could not read the file');
      reader.readAsText(file);
    });
    $('#clear-all').addEventListener('click', () => {
      if (!window.confirm('Delete ALL entries and your profile from this device? This cannot be undone. Consider exporting first.')) return;
      localStorage.removeItem(STORE_KEY);
      state.profile = defaultProfile();
      state.entries = [];
      applyTheme();
      showView(currentView);
      toast('All data deleted');
    });
  }

  function wireInstall() {
    const banner = $('#install-banner');
    if (isStandalone() || localStorage.getItem(DISMISS_KEY) === '1') return;
    banner.classList.remove('hidden');
    $('#install-dismiss').addEventListener('click', () => {
      localStorage.setItem(DISMISS_KEY, '1');
      banner.classList.add('hidden');
    });
  }

  function init() {
    load();
    applyTheme();
    buildMeasuresGrid();
    buildMetricOptions();
    clearForm();
    wireTabs();
    wireForm();
    wireProfile();
    wireDataButtons();
    wireInstall();
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', applyTheme);
    }
    const hash = (location.hash || '').replace('#', '');
    showView(['log', 'history', 'trends', 'profile'].indexOf(hash) >= 0 ? hash : 'log');
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
