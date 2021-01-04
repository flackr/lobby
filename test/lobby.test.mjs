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
  clock.autoAdvance(120000);
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

  // empty initial syncs.
  await room1.sync();
  await room2.sync();

  // Subsequent sync should wait for messages.
  let sync2 = room2.sync();
  await room1.sendEvent('m.room.message', {
    'msgtype': 'm.text',
    'body': 'test',
  });
  let result2 = await sync2;
  t.is(result2.timeline.length, 1, 'Expected one message');
  t.is(result2.timeline[0].content.body, 'test', 'Expected test message in body');
});

test('gets typing notifications', async function(t) {
  const clock = t.context.clock;
  clock.autoAdvance(10000);
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
  let room1 = await client1.join(room_id, true);
  let result = await room1.sync();
  t.is(result.ephemeral.length, 1, 'Expect a typing notification');
  t.deepEqual(result.ephemeral[0].content.user_ids, ['@user1:localhost'], 'Expect to be notified of user1 typing');

  clock.autoAdvance(200000);
  result = await room1.sync();
  t.is(result.ephemeral.length, 1, 'Expect a typing notification');
  t.deepEqual(result.ephemeral[0].content.user_ids, [], 'Expect to be notified user1 stopped typing');
});

test('times out on no messages', async function(t) {
  const clock = t.context.clock;
  clock.autoAdvance(200000);
  const serviceDetails = {
    appName: 'com.github.flackr.lobby.Chat',
    defaultHost: 'localhost',
    lobbyRoom: 'foobar',
    globals: {
      fetch: t.context.network.connection(0).fetch,
      localStorage: t.context.localStorage,
    },
    timeout: 10000,
  };
  let service1 = await lobby.createService(serviceDetails);
  let client1 = await service1.login('user1', 'password');
  let room_id = await client1.create({name: 'Test'});
  let room1 = await client1.join(room_id);

  // empty initial syncs.
  await room1.sync();

  // Subsequent sync normally waits for messages, should time out at 30s.
  let result = await room1.sync();
  t.is(clock.performance.now(), 10000, 'Expected 10s passed waiting for timeout');
  t.is(result.timeline.length, 0, 'Expect no messages');
});