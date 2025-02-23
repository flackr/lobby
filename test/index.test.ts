import { describe, expect, test } from '@jest/globals';
import { PGlite } from '@electric-sql/pglite';

import { initializeDatabase } from '../src/server/db';
import { MockTransport } from './mock/transport';
import { Server } from '../src/server/server';

describe('sum module', () => {
  test('Starts a server and requests a resource from it', async () => {
    const db = new PGlite();
    await initializeDatabase(db);

    let transport = new MockTransport();
    let server = new Server({ port: 8000, db, transport: transport });
    const address = await server.listen();
    const formData = new FormData();
    formData.set('username', 'test');
    formData.set('password', 'supersecret');

    const response = await fetch(`${address}/register`, {
      method: 'POST',
      body: formData,
    });
    console.log(await response.text());
    await server.close();
  });
});
