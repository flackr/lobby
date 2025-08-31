import { MockClock } from './clock';
import { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import type { ServerCallback, ServerInterface, ServerResponseInterface, WebSocketInterface, WebSocketServerInterface } from '../../src/server/server.ts';

/**
 * Simulates a set of clients which can be browsers or servers
 * which can communicate with each other.
 **/
export class MockEnvironment {
  #clock: MockClock = new MockClock();
  #clients: Map<string, MockClient> = new Map();

  constructor() {
    this.#clock.autoAdvance = true;
  }

  get clock(): MockClock {
    return this.#clock;
  }

  getClient(host: string): MockClient | undefined {
    return this.#clients.get(host);
  }

  createClient(options: Partial<ClientOptions> = {}): MockClient {
    const client = new MockClient(this, options);
    if (options.address)
      this.#clients.set(options.address, client)
    return client;
  }
}

type ClientOptions = {
  address: string;

  // Time taken anytime data is sent to or from this client.
  // Times between particular clients can be overridden by
  // setting the per-client latency, this is just an easy
  // way to set up reasonable values.
  latency: number;
};

type MockWebSocketServerInterface = WebSocketServerInterface & {
  _connect(req: MockWebSocketInterface, otherClient: MockClient): void;
}

type MockWebSocketInterface = WebSocketInterface & {
  _setOther(ws: MockWebSocketInterface, otherClient: MockClient): void;
}

class MockResponse implements ServerResponseInterface {
  statusCode: number = 200;
  headers: {[key: string]: string | number};
  bodyChunks: Buffer<ArrayBuffer>[] = [];
  resolve: (response: Response) => void;

  constructor(resolve: (response: Response) => void) {
    this.resolve = resolve;
  }
  writeHead(statusCode: number, headers: {[key: string]: string | number}) {
    this.statusCode = statusCode;
    this.headers = headers;
  }
  write(chunk: any, encoding?: BufferEncoding, callback?: (error?: Error | null | undefined) => void) {
    this.bodyChunks.push(Buffer.from(chunk, encoding));
    if (callback) { callback(); }
    return true;
  };
  end(chunk?: any, encoding?: BufferEncoding, callback?: () => void) {
    if (chunk) {
      this.write(chunk, encoding);
    }
    if (callback) { callback(); }

    // Convert to fetch Response
    const responseBodyBuffer = Buffer.concat(this.bodyChunks);

    const fetchResponse = new Response(responseBodyBuffer, {
        status: this.statusCode,
        headers: this.headers as HeadersInit,
        statusText: ""
    });

    this.resolve(fetchResponse);
  };
}

class MockClient {
  #environment: MockEnvironment;
  #options: ClientOptions = {
    address: '',
    latency: 0,
  };
  #latency: Map<MockClient, number> = new Map();
  #listeners: Map<number, any> = new Map();
  constructor(environment: MockEnvironment, options: Partial<ClientOptions>) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const client = this;
    class MockWebSocket extends EventTarget implements MockWebSocketInterface {
      #other: MockWebSocketInterface | null = null;
      #otherClient: MockClient | null = null;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(input?: string | URL, protocols?: string | string[]) {
        super();
        let url: URL | null = null;
        if (typeof input == 'string') {
          url = new URL(input);
        } else if (input instanceof URL) {
          url = input;
        } else {
          // Internal connected construction configured by setOther.
          return;
        }
        console.log(`WebSocket constructed to ${url}`);

        const serverClient = client.#environment.getClient(url.hostname);
        if (!serverClient) {
          throw new Error('No server for hostname ' + url.hostname);
        }
        const mockServer = serverClient.connect(parseInt(url.port || '80'));
        if (!mockServer) {
          throw new Error(`No server for hostname ${url.hostname}, port ${url.port}.`);
        }
        mockServer.connectSocket(this as MockWebSocketInterface, client);
      }

      _setOther(ws: MockWebSocketInterface, otherClient: MockClient): void {
        this.#other = ws;
        this.#otherClient = otherClient;
      }

      send(data: string | Buffer) : void {
        if (!this.#other || !this.#otherClient) {
          throw new Error('WebSocket not connected');
        }
        const other = this.#other;
        client.#environment.clock.api().setTimeout(() => {
          other.dispatchEvent(new MessageEvent('message', {data}));
        }, client.latencyTo(this.#otherClient));
      }

      close(): void {
        if (!this.#other)
          return;
        // TODO: Delay by appropriate latency.
        const other = this.#other;
        this.#other = null;
        other.close();
        this.dispatchEvent(new Event('close'));
      }
    }
    class MockWebSocketServer implements MockWebSocketServerInterface {
      #listeners: {
        connection: ((websocket: WebSocketInterface) => void)[],
        error: ((...args: unknown[]) => void)[],
        close: (() => void)[]
      } = {connection: [], error: [], close: []};
      constructor(wssOptions: { server: MockServer }) {
        wssOptions.server.setWebSocketServer(this);
      }

      on(event, listener): void {
        console.log(`Added listener ${listener} for ${event}`);
        this.#listeners[event].push(listener);
      }

      _connect(req: MockWebSocketInterface, otherClient: MockClient) {
        client.#environment.clock.api().setTimeout(() => {
          const socket = new MockWebSocket();
          socket._setOther(req, otherClient);
          for (const listener of this.#listeners.connection) {
            listener(socket as WebSocketInterface);
          }
          socket.dispatchEvent(new Event('open'));
          client.#environment.clock.api().setTimeout(() => {
            req._setOther(socket as MockWebSocketInterface, client);
            req.dispatchEvent(new Event('open'));
          }, client.latencyTo(otherClient));
        }, otherClient.latencyTo(client));
      }
    };
    this.WebSocketServer = MockWebSocketServer;
    this.WebSocket = MockWebSocket as new (address: string) => WebSocketInterface;

    this.#environment = environment;
    this.#options = { ...this.#options, ...options };
  }

  listen(port: number, server: MockServer) {
    this.#listeners.set(port, server);
  }

  unlisten(port: number, server: MockServer) {
    if (this.#listeners.get(port) == server)
      this.#listeners.delete(port);
  }

  connect(port: number): MockServer {
    return this.#listeners.get(port);
  }

  createServer = (callback: ServerCallback) => {
    return new MockServer(this, callback);
  }

  WebSocketServer: new (options: { server: MockServer }) => WebSocketServerInterface;
  WebSocket: new (address: string) => WebSocketInterface;

  latencyTo(client: MockClient): number {
    return this.#latency.get(client) ||
        // Each direction assumes half of the client's latency to the internet,
        // and half to the other client.
        (this.#options.latency * 0.5 + client.#options.latency * 0.5);
  }

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url: URL;
    let method = 'GET';
    const headers: Headers = new Headers();
    let body: BodyInit | null = null;

    if (input instanceof URL || typeof input === 'string') {
        url = new URL(input.toString());
    } else if (input instanceof Request) {
        url = new URL(input.url);
        method = input.method;
        input.headers.forEach((value, key) => {
            headers.set(key, value);
        });
        body = await input.blob(); // Or input.text(), input.arrayBuffer() depending on needs
    } else {
        throw new TypeError('Invalid input type for fetch');
    }

    if (init) {
        if (init.method) {
            method = init.method;
        }
        if (init.headers) {
            const initHeaders = new Headers(init.headers);
            initHeaders.forEach((value, key) => {
                headers.set(key, value);
            });
        }
        if (init.body) {
            body = init.body;
        }
    }

    const mockReq = new Readable() as IncomingMessage;
    mockReq.method = method;
    mockReq.url = url.pathname + url.search; // Just path and query, not full URL
    mockReq.headers = {};
    headers.forEach((value, key) => {
        mockReq.headers[key] = value;
    });

    // Simulate request body if present
    if (body !== null) {
      if (typeof body === 'string') {
          mockReq.push(body);
      } else if (body instanceof Buffer) {
          mockReq.push(body);
      } else if (body instanceof ArrayBuffer) {
          mockReq.push(Buffer.from(body));
      } else if (body instanceof Blob) {
          const arrayBuffer = await body.arrayBuffer();
          mockReq.push(Buffer.from(arrayBuffer));
      } else if (body instanceof ReadableStream) {
          const reader = body.getReader();
          while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              mockReq.push(value);
          }
      } else if (body instanceof FormData) {
       const response = new Response(body);
       const formData = await response.text();
       mockReq.headers['content-type'] = response.headers.get('Content-Type') || '';
       mockReq.headers['content-length'] = formData.length.toString();
       mockReq.push(formData);
      }
    }
    mockReq.push(null);
    const serverClient = this.#environment.getClient(url.hostname);
    if (!serverClient) {
      throw new Error('No server for hostname ' + url.hostname);
    }
    const mockServer = serverClient.connect(parseInt(url.port || '80'));
    if (!mockServer) {
      throw new Error(`No server for hostname ${url.hostname}, port ${url.port}.`);
    }
    // Calling the requestHandler should invoke mockRes.end which will resolve the promise.
    return new Promise((resolve) => {
      const mockRes = new MockResponse((response) => {
        this.#environment.clock.api().setTimeout(() => {
          resolve(response);
        }, serverClient.latencyTo(this));
      });
      this.#environment.clock.api().setTimeout(() => {
        mockServer.requestHandler(mockReq, mockRes);
      }, this.latencyTo(serverClient));
    });
  }
};

class MockServer implements ServerInterface {
  #client: MockClient;
  #port: number | null = null;
  #callback: ServerCallback;
  #wss: MockWebSocketServerInterface | null = null;

  constructor(client: MockClient, callback: ServerCallback) {
    this.#client = client;
    this.#callback = callback;
  }

  setWebSocketServer(wss: MockWebSocketServerInterface) {
    this.#wss = wss;
  }

  close(callback: (value?: Error) => void) {
    if (this.#port !== null)
      this.#client.unlisten(this.#port, this);
    this.#port = null;
    callback(undefined);
  }

  listen(port: number, _hostname: string, _backlog: number, callback: (value?: unknown) => void) {
    this.#port = port;
    this.#client.listen(this.#port, this);
    callback();
  }

  requestHandler(req: IncomingMessage, res: ServerResponseInterface) {
    this.#callback(req, res);
  }

  connectSocket(req: MockWebSocketInterface, client: MockClient) {
    if (!this.#wss) {
      throw new Error(`Server ${this} has no WebSocketServer associated`);
    }
    this.#wss._connect(req, client);
  }
};
