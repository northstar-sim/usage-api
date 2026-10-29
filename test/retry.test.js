import test from 'node:test';
import assert from 'node:assert/strict';
import {retry, backoffDelay} from '../src/retry.js';

test('backoffDelay doubles from baseMs and caps at maxMs', () => {
  const opts = {baseMs: 200, maxMs: 2000};
  assert.equal(backoffDelay(1, opts), 200);
  assert.equal(backoffDelay(2, opts), 400);
  assert.equal(backoffDelay(3, opts), 800);
  assert.equal(backoffDelay(5, opts), 2000);
  assert.equal(backoffDelay(10, opts), 2000);
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
    if (++calls < 3) throw new Error('transient');
    return calls;
  }, {attempts: 3, baseMs: 1, maxMs: 2});
  assert.equal(result, 3);
  assert.equal(calls, 3);
});

test('retry gives up after exactly `attempts` calls and rethrows the last error', async () => {
  let calls = 0;
  await assert.rejects(
    retry(async () => { throw new Error(`fail ${++calls}`); }, {attempts: 3, baseMs: 1, maxMs: 2}),
    {message: 'fail 3'}
  );
  assert.equal(calls, 3);
});

test('retry uses the default budget of 3 attempts', async () => {
  let calls = 0;
  await assert.rejects(retry(async () => { calls++; throw new Error('nope'); }, {baseMs: 1, maxMs: 2}));
  assert.equal(calls, 3);
});
