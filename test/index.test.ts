import { describe, expect, test } from '@jest/globals';

import { initializeDatabase } from '../src/server/db';
import { MockTransport } from './mock/transport';
import { Server } from '../src/server/server';
import { MockEnvironment } from './mock/environment';
import { MockDB } from './mock/db';

describe('sum module', () => {
  test('Starts a server and requests a resource from it', async () => {
    const transport = new MockTransport();
    const world = new MockEnvironment();
    const db = new MockDB(world.clock);
    await db.initialize();
    await initializeDatabase(db);

    const hostname = 'serializer.ca';
    const clientServer = world.createClient({ address: hostname });
    const server = new Server({ hostname, port: 8000, db, clock: world.clock.api(), transport: transport, createServer: clientServer.createServer });
    // const server = new Server({ port: 8000, db, transport: transport });
    const address = await server.listen();
    const formData = new FormData();
    formData.set('email', 'test');
    formData.set('password', 'supersecret');
    formData.set('alias', 'tester');

    const client = world.createClient();
    const response = await client.fetch(`${address}/api/register`, {
      method: 'POST',
      body: formData,
    });
    console.log(await response.text());
    await server.close();
  });

});
