import test from 'ava';
import Network from './helpers/mock_fetch.mjs';
import MockClock from './helpers/mock_clock.mjs';

test.beforeEach(t => {
  t.context.clock = new MockClock(t.context.globals = {});
  t.context.network = new Network(t.context.globals);
});

test.afterEach(t => {
  const clock = t.context.clock;
  t.assert(clock.finish() == false);
  clock.uninstall();
  t.context.clock = null;
  t.context.network = null;
});

test('handles a request', async (t) => {
  const clock = t.context.clock;
  clock.autoAdvance(200000);
  const requestUrl = 'https://foo.com';
  const responseObject = {test: 'response'};
  t.context.network.install(async (resource, init) => {
    t.assert(resource == requestUrl, `Requested URL ${resource} is not ${requestUrl}`);
    return {status: 200, body: JSON.stringify(responseObject)};
  });
  const conn = t.context.network.connection(1000);
  let response = await conn.fetch(requestUrl);
  let obj = await response.json();
  t.assert(JSON.stringify(obj) == JSON.stringify(responseObject));
  t.assert(clock.performance.now() == 1000, 'Expected exactly 1s, took ' + clock.performance.now() + 'ms');
});
