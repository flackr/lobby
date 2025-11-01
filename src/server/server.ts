import fs from 'node:fs';
import http from 'node:http';
import ws from 'ws';
import type { Results, QueryOptions } from '@electric-sql/pglite';
import serveStatic from 'serve-static';
import finalhandler from 'finalhandler';
import formidable from 'formidable';
import type { WebSocketInterface } from '../common/interfaces';

const BACKLOG = 511;

// Common interface between official pg PoolClient and PGLite interface used for testing.
export type PGInterface = {
  query<T>(
    query: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params?: any[],
    options?: QueryOptions
  ): Promise<Results<T>>;
};

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

  constructor(config: ServerConfig) {
    this.#config = config;
    this.#server = (this.#config.createServer || http.createServer)(
      this.#onRequest
    );
    this.#serve = serveStatic('./dist');
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
    const headers = {
      'Access-Control-Allow-Origin': '*' /* @dev First, read about security */,
      'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
      'Access-Control-Max-Age': 2592000, // 30 days
      /** add other headers as per requirement */
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, headers);
      res.end();
      return;
    }
    if (!['POST', 'GET'].includes(req.method)) {
      res.writeHead(405, headers);
      res.end(`${req.method} is not allowed for the request.`);
      return;
    }
    console.log(`Request for ${req.url}`);
    if (req.url == '/register') {
      const form = formidable({});
      let fields;
      try {

        fields = (await form.parse(req))[0];
      } catch (err) {
        console.error(err);
        res.writeHead(err.httpCode || 400, { 'Content-Type': 'text/plain' });
        res.end(String(err));
        return;
      }
      console.log(fields.email, fields.password);
      res.writeHead(200, headers);
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
