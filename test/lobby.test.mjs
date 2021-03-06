import test from 'ava';
import * as lobby from '../src/lobby.mjs';
import Network from './helpers/mock_fetch.mjs';
import MockClock from './helpers/mock_clock.mjs';
import MockMatrixServer from './helpers/mock_matrix.mjs';
import MockLocalStorage from './helpers/mock_localstorage.mjs';
import MockWebRTC from './helpers/mock_webrtc.mjs';

function shallowClone(obj) {
  let result = {};
  for (let key in obj) {
    result[key] = obj[key];
  }
  return result;
}

function getEvents(obj, eventName, count) {
  return new Promise((resolve) => {
    let result = [];
    let observe = function(evt) {
      result.push(evt);
      if (--count == 0) {
        obj.removeEventListener(eventName, observe);
        resolve(result);
      }
    }
    obj.addEventListener(eventName, observe);
  })
}

test.beforeEach(t => {
  t.context.clock = new MockClock(t.context.globals = {});
  t.context.network = new Network(t.context.globals);
  t.context.localStorage = new MockLocalStorage;
  t.context.matrix = new MockMatrixServer({host: 'localhost', globals: t.context.globals});
  t.context.network.install(t.context.matrix.fetch);
  t.context.mockRTC = new MockWebRTC(t.context.globals);
  // Lobby adds a beforeunload listener in order to disconnect. For now, we won't use it.
  t.context.globals.addEventListener = () => {};
  t.context.globals.removeEventListener = () => {};
  t.context.mockRTC.install();
});

test.afterEach(t => {
  const clock = t.context.clock;
  clock.finish(Infinity);
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

test('exchanges messages over webrtc', async function(t) {
  const clock = t.context.clock;
  clock.autoAdvance(200000);
  const serviceDetails = {
    appName: 'com.github.flackr.lobby.Chat',
    defaultHost: 'localhost',
    lobbyRoom: 'foobar',
    globals: {...t.context.globals,
      fetch: t.context.network.connection(1).fetch,
      localStorage: t.context.localStorage,
    }
  };
  let service1 = await lobby.createService(serviceDetails);
  let client1 = await service1.login('user1', 'password');
  let room_id = await client1.create({name: 'Test'});
  let room1 = await client1.join(room_id, true);

  let connected = new Promise((resolve) => {
    room1.addEventListener('connection', resolve);
  });

  let service2 = await lobby.createService(serviceDetails);
  let client2 = await service2.login('user2', 'password');
  let room2 = await client2.join(room_id, true);

  let con1 = await connected;
  t.is(con1.user_id, '@user2:localhost');

  room1.send({text: 'message1'}, {backup: true});
  t.is((await getEvents(room2, 'event', 1))[0].detail.text, 'message1');

  room2.send({text: 'message2'}, {backup: true});
  t.is((await getEvents(room1, 'event', 1))[0].detail.text, 'message2');

  room2.quit();
  room1.quit();

  // If a user comes later when no one is around, they should still see all of the messages.
  let service3 = await lobby.createService(serviceDetails);
  let client3 = await service3.login('user2', 'password');
  let room3 = await client3.join(room_id, true);
  await getEvents(room3, 'load', 1);
  t.is(room3.events.length, 2);
  room3.quit();
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
