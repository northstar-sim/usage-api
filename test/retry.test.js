import test from 'node:test';
import assert from 'node:assert/strict';
import {retry, backoffDelay, isRetryable, MAX_ATTEMPTS} from '../src/retry.js';

const httpError = status => Object.assign(new Error(`HTTP ${status}`), {status});
const networkError = () => Object.assign(new Error('socket hang up'), {code: 'ECONNRESET'});

test('backoffDelay doubles from baseMs and caps at maxMs', () => {
  const opts = {baseMs: 200, maxMs: 2000};
  assert.equal(backoffDelay(1, opts), 200);
  assert.equal(backoffDelay(2, opts), 400);
  assert.equal(backoffDelay(3, opts), 800);
  assert.equal(backoffDelay(5, opts), 2000);
  assert.equal(backoffDelay(10, opts), 2000);
});

test('isRetryable accepts network errors and 5xx, rejects 4xx including 429', () => {
  assert.equal(isRetryable(networkError()), true);
  assert.equal(isRetryable(Object.assign(new Error('fetch failed'), {cause: {code: 'ETIMEDOUT'}})), true);
  assert.equal(isRetryable(httpError(500)), true);
  assert.equal(isRetryable(httpError(503)), true);
  assert.equal(isRetryable(httpError(400)), false);
  assert.equal(isRetryable(httpError(404)), false);
  assert.equal(isRetryable(httpError(429)), false);
  assert.equal(isRetryable(new Error('unknown')), false);
});

test('retry returns the first successful result without extra calls', async () => {
  let calls = 0;
  const result = await retry(async () => { calls++; return 'ok'; }, {attempts: 3, baseMs: 1, maxMs: 2});
  assert.equal(result, 'ok');
  assert.equal(calls, 1);
});

test('retry recovers after transient failures within the attempt budget', async () => {
  let calls = 0;
  const result = await retry(async () => {
    if (++calls < 3) throw networkError();
    return calls;
  }, {attempts: 3, baseMs: 1, maxMs: 2});
  assert.equal(result, 3);
  assert.equal(calls, 3);
});

test('retry retries 5xx responses', async () => {
  let calls = 0;
  const result = await retry(async () => {
    if (++calls < 2) throw httpError(502);
    return 'ok';
  }, {attempts: 3, baseMs: 1, maxMs: 2});
  assert.equal(result, 'ok');
  assert.equal(calls, 2);
});

test('retry does not retry 4xx, including 429 without Retry-After', async () => {
  for (const status of [400, 404, 429]) {
    let calls = 0;
    await assert.rejects(
      retry(async () => { calls++; throw httpError(status); }, {attempts: 3, baseMs: 1, maxMs: 2}),
      {status}
    );
    assert.equal(calls, 1, `status ${status} should not be retried`);
  }
});

test('retry gives up after exactly `attempts` calls and rethrows the last error', async () => {
  let calls = 0;
  await assert.rejects(
    retry(async () => { throw httpError(500 + ++calls); }, {attempts: 3, baseMs: 1, maxMs: 2}),
    {message: 'HTTP 503'}
  );
  assert.equal(calls, 3);
});

test('retry caps total attempts at MAX_ATTEMPTS even when asked for more', async () => {
  assert.equal(MAX_ATTEMPTS, 3);
  let calls = 0;
  await assert.rejects(retry(async () => { calls++; throw networkError(); }, {attempts: 10, baseMs: 1, maxMs: 2}));
  assert.equal(calls, 3);
});

test('retry uses the default budget of 3 attempts', async () => {
  let calls = 0;
  await assert.rejects(retry(async () => { calls++; throw httpError(503); }, {baseMs: 1, maxMs: 2}));
  assert.equal(calls, 3);
});
