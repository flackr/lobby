import test from 'ava';
import * as lobby from '../src/lobby.mjs';
import Network from './helpers/mock_fetch.mjs';
import MockClock from './helpers/mock_clock.mjs';
import MockMatrixServer from './helpers/mock_matrix.mjs';
import MockLocalStorage from './helpers/mock_localstorage.mjs';

test.beforeEach(t => {
  t.context.clock = new MockClock(t.context.globals = {});
  t.context.network = new Network(t.context.globals);
  t.context.localStorage = new MockLocalStorage;
  t.context.matrix = new MockMatrixServer({host: 'localhost', globals: t.context.globals});
  t.context.network.install(t.context.matrix.fetch);
});

test.afterEach(t => {
  const clock = t.context.clock;
  t.assert(clock.finish() == false);
  clock.uninstall();
  t.context.clock = null;
  t.context.network = null;
});

test('exchanges matrix messages', async function(t) {
  const clock = t.context.clock;
  clock.autoAdvance = true;
  const serviceDetails = {
    appName: 'com.github.flackr.lobby.Chat',
    defaultHost: 'localhost',
    lobbyRoom: 'foobar',
    globals: {
      fetch: t.context.network.connection(0).fetch,
      localStorage: t.context.localStorage,
    }
  };
  let service1 = await lobby.createService(serviceDetails);
  let client1 = await service1.login('user1', 'password');
  let room_id = await client1.create({name: 'Test'});
  let room1 = await client1.join(room_id);

  let service2 = await lobby.createService(serviceDetails);
  let client2 = await service2.login('user2', 'password');
  let room2 = await client2.join(room_id);

  await room1.sendEvent('m.room.message', {
    'msgtype': 'm.text',
    'body': 'test',
  });
  let result2 = await room2.sync();
  t.is(result2.timeline.length, 1, 'Expected one message');
  t.is(result2.timeline[0].content.body, 'test', 'Expected test message in body');
});