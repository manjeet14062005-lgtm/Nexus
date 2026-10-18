const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMonthlyPeriod, summarizeVerificationUsage } = require('./billingUsage');

test('buildMonthlyPeriod marks the current UTC month as current', () => {
  const now = new Date('2026-10-15T12:00:00.000Z');
  assert.deepEqual(buildMonthlyPeriod('2026-10', now), {
    key: '2026-10',
    start: '2026-10-01T00:00:00.000Z',
    resetsAt: '2026-11-01T00:00:00.000Z',
    status: 'current',
    isCurrent: true,
  });
});

test('buildMonthlyPeriod marks older periods as expired', () => {
  const now = new Date('2026-10-15T12:00:00.000Z');
  const period = buildMonthlyPeriod('2026-09', now);
  assert.equal(period.status, 'expired');
  assert.equal(period.isCurrent, false);
  assert.equal(period.resetsAt, '2026-10-01T00:00:00.000Z');
});

test('summarizeVerificationUsage derives quota fields from real counters and limits', () => {
  const summary = summarizeVerificationUsage({
    usage: { month: '2026-10', verificationRequests: 125 },
    limit: 500,
    now: new Date('2026-10-15T12:00:00.000Z'),
  });
  assert.equal(summary.used, 125);
  assert.equal(summary.limit, 500);
  assert.equal(summary.remaining, 375);
  assert.equal(summary.percent, 25);
  assert.equal(summary.reached, false);
});

test('summarizeVerificationUsage keeps unlimited quotas explicit', () => {
  const summary = summarizeVerificationUsage({
    usage: { month: '2026-10', verificationRequests: 42 },
    limit: null,
    now: new Date('2026-10-15T12:00:00.000Z'),
  });
  assert.equal(summary.used, 42);
  assert.equal(summary.limit, null);
  assert.equal(summary.remaining, null);
  assert.equal(summary.percent, null);
  assert.equal(summary.unlimited, true);
});
