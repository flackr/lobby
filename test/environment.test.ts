import { describe, expect, test } from '@jest/globals';

import { WebSocket } from 'ws';

import { MockEnvironment } from './mock/environment';
import type { WebSocketInterface } from '../src/common/interfaces';

const BACKLOG = 511;

describe('mock environment', () => {
  describe('server', () => {
    test('Can simulate a fetch from a server with latency', async () => {
      const world = new MockEnvironment();
      const hostname = 'test.com';
      const clientServer = world.createClient({ address: hostname });
      const server = clientServer.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('server response');
      });
      await new Promise(resolve => {
        server.listen(8000, hostname, BACKLOG, resolve);
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
    test('Can simulate a websocket connection with a server with latency', async () => {
      const world = new MockEnvironment();
      const hostname = 'test.com';
      const clientServer = world.createClient({ address: hostname });
      const server = clientServer.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('');
      });
      const wss = new clientServer.WebSocketServer({ server });
      const swsPromise: Promise<WebSocketInterface> = new Promise(resolve => {
        wss.on('connection', (ws) => {
          resolve(ws);
        });
      });
      await new Promise(resolve => {
        server.listen(8000, hostname, BACKLOG, resolve.bind(null, server));
      });

      // Connect client.
      const address = `ws://${hostname}:8000`;
      const client = world.createClient({ latency: 100 });
      const ws = new client.WebSocket(address);
      expect(ws.readyState).toBe(WebSocket.CONNECTING);

      // Await open promises.
      const promises = await Promise.all([swsPromise, new Promise(resolve => { ws.addEventListener('open', resolve); })]);
      const sws = promises[0];
      expect(ws.readyState).toBe(WebSocket.OPEN);
      expect(world.clock.now()).toBe(100);

      // Send a message to the server.
      const serverMessage = new Promise(resolve => {
        sws.addEventListener('message', (event) => {
          resolve(event.data);
        }, {once: true});
      });
      ws.send('Hello server');
      expect(await serverMessage).toBe('Hello server');

      // Send a message to the client.
      const clientMessage = new Promise(resolve => {
        ws.addEventListener('message', (event) => {
          resolve(event.data);
        }, {once: true});
      });
      sws.send('Hello client');
      expect(await clientMessage).toBe('Hello client');
      expect(world.clock.now()).toBe(200);

      // Close the connection.
      const closePromises = Promise.all([
        new Promise(resolve => ws.addEventListener('close', resolve)),
        new Promise(resolve => sws.addEventListener('close', resolve)),
      ]);
      ws.close();
      await closePromises;
      expect(ws.readyState).toBe(WebSocket.CLOSED);
      expect(world.clock.now()).toBe(300);
      await new Promise(resolve => server.close(resolve));
    });
  });
});
