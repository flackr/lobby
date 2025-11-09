import fs from 'node:fs';
import http from 'node:http';
import ws from 'ws';
import crypto from 'node:crypto';
import serveStatic from 'serve-static';
import finalhandler from 'finalhandler';
import formidable from 'formidable';
import type { WebSocketInterface, ClockAPI } from '../common/interfaces';
import type { PGInterface } from './types.ts';

import { AuthenticationHandler }  from './user.ts';
// import type { User } from './user';

// Default backlog size for http server listen calls.
const BACKLOG = 511;

type MailOptions = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};
type SentMessageInfo = {
  messageId: string; // E.g. <uuid@gmail.com>
};

export type TransportInterface = {
  sendMail(mailOptions: MailOptions): Promise<SentMessageInfo>;
};

export type ServerInterface = {
  listen(port: number, hostname: string, backlog: number, callback: () => void);
  close(callback: (value: Error | undefined) => void);
};
export type WebSocketServerOptions = {
  server?: ServerInterface;
}
export type WebSocketServerInterface = {
  // TODO: Write separate on definition for each event type.
  on(event: 'connection', listener: (websocket: WebSocketInterface) => void) : void;
  on(event: 'error', listener: (...args: unknown[]) => void) : void;
  on(event: 'close', listener: () => void) : void;
};
export type ServerIncomingMessage = {
  url: string;
  method: string;
};
export interface ServerResponseInterface {
  writeHead: (statusCode: number, headers: {[key: string]: string | number}) => void;
  end: () => void;
}
export type ServerCallback = (req: http.IncomingMessage, res: ServerResponseInterface | http.ServerResponse) => void;
export type createServerInterface = (callback: ServerCallback) => ServerInterface;

interface ServerConfig {
  db: PGInterface;
  transport: TransportInterface;
  clock: ClockAPI;
  port: number;
  hostname?: string;
  basePath?: string;
  createServer?: createServerInterface;
  WebSocketServer?: typeof ws.Server;
}

export type ServerAddress = string;

const DEFAULT_PORT = 8000;
export class Server {
  #config: ServerConfig;
  #server: ServerInterface;
  #serve: serveStatic.RequestHandler<http.ServerResponse<http.IncomingMessage>>;
  #authHandler: AuthenticationHandler;

  constructor(config: ServerConfig) {
    this.#config = config;
    this.#server = (this.#config.createServer || http.createServer)(
      this.#onRequest
    );
    this.#serve = serveStatic('./dist');
    this.#authHandler = new AuthenticationHandler({
      db: this.#config.db,
      clock: this.#config.clock
    });
  }

  listen(): Promise<ServerAddress> {
    return new Promise((resolve) => {
      const port = this.#config.port || DEFAULT_PORT;
      const host = this.#config.hostname || '127.0.0.1';
      this.#server.listen(port, host, BACKLOG, () => {
        const address = `http://${host}:${port}`;
        resolve(address);
      });
    });
  }

  close(): Promise<Error> {
    return new Promise((resolve) => {
      this.#server.close(resolve);
    });
  }

  #onRequest = async (req: http.IncomingMessage, res: ServerResponseInterface | http.ServerResponse) => {
    const headers: {[key: string]: number | string} = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
      'Access-Control-Max-Age': 2592000, // 30 days
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, headers);
      res.end();
      return;
    }
    if (!['POST', 'GET'].includes(req.method)) {
      res.writeHead(405, {...headers, 'Content-Type': 'text/plain'});
      res.end(`${req.method} is not allowed for the request.`);
      return;
    }
    console.log(`Request for ${req.url}`);
    if (req.url == '/api/register') {
      const form = formidable({});
      // TODO: Maybe use first address from x-forwarded-for header?
      const ip: string = (req.headers['x-real-ip'] as string) || req.socket.remoteAddress;
      try {
        const fields = (await form.parse(req))[0];

        await this.#authHandler.registerUser(ip, {
          alias: fields.alias[0],
          email: fields.email[0],
          password: fields.password[0],
        });
        res.writeHead(200, { ...headers, 'Content-Type': 'text/plain' });

      } catch (err) {
        console.error(err);
        res.writeHead(err.httpCode || 400, { ...headers, 'Content-Type': 'text/plain' });
        res.end(String(err));
        return;
      }
      res.end();
    } else if (res instanceof http.ServerResponse) {
      // If the request doesn't match any dynamic URL,
      // serve the public folder.
      // Note this only works with the real server, not the mock interface.
      this.#serve(req, res, finalhandler(req, res));
    } else {
      res.writeHead(404, headers);
      res.end();
    }
  };
}
