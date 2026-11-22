(function (global) {
  'use strict';

  const KG_PER_LB = 0.45359237;
  const CM_PER_IN = 2.54;

  function kgToLb(kg) { return kg / KG_PER_LB; }
  function lbToKg(lb) { return lb * KG_PER_LB; }
  function cmToIn(cm) { return cm / CM_PER_IN; }
  function inToCm(inches) { return inches * CM_PER_IN; }

  function round1(x) { return Math.round(x * 10) / 10; }
  function round2(x) { return Math.round(x * 100) / 100; }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function bmi(weightKg, heightCm) {
    if (!isNum(weightKg) || !isNum(heightCm) || heightCm <= 0 || weightKg <= 0) return null;
    return weightKg / Math.pow(heightCm / 100, 2);
  }

  function bmiCategory(b) {
    if (b == null) return '';
    if (b < 18.5) return 'Underweight';
    if (b < 25) return 'Normal';
    if (b < 30) return 'Overweight';
    return 'Obese';
  }

  function bmrMifflin(weightKg, heightCm, age, gender) {
    if (![weightKg, heightCm, age].every(isNum) || weightKg <= 0 || heightCm <= 0 || age <= 0) return null;
    const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
    if (gender === 'female') return base - 161;
    if (gender === 'male') return base + 5;
    return base - 78;
  }

  function log10(x) { return Math.log(x) / Math.LN10; }

  function bodyFatNavy(gender, heightCm, waistCm, neckCm, hipsCm) {
    if (![heightCm, waistCm, neckCm].every(isNum) || heightCm <= 0) return null;
    if (gender === 'male') {
      const diff = waistCm - neckCm;
      if (diff <= 0) return null;
      const d = 1.0324 - 0.19077 * log10(diff) + 0.15456 * log10(heightCm);
      if (d <= 0) return null;
      return 495 / d - 450;
    }
    if (gender === 'female') {
      if (!isNum(hipsCm)) return null;
      const sum = waistCm + hipsCm - neckCm;
      if (sum <= 0) return null;
      const d = 1.29579 - 0.35004 * log10(sum) + 0.22100 * log10(heightCm);
      if (d <= 0) return null;
      return 495 / d - 450;
    }
    return null;
  }

  function estimateBodyFat(entry, profile) {
    if (isNum(entry.bodyFatPct)) return entry.bodyFatPct;
    const m = entry.m || {};
    return bodyFatNavy(profile.gender, profile.heightCm, m.waist, m.neck, m.hips);
  }

  function uid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function dayKey(ts) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function fmtDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function fmtDateTime(ts) {
    return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function fmtShortDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function fmtWeight(kg, units) {
    if (kg == null || !isFinite(kg)) return '—';
    return units === 'imperial' ? round1(kgToLb(kg)).toFixed(1) + ' lb' : round1(kg).toFixed(1) + ' kg';
  }

  function fmtLen(cm, units) {
    if (cm == null || !isFinite(cm)) return '—';
    return units === 'imperial' ? round1(cmToIn(cm)).toFixed(1) + ' in' : round1(cm).toFixed(1) + ' cm';
  }

  function fmtNum(x, digits) {
    if (x == null || !isFinite(x)) return '—';
    return x.toFixed(digits == null ? 1 : digits);
  }

  function series(entries, pick) {
    return entries
      .map(e => ({ ts: e.ts, v: pick(e) }))
      .filter(p => p.v != null && isFinite(p.v))
      .sort((a, b) => a.ts - b.ts);
  }

  function stats(points) {
    if (!points.length) return null;
    const vals = points.map(p => p.v);
    const first = points[0];
    const last = points[points.length - 1];
    const min = Math.min.apply(null, vals);
    const max = Math.max.apply(null, vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return {
      count: points.length,
      firstTs: first.ts,
      first: first.v,
      lastTs: last.ts,
      last: last.v,
      change: last.v - first.v,
      min,
      max,
      avg
    };
  }

  function valueAtOrBefore(points, ts) {
    let best = null;
    for (const p of points) {
      if (p.ts <= ts) best = p;
      else break;
    }
    return best ? best.v : null;
  }

  function changeOverDays(points, days) {
    if (!points.length) return null;
    const last = points[points.length - 1];
    const prev = valueAtOrBefore(points, last.ts - days * 86400000);
    if (prev == null) return null;
    return last.v - prev;
  }

  const Calc = {
    kgToLb, lbToKg, cmToIn, inToCm,
    round1, round2,
    bmi, bmiCategory, bmrMifflin, bodyFatNavy, estimateBodyFat,
    uid, dayKey, fmtDate, fmtDateTime, fmtShortDate, fmtWeight, fmtLen, fmtNum,
    series, stats, valueAtOrBefore, changeOverDays
  };

  global.Calc = Calc;
  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
})(typeof window !== 'undefined' ? window : globalThis);
