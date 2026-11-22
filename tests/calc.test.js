const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');

test('unit conversions round-trip', () => {
  assert.equal(C.round2(C.lbToKg(C.kgToLb(80))), 80);
  assert.equal(C.round2(C.inToCm(C.cmToIn(100))), 100);
  assert.ok(Math.abs(C.cmToIn(2.54) - 1) < 1e-9);
});

test('bmi and categories', () => {
  assert.equal(C.round2(C.bmi(82.5, 180)), 25.46);
  assert.equal(C.bmi(0, 180), null);
  assert.equal(C.bmi(80, 0), null);
  assert.equal(C.bmi(80, null), null);
  assert.equal(C.bmiCategory(25.46), 'Overweight');
  assert.equal(C.bmiCategory(22), 'Normal');
  assert.equal(C.bmiCategory(18), 'Underweight');
  assert.equal(C.bmiCategory(31), 'Obese');
  assert.equal(C.bmiCategory(null), '');
});

test('bmr mifflin-st-jeor', () => {
  assert.equal(C.round1(C.bmrMifflin(80, 180, 30, 'male')), 1780.0);
  assert.equal(C.round1(C.bmrMifflin(80, 180, 30, 'female')), 1614.0);
  assert.equal(C.bmrMifflin(80, 180, 0, 'male'), null);
  assert.equal(C.bmrMifflin(-1, 180, 30, 'male'), null);
});

test('navy body fat formula', () => {
  const bf = C.bodyFatNavy('male', 180, 85, 38, null);
  assert.ok(bf > 5 && bf < 45, 'male bf out of range: ' + bf);
  assert.ok(Math.abs(bf - 16.1) < 1.5, 'male bf expected ~16: ' + bf);
  assert.equal(C.bodyFatNavy('male', 180, 38, 38, null), null);
  assert.equal(C.bodyFatNavy('female', 165, 70, 32, null), null);
  const bff = C.bodyFatNavy('female', 165, 70, 32, 95);
  assert.ok(bff > 5 && bff < 60, 'female bf out of range: ' + bff);
  assert.equal(C.bodyFatNavy('', 180, 85, 38, null), null);
});

test('estimateBodyFat prefers manual entry', () => {
  const profile = { gender: 'male', heightCm: 180 };
  assert.equal(C.estimateBodyFat({ bodyFatPct: 20, m: {} }, profile), 20);
  const est = C.estimateBodyFat({ m: { waist: 85, neck: 38 } }, profile);
  assert.ok(est > 5 && est < 45, 'estimate out of range: ' + est);
  assert.equal(C.estimateBodyFat({ m: {} }, profile), null);
});

test('series, stats, changeOverDays', () => {
  const day = 86400000;
  const t0 = 1700000000000;
  const entries = [
    { ts: t0 + 40 * day, weightKg: null },
    { ts: t0, weightKg: 80 },
    { ts: t0 + 30 * day, weightKg: 78 },
    { ts: t0 + 6 * day, weightKg: 79 }
  ];
  const pts = C.series(entries, e => e.weightKg);
  assert.equal(pts.length, 3);
  assert.equal(pts[0].ts, t0);
  const s = C.stats(pts);
  assert.equal(s.first, 80);
  assert.equal(s.last, 78);
  assert.equal(s.change, -2);
  assert.equal(s.min, 78);
  assert.equal(s.max, 80);
  assert.ok(Math.abs(s.avg - 79) < 1e-9);
  assert.equal(C.changeOverDays(pts, 7), -1);
  assert.equal(C.changeOverDays(pts, 45), null);
  assert.equal(C.stats([]), null);
});

test('dayKey pads month and day', () => {
  const ts = new Date(2024, 0, 5, 10, 30).getTime();
  assert.equal(C.dayKey(ts), '2024-01-05');
});

test('uid is unique', () => {
  assert.notEqual(C.uid(), C.uid());
});
