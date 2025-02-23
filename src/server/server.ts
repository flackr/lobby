import fs from 'node:fs';
import http from 'node:http';
import ws from 'ws';
import type { Results, QueryOptions } from '@electric-sql/pglite';
import serveStatic from 'serve-static';
import finalhandler from 'finalhandler';

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

interface ServerConfig {
  db: PGInterface;
  transport: TransportInterface;
  port: number;
  hostname?: string;
  basePath?: string;
  createServer?: typeof http.createServer;
  WebSocketServer?: typeof ws.Server;
}

export type ServerAddress = string;

const DEFAULT_PORT = 8000;
export class Server {
  #config: ServerConfig;
  #server: http.Server;
  #serve: serveStatic.RequestHandler<http.ServerResponse<http.IncomingMessage>>;

  constructor(config: ServerConfig) {
    this.#config = config;
    this.#server = (this.#config.createServer || http.createServer)(
      this.#onRequest
    );
    this.#serve = serveStatic('./public');
  }

  listen(): Promise<ServerAddress> {
    return new Promise((resolve) => {
      const port = this.#config.port || DEFAULT_PORT;
      const host = this.#config.hostname || '127.0.0.1';
      this.#server.listen(port, host, () => {
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

  #onRequest = async (req: http.IncomingMessage, res: http.ServerResponse) => {
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
      res.writeHead(200, headers);
      res.end();
      console.log(req);
    } else if (['/lobby.min.js', '/lobby.min.js.map'].includes(req.url)) {
      const filePath = `dist${req.url}`;
      fs.readFile(
        filePath,
        { encoding: 'utf8' },
        (err: Error | null, data?: string) => {
          if (err != null) {
            // Should we log an error? Maybe once?
            res.writeHead(404, headers);
            res.end();
            return;
          }
          const contentType = filePath.endsWith('.js')
            ? 'text/javascript'
            : 'application/json';
          res.writeHead(200, headers);
          res.end(data || '', 'utf8');
        }
      );
    } else {
      // If the request doesn't match any dynamic URL,
      // serve the public folder.
      this.#serve(req, res, finalhandler(req, res));
    }
  };
}
