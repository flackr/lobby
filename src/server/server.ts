import http from 'node:http';
import ws from 'ws';
import serveStatic from 'serve-static';
import finalhandler from 'finalhandler';
import formidable from 'formidable';
import { defaultClockAPI } from '../common/interfaces.ts';
import type { WebSocketInterface, ClockAPI } from '../common/interfaces.ts';
import type { PGInterface } from './types.ts';

import { AuthenticationHandler, type RegistrationData, type VerificationData }  from './user.ts';
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
  emailFrom: string;
  safeNames: boolean;
  limits: LimitsConfig;
  cleanupDelays: CleanupConfig;
  hostname?: string;
  basePath?: string;
  createServer?: createServerInterface;
  WebSocketServer?: typeof ws.Server;
}

const requiredConfig = ['db', 'transport', 'port', 'emailFrom'];
const defaultConfig: Partial<ServerConfig> = {
  clock: defaultClockAPI,
  safeNames: false,
  limits: {
    verificationCodeMinutes: 30,
    maxVerificationEmailsPerHour: 100,
    maxVerificationEmailsPerIPPerHour: 40,
    maxCreatedUsersPerIPPerHour: 20,
  },
  cleanupDelays: {
    unverifiedUserDays: 7,
    inactiveSessionDays: 30,
    inactiveUserDays: 365,
    inactiveRoomDays: 60,
  }
};

export interface LimitsConfig {
  verificationCodeMinutes: number;
  maxVerificationEmailsPerHour: number;
  maxVerificationEmailsPerIPPerHour: number;
  maxCreatedUsersPerIPPerHour: number;
}

interface CleanupConfig {
  unverifiedUserDays: number;
  inactiveSessionDays: number;
  inactiveUserDays: number;
  inactiveRoomDays: number;
}

export type ServerAddress = string;

const DEFAULT_PORT = 8000;

function requestIp(req: http.IncomingMessage): string {
  // TODO: Maybe use first address from x-forwarded-for header?
  return (req.headers['x-real-ip'] as string) || req.socket.remoteAddress;
}
export class Server {
  #config: ServerConfig;
  #server: ServerInterface;
  #serve: serveStatic.RequestHandler<http.ServerResponse<http.IncomingMessage>>;
  #authHandler: AuthenticationHandler;

  constructor(config: Partial<ServerConfig>) {
    for (const key of requiredConfig) {
      if (config[key] === undefined) {
        throw new Error(`Missing required server config: ${key}`);
      }
    }
    this.#config = {
      ...defaultConfig,
      ...config,
      limits: {...defaultConfig.limits, ...config.limits},
      cleanupDelays: {...defaultConfig.cleanupDelays, ...config.cleanupDelays}} as ServerConfig;
    this.#server = (this.#config.createServer || http.createServer)(
      this.#onRequest
    );
    this.#serve = serveStatic('./dist');
    this.#authHandler = new AuthenticationHandler({
      clock: this.#config.clock,
      db: this.#config.db,
      transport: this.#config.transport,
      emailFrom: this.#config.emailFrom,
      limits: this.#config.limits,
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
    if (req.url == '/api/register' && req.method == 'POST') {
      const form = formidable({});
      let data : RegistrationData = {
        alias: '',
        username: '',
        email: '',
        password: '',
      }
      try {
        const fields = (await form.parse(req))[0];
        let optfield = (name: string) => {
          if (!fields[name])
            return null;
          return fields[name][0];
        }
        data = {username: optfield('username'), password: optfield('password'), email: optfield('email'), alias: fields.alias[0]};
      } catch (err) {
        console.error(err);
        res.writeHead(err.httpCode || 400, { ...headers, 'Content-Type': 'text/plain' });
        res.end(String(err));
        return;
      }
      const result = await this.#authHandler.registerUser(requestIp(req), data);
      if (result.sessionId) {
        headers['Set-Cookie'] = `sessionid=${result.sessionId}; HttpOnly; Secure; Path=/; SameSite=Strict`;
      }
      res.writeHead(result.resultCode, { ...headers, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: result.message }));
      res.end();
    } if (req.url == '/api/login' && req.method == 'POST') {
      const form = formidable({});
      let data : {username: string; password: string;} = {
        username: '',
        password: '',
      }
      try {
        const fields = (await form.parse(req))[0];
        data = {username: fields.username[0], password: fields.password[0]};
      } catch (err) {
        console.error(err);
        res.writeHead(err.httpCode || 400, { ...headers, 'Content-Type': 'text/plain' });
        res.end(String(err));
        return;
      }
      const result = await this.#authHandler.loginUser(requestIp(req), data);
      if (result.sessionId) {
        headers['Set-Cookie'] = `sessionid=${result.sessionId}; HttpOnly; Secure; Path=/; SameSite=Strict`;
      }
      res.writeHead(result.resultCode, { ...headers, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: result.message }));
      res.end();
    } else if (req.url.startsWith('/api/')) {
      // These remaining API endpoints require that the user is logged in.
      const rawCookie = req.headers.cookie || "";
      const cookies = Object.fromEntries(
          rawCookie
            .split(";")
            .map(c => c.trim().split("="))
      );
      const session = await this.#authHandler.getSession(requestIp(req), cookies.sessionid);
      if (!session) {
        res.writeHead(401, { ...headers,
          'Content-Type': 'text/plain',
        });
        res.end('Unauthorized: No valid session');
        return;
      }
      if (req.url == '/api/verify' && req.method == 'POST') {
        const form = formidable({});
        let data : VerificationData = {
          code: '',
          email: '',
        }
        try {
          const fields = (await form.parse(req))[0];
          data = {code: fields.code[0], email: fields.email[0]};
        } catch (err) {
          console.error(err);
          res.writeHead(err.httpCode || 400, { ...headers, 'Content-Type': 'text/plain' });
          res.end(String(err));
          return;
        }
        const success = await this.#authHandler.verifyEmail(session, data);
        res.writeHead(200, { ...headers,
          'Content-Type': 'application/json',
        });
        res.end(JSON.stringify({
          result: success ? 'ok' : 'failed'
        }));
        return;
      } else if (req.url == '/api/userinfo') {
        const userInfo = await this.#authHandler.getUserInfo(session);
        res.writeHead(200, { ...headers,
          'Content-Type': 'application/json',
        });
        res.end(JSON.stringify(userInfo));
        return;
      } else if (req.url == '/api/logout' && req.method == 'POST') {
        // Check if a session id was provided to log out instead of the current session.
        const form = formidable({});
        let logoutSessionId: number = session.id;
        try {
          const fields = (await form.parse(req))[0];
          if (fields.sessionid) {
            logoutSessionId = parseInt(fields.sessionid[0]);
          }
        } catch (err) {
          console.error(err);
          res.writeHead(err.httpCode || 400, { ...headers, 'Content-Type': 'text/plain' });
          res.end(String(err));
          return;
        }
        await this.#authHandler.logoutSession(session, logoutSessionId);
        res.writeHead(200, { ...headers,
          'Content-Type': 'application/json',
        });
        res.end(JSON.stringify({ result: 'ok' }));
        return;
      }
      res.writeHead(404, headers);
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
