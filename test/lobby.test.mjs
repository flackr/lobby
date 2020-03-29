import test from 'ava';
import * as lobby from '../src/lobby.mjs';

test('runs a test', async function(t) {
  let service = await lobby.createService({
    appName: 'com.github.flackr.lobby.Chat',
    defaultHost: 'localhost',
    lobbyRoom: 'foobar',
  });
  t.is(true, true);
});