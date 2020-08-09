import test from 'ava';
import MockClock from './helpers/mock_clock.mjs';

test.beforeEach(t => {
  t.context.clock = new MockClock(t.context.globals = {});
});

test.afterEach(t => {
  const clock = t.context.clock;
  t.assert(clock.finish() == false);
  clock.uninstall();
  t.context.clock = null;
})

test('runs a timeout', (t) => {
  const globals = t.context.globals;
  const clock = t.context.clock;
  let hasRun = false;
  let fn = () => { hasRun = true; };
  globals.setTimeout(fn, 10);
  t.assert(!hasRun, "Shouldn't immediately run the callback.");
  clock.advance(5);
  t.assert(!hasRun, "Shouldn't run the callback until it is due.");
  clock.advance(5);
  t.assert(hasRun, "Should run the callback after 10ms.");
});

test('runs an interval', (t) => {
  const globals = t.context.globals;
  const clock = t.context.clock;
  let count = 0;
  let fn = () => { ++count; };
  let id = globals.setInterval(fn, 10);
  t.assert(count == 0, "Doesn't run immediately.");
  clock.advance(5);
  t.assert(count == 0, "Hasn't run after 5ms.");
  clock.advance(5);
  t.assert(count == 1, "Runs once at 10ms.");
  clock.advance(20);
  t.assert(count == 3, "Runs two more times at 30ms.");
  globals.clearInterval(id);
});
