import { describe, expect, test } from '@jest/globals';

import { WebSocket } from 'ws';

import { MockEnvironment } from './environment.ts';
import type { RTCPeerConnectionInterface, WebSocketInterface } from '../../src/common/interfaces';
import { get } from 'http';

const BACKLOG = 511;

describe('mock environment', () => {
  describe('client', () => {
    test('Can connect over WebRTC to another client', async () => {
      const world = new MockEnvironment();
      const clientA = world.createClient();
      const clientB = world.createClient();

      // Create peer connections.
      const pcA = new clientA.RTCPeerConnection();
      const pcB = new clientB.RTCPeerConnection();

      function getIceCandidates(pc: RTCPeerConnectionInterface): Promise<RTCIceCandidateInit[]> {
        return new Promise((resolve) => {
          const candidates: RTCIceCandidateInit[] = [];
          function oncandidate(event: RTCPeerConnectionIceEvent) {
            if (event.candidate) {
              candidates.push(event.candidate);
            } else {
              pc.removeEventListener('icecandidate', oncandidate);
              resolve(candidates);
            }
          }
          pc.addEventListener('icecandidate', oncandidate);
        });
      }
      const aCandidates = getIceCandidates(pcA);
      const bCandidates = getIceCandidates(pcB);

      const connected = new Promise<void>((resolve) => {
        function checkState() {
          if (pcA.connectionState === 'connected' && pcB.connectionState === 'connected') {
            pcA.removeEventListener('connectionstatechange', checkState);
            pcB.removeEventListener('connectionstatechange', checkState);
            resolve();
          }
        }
        pcA.addEventListener('connectionstatechange', checkState);
        pcB.addEventListener('connectionstatechange', checkState);
        checkState();
      });

      // Create offer data channel, receive on other end.
      const dcA = pcA.createDataChannel('test');
      function getDataChannelPromise(pc: RTCPeerConnectionInterface): Promise<RTCDataChannel> {
        return new Promise((resolve) => {
          pc.addEventListener('datachannel', (event) => {
            resolve(event.channel);
          }, { once: true });
        });
      }
      const dcBPromise = getDataChannelPromise(pcB);

      // Handle offer/answer exchange.
      const offer = await pcA.createOffer();
      await pcA.setLocalDescription(offer);
      await pcB.setRemoteDescription(offer);
      const answer = await pcB.createAnswer();
      await pcB.setLocalDescription(answer);
      await pcA.setRemoteDescription(answer);
      for (const candidate of await aCandidates) {
        await pcB.addIceCandidate(candidate);
      }
      for (const candidate of await bCandidates) {
        await pcA.addIceCandidate(candidate);
      }

      // Await connection.
      await connected;
      const dcB = await dcBPromise;

      // Test data channel communication.
      const messageFromAToB = new Promise<string>((resolve) => {
        dcB.addEventListener('message', (event) => {
          resolve(event.data as string);
        }, { once: true });
      });
      const messageFromBToA = new Promise<string>((resolve) => {
        dcA.addEventListener('message', (event) => {
          resolve(event.data as string);
        }, { once: true });
      });
      dcA.send('hello from A');
      dcB.send('hello from B');
      expect(await messageFromAToB).toBe('hello from A');
      expect(await messageFromBToA).toBe('hello from B');

      // Clean up.
      pcA.close();
      pcB.close();
    });
  });
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
