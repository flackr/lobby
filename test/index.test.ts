import { describe, expect, test } from '@jest/globals';
import { PGlite } from '@electric-sql/pglite';

import { initializeDatabase } from '../src/server/db';
import { MockTransport } from './mock/transport';
import { Server } from '../src/server/server';
import { MockEnvironment } from './mock/environment';

describe('sum module', () => {
  test('Starts a server and requests a resource from it', async () => {
    const db = new PGlite();
    await initializeDatabase(db);

    const transport = new MockTransport();
    const world = new MockEnvironment();
    const hostname = 'serializer.ca';
    const clientServer = world.createClient({ address: hostname });
    let server = new Server({ hostname, port: 80, db, transport: transport, createServer: clientServer.createServer });
    const address = await server.listen();
    const formData = new FormData();
    formData.set('username', 'test');
    formData.set('password', 'supersecret');

    const client = world.createClient();
    const response = await client.fetch(`${address}/register`, {
      method: 'POST',
      body: formData,
    });
    console.log(await response.text());
    await server.close();
  });
});
