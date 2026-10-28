import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDate, validateRange, route} from '../src/service.js';
import {createServer} from '../src/server.js';

test('parseDate accepts real calendar dates, including leap days', () => {
  assert.equal(parseDate('2024-02-29').toISOString(), '2024-02-29T00:00:00.000Z');
  assert.equal(parseDate('2025-12-31').toISOString(), '2025-12-31T00:00:00.000Z');
});

test('parseDate rejects impossible or malformed dates', () => {
  for (const v of ['2025-02-29', '2025-02-30', '2025-04-31', '2025-13-01', '2025-00-10', '2025-01-00',
    '2025-1-01', '20250101', '2025-01-01T00:00:00Z', ' 2025-01-01', 'abc', '', null, undefined]) {
    assert.equal(parseDate(v), null, `expected ${JSON.stringify(v)} to be rejected`);
  }
});

test('validateRange reports missing and invalid params', () => {
  assert.equal(validateRange(null, '2025-01-01').error, 'missing_from');
  assert.equal(validateRange('2025-01-01', null).error, 'missing_to');
  assert.equal(validateRange('', '2025-01-01').error, 'missing_from');
  assert.equal(validateRange('2025-02-30', '2025-03-01').error, 'invalid_from');
  assert.equal(validateRange('2025-03-01', 'nope').error, 'invalid_to');
});

test('validateRange requires from <= to', () => {
  assert.equal(validateRange('2025-03-02', '2025-03-01').error, 'invalid_range');
  assert.equal(validateRange('2025-03-01', '2025-03-01').days, 1);
});

test('validateRange caps the inclusive range at 31 days', () => {
  assert.equal(validateRange('2025-01-01', '2025-01-31').days, 31);
  assert.equal(validateRange('2025-01-01', '2025-02-01').error, 'range_too_large');
  // Crosses a leap day: Feb 15 -> Mar 16, 2024 is 31 days inclusive.
  assert.equal(validateRange('2024-02-15', '2024-03-16').days, 31);
  assert.equal(validateRange('2024-02-15', '2024-03-17').error, 'range_too_large');
});

test('route /usage returns deterministic synthetic daily usage', () => {
  const a = route('GET', '/usage?from=2025-01-30&to=2025-02-02');
  const b = route('GET', '/usage?from=2025-01-30&to=2025-02-02');
  assert.equal(a.statusCode, 200);
  assert.deepEqual(a, b);
  assert.equal(a.body.synthetic, true);
  assert.equal(a.body.days, 4);
  assert.deepEqual(a.body.usage.map(d => d.date), ['2025-01-30', '2025-01-31', '2025-02-01', '2025-02-02']);
  for (const d of a.body.usage) assert.ok(Number.isInteger(d.requests) && d.requests >= 1000 && d.requests < 10000);
  // Same day yields the same value regardless of the surrounding range.
  const single = route('GET', '/usage?from=2025-02-01&to=2025-02-01');
  assert.equal(single.body.usage[0].requests, a.body.usage[2].requests);
});

test('route /usage returns 400 with JSON error bodies', () => {
  for (const q of ['', '?from=2025-01-01', '?to=2025-01-01', '?from=2025-02-30&to=2025-03-01',
    '?from=2025-03-02&to=2025-03-01', '?from=2025-01-01&to=2025-02-01']) {
    const r = route('GET', `/usage${q}`);
    assert.equal(r.statusCode, 400, q);
    assert.equal(typeof r.body.error, 'string');
    assert.equal(typeof r.body.message, 'string');
  }
});

test('route /health and unknown paths', () => {
  assert.deepEqual(route('GET', '/health'), {statusCode: 200, body: {service: 'usage-api', status: 'ok', version: '1.0.0'}});
  assert.equal(route('GET', '/nope').statusCode, 404);
  assert.equal(route('POST', '/usage').statusCode, 405);
});

test('HTTP server serves JSON for /health and /usage', async (t) => {
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.match(health.headers.get('content-type'), /application\/json/);
  assert.equal((await health.json()).status, 'ok');

  const bad = await fetch(`${base}/usage?from=2025-02-29&to=2025-03-01`);
  assert.equal(bad.status, 400);
  assert.match(bad.headers.get('content-type'), /application\/json/);
  assert.equal((await bad.json()).error, 'invalid_from');

  const ok = await fetch(`${base}/usage?from=2025-03-01&to=2025-03-03`);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).usage.length, 3);
});
