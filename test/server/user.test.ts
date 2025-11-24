import { describe, expect, test } from '@jest/globals';

import { MockTransport } from '../mock/transport.ts';
import { Server } from '../../src/server/server.ts';
import { MockEnvironment } from '../mock/environment.ts';
import { clock, lobbyDb } from '../mock/lobby.ts';

describe('lobby server', () => {
  test('Registers a new user and logs in', async () => {
    await lobbyDb.initialized;
    const transport = new MockTransport();
    const world = new MockEnvironment(clock);
    const hostname = 'example.com';
    const sender = 'no-reply@example.com';
    const clientServer = world.createClient({ address: hostname });
    const server = new Server({ hostname, port: 8000, emailFrom: sender, db: lobbyDb, clock: world.clock.api(), transport: transport, createServer: clientServer.createServer });
    // const server = new Server({ port: 8000, db, transport: transport });
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
    console.log(await response.text());
    let lastMail = transport.getLastMail();
    if (!lastMail) {
      throw new Error('No e-mails sent');
    }
    expect(lastMail.to).toBe('test@test.com');
    let codeMatch = lastMail.text.match(/please enter.*:\s*([a-z0-9]{6})\s*/m);
    expect(codeMatch).not.toBeNull();
    let code = codeMatch && codeMatch[1] || '';
    console.log('Code match:', code);
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


});
