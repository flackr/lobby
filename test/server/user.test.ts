import { describe, expect, test } from '@jest/globals';

import { MockEnvironment, MockClient } from '../mock/environment.ts';
import { clock, lobbyDb, createLobbyServer } from '../mock/lobby.ts';
import type { RegistrationData } from '../../src/server/user.ts';

describe('lobby server', () => {
  const tryCreate = async (client: MockClient, address: string, fields: Partial<RegistrationData>) => {
    const data: RegistrationData = {
      username: 'user',
      password: 'supersecret',
      alias: 'Bob',
      email: null,
      ...fields
    }
    let formData = new FormData();
    for (let entry of Object.entries(data)) {
      if (entry[1] !== null) {
        formData.set(entry[0], entry[1] as string);
      }
    }
    let response = await client.fetch(`${address}/api/register`, {
      method: 'POST',
      body: formData,
    });
    return response;
  }

  test('Registers a new user and verifies email', async () => {
    await lobbyDb.initialized;
    const world = new MockEnvironment(clock);
    const { server, transport } = createLobbyServer(world);
    const address = await server.listen();

    const client = world.createClient();
    let response = await tryCreate(client, address, {
      username: 'verify-test',
      email: 'test@test.com',
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

    let formData = new FormData();
    formData.set('email', 'test@test.com');
    formData.set('code', code);
    response = await client.fetch(`${address}/api/verify`, {
      method: 'POST',
      body: formData,
    });
    expect(response.status).toBe(200);
    await server.close();
  });

  test('Registers a guest user', async () => {
    await lobbyDb.initialized;
    const world = new MockEnvironment(clock);
    const { server } = createLobbyServer(world);
    const address = await server.listen();

    const client1 = world.createClient();
    let result = await tryCreate(client1, address, {username: null, password: null});
    expect(result.status).toBe(200);
    await server.close();
  });

  test('Registration of users is limited', async () => {
    await lobbyDb.initialized;
    const world = new MockEnvironment(clock);
    const { server } = createLobbyServer(world);
    const address = await server.listen();

    const client1 = world.createClient();
    const client2 = world.createClient();
    let rejected = false;
    let created = 0;
    // Ensure that one ip is eventually rate limited.
    for (; created < 100; ++created) {
      let result = await tryCreate(client1, address, {username: `ratelimittest${created}`});
      if (result.status == 429) {
        rejected = true;
        break;
      }
      expect(result.status).toBe(200);
      if (result.status != 200) {
        return;
      }
    }
    expect(rejected).toBe(true);
    // A different ip should still be allowed to create an account.
    expect((await tryCreate(client2, address, {username: `ratelimittest${created++}`})).status).toBe(200);

    // After enough time, client1 should be able to create again.
    clock.advanceBy(1000 * 60 * 60 * 24 * 1);
    expect((await tryCreate(client1, address, {username: `ratelimittest${created++}`})).status).toBe(200);
    await server.close();
  });

});
