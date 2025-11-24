import { describe, expect, test } from '@jest/globals';

import { MockEnvironment, MockClient } from '../mock/environment.ts';
import { clock, lobbyDb, createLobbyServer } from '../mock/lobby.ts';

describe('lobby server', () => {
  const tryCreate = async (client: MockClient, address: string, username: string) => {
    let formData = new FormData();
    formData.set('password', 'supersecret');
    formData.set('username', username);
    formData.set('alias', 'Bob');
    let response = await client.fetch(`${address}/api/register`, {
      method: 'POST',
      body: formData,
    });
    return response.status;
  }

  test('Registers a new user and logs in', async () => {
    await lobbyDb.initialized;
    const world = new MockEnvironment(clock);
    const { server, transport } = createLobbyServer(world);
    const address = await server.listen();
    let formData = new FormData();
    formData.set('email', 'test@test.com');
    formData.set('password', 'supersecret');
    formData.set('username', 'tester');
    formData.set('alias', 'Bob');

    const client = world.createClient();
    let response = await client.fetch(`${address}/api/register`, {
      method: 'POST',
      body: formData,
    });
    let lastMail = transport.getLastMail();
    if (!lastMail) {
      throw new Error('No e-mails sent');
    }
    expect(lastMail.to).toBe('test@test.com');
    let codeMatch = lastMail.text.match(/please enter.*:\s*([a-z0-9]{6})\s*/m);
    expect(codeMatch).not.toBeNull();
    let code = codeMatch && codeMatch[1] || '';
    expect(code).not.toBe('');

    formData = new FormData();
    formData.set('email', 'test@test.com');
    formData.set('code', code);
    response = await client.fetch(`${address}/api/verify`, {
      method: 'POST',
      body: formData,
    });
    expect(response.status).toBe(200);
    await server.close();
  });

  test('Registration of users is limited', async () => {
    await lobbyDb.initialized;
    const world = new MockEnvironment(clock);
    const { server, transport } = createLobbyServer(world);
    const address = await server.listen();

    const client1 = world.createClient();
    const client2 = world.createClient();
    let rejected = false;
    let created = 0;
    // Ensure that one ip is eventually rate limited.
    for (; created < 100; ++created) {
      let result = await tryCreate(client1, address, `ratelimittest${created}`);
      if (result == 429) {
        rejected = true;
        break;
      }
      expect(result).toBe(200);
      if (result != 200) {
        return;
      }
    }
    expect(rejected).toBe(true);
    // A different ip should still be allowed to create an account.
    expect(await tryCreate(client2, address, `ratelimittest${created++}`)).toBe(200);

    // After enough time, client1 should be able to create again.
    clock.advanceBy(1000 * 60 * 60 * 24 * 1);
    expect(await tryCreate(client1, address, `ratelimittest${created++}`)).toBe(200);
    await server.close();
  });

});
