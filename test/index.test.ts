import { beforeAll, describe, expect, test } from '@jest/globals';

import { initializeDatabase } from '../src/server/db';
import { MockTransport } from './mock/transport';
import { Server } from '../src/server/server';
import { MockEnvironment } from './mock/environment';
import { MockDB } from './mock/db';

describe('lobby server', () => {
  const transport = new MockTransport();
  const world = new MockEnvironment();
  const db = new MockDB(world.clock);
  beforeAll(async () => {
    // Initializing the database takes some time, so only do it once for all tests.
    await db.initialize();
    await initializeDatabase(db);
  })
  test('Registers a new user', async () => {
    const hostname = 'example.com';
    const sender = 'no-replay@example.com';
    const clientServer = world.createClient({ address: hostname });
    const server = new Server({ hostname, port: 8000, emailFrom: sender, db, clock: world.clock.api(), transport: transport, createServer: clientServer.createServer });
    // const server = new Server({ port: 8000, db, transport: transport });
    const address = await server.listen();
    const formData = new FormData();
    formData.set('email', 'test@test.com');
    formData.set('password', 'supersecret');
    formData.set('alias', 'tester');

    const client = world.createClient();
    const response = await client.fetch(`${address}/api/register`, {
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

    await server.close();
  });

});
