import { describe, expect, test } from '@jest/globals';

import { MockEnvironment } from './mock/environment';

describe('mock environment', () => {
  describe('server', () => {
    test('Can simulate a fetch from a server', async () => {
      const world = new MockEnvironment();
      const hostname = 'test.com';
      const clientServer = world.createClient({ address: hostname });
      const server = clientServer.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('server response');
      });
      await new Promise(resolve => {
        server.listen(8000, hostname, resolve);
      });

      const address = `http://${hostname}:8000`;
      const client = world.createClient({ latency: 100 });
      const response = await client.fetch(`${address}/passed-url`, {
        method: 'GET',
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/plain');
      const responseText = await response.text();
      expect(responseText).toBe('server response');
      expect(world.clock.now()).toBe(100);
      await new Promise(resolve => server.close(resolve));
    });
  });
});
