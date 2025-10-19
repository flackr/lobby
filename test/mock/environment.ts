import { MockClock } from './clock';
import { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import type { EventListenerOptions, RTCPeerConnectionEvents, RTCPeerConnectionInterface, WebSocketEvents, WebSocketInterface } from '../../src/common/interfaces.ts';
import type { ServerCallback, ServerInterface, ServerResponseInterface, WebSocketServerInterface } from '../../src/server/server.ts';

/**
 * Simulates a set of clients which can be browsers or servers
 * which can communicate with each other.
 **/
export class MockEnvironment {
  #clock: MockClock = new MockClock();
  #clients: Map<string, MockClient> = new Map();
  #nextClientId: number = 1;

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
    options.address = options.address || `client-${this.#nextClientId++}`;
    const client = new MockClient(this, options);
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

class EventSource<T> {
  constructor() {}
  dispatchInternal<K extends keyof T>(type: K, event: T[K]): void {
    const listeners = this.#listeners[type];
    if (!listeners) return;
    for (const listener of listeners) {
      listener.callback.apply(this, [event]);
    }
    this.#listeners[type] = listeners.filter(listener => typeof listener.options == 'boolean' || !listener.options?.once);
  }
  addEventListener<K extends keyof T>(type: K, callback: (event: T[K]) => void | null, options?: boolean | EventListenerOptions | undefined): void {
    if (!this.#listeners[type]) {
      this.#listeners[type] = [];
    }
    this.#listeners[type].push({callback, options});
  }
  removeEventListener<K extends keyof T>(type: K, callback: (event: T[K]) => void | null): void {
    const listeners = this.#listeners[type];
    if (!listeners) return;
    const index = listeners.findIndex(listener => listener.callback == callback);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
    if (listeners.length === 0) {
      delete this.#listeners[type];
    }
  }
  #listeners: { [K in keyof T]?: ({callback: (event: T[K]) => void; options: EventListenerOptions}[]) } = {};
}

class MockRTCPeerConnectionIceEvent extends Event {
  candidate: RTCIceCandidate | null;
  constructor(type: string, eventInitDict: {candidate: RTCIceCandidate | null}) {
    super(type);
    this.candidate = eventInitDict.candidate;
  }
}

class MockICECandidate implements RTCIceCandidate {
  candidate: string;
  sdpMid: string | null = null;
  sdpMLineIndex: number | null = null;
  foundation: string | null = null;
  component: RTCIceComponent | null = null;
  priority: number | null = null;
  protocol: RTCIceProtocol | null = null;
  address: string;
  port: number = 0;
  type: RTCIceCandidateType | null = null;
  relatedAddress: string | null = null;
  relatedPort: number | null = null;
  tcpType: RTCIceTcpCandidateType | null = null;
  usernameFragment: string | null = null;

  constructor(address: string) {
    this.address = address;
    this.candidate = address;
  }

  toJSON(): RTCIceCandidateInit {
    return {
      candidate: this.candidate,
      sdpMid: this.sdpMid,
      sdpMLineIndex: this.sdpMLineIndex,
    };
  }
}

class MockClient {
  #environment: MockEnvironment;
  #options: ClientOptions = {
    address: '',
    latency: 0,
  };
  #latency: Map<MockClient, number> = new Map();
  #listeners: Map<number, MockServer> = new Map();
  #listeningWebRTCConnections: Map<string, RTCPeerConnectionInterface> = new Map();
  constructor(environment: MockEnvironment, options: Partial<ClientOptions>) {
    this.#environment = environment;
    this.#options = { ...this.#options, ...options };

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const client = this;
    class MockWebSocket extends EventSource<WebSocketEvents> implements MockWebSocketInterface {
      #other: MockWebSocketInterface | null = null;
      #otherClient: MockClient | null = null;
      #readyState: 0 | 1 | 2 | 3 = WebSocket.CONNECTING;

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
        this.#readyState = WebSocket.OPEN;
        this.#other = ws;
        this.#otherClient = otherClient;
      }

      get readyState(): 0 | 1 | 2 | 3 {
        return this.#readyState;
      }

      send(data: string | Buffer) : void {
        if (!this.#other || !this.#otherClient) {
          throw new Error('WebSocket not connected');
        }
        const other = this.#other;
        client.#environment.clock.api().setTimeout(() => {
          if (other.readyState !== WebSocket.OPEN)
            return;
          (other as MockWebSocket).dispatchInternal('message', new MessageEvent('message', {data}));
        }, client.latencyTo(this.#otherClient));
      }

      close(): void {
        if (!this.#other || !this.#otherClient)
          return;
        const other = this.#other;
        const otherClient = this.#otherClient;
        if (this.#other.readyState == WebSocket.CONNECTING || this.#other.readyState == WebSocket.OPEN) {
          // If the other side is not yet closing, we need to notify and wait.
          this.#readyState = WebSocket.CLOSING;
        } else {
          // If the other side is already closing or closed, we can just close immediately.
          this.#other = null;
          this.#otherClient = null;
          this.#readyState = WebSocket.CLOSED;
          this.dispatchInternal('close', new Event('close'));
        }

        // Notify the other side after latency.
        if (other.readyState != WebSocket.CLOSED) {
          client.#environment.clock.api().setTimeout(() => {
            if (other.readyState == WebSocket.CLOSED)
              return;
            other.close();
          }, client.latencyTo(otherClient));
        }
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
            listener(socket);
          }
          socket.dispatchInternal('open', new Event('open'));
          client.#environment.clock.api().setTimeout(() => {
            req._setOther(socket, client);
            (req as MockWebSocket).dispatchInternal('open', new Event('open'));
          }, client.latencyTo(otherClient));
        }, otherClient.latencyTo(client));
      }
    };
    let offerId = 0;
    class MockRTCPeerConnection extends EventSource<RTCPeerConnectionEvents> implements RTCPeerConnectionInterface {
      #connectionState: 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed' = 'new';
      #localDescription: RTCSessionDescriptionInit | null = null;
      #remoteDescription: RTCSessionDescriptionInit | null = null;
      #remoteIceCandidates: RTCIceCandidateInit[] = [];
      #remoteConnection: MockRTCPeerConnection | null = null;

      constructor() {
        super();
      }
      get localDescription() {
        return this.#localDescription;
      }
      get remoteDescription() {
        return this.#remoteDescription;
      }
      setLocalDescription(description: RTCSessionDescriptionInit | null) : Promise<void> {
        if (this.#localDescription && this.#localDescription.sdp) {
          client.#listeningWebRTCConnections.delete(this.#localDescription.sdp);
        }
        this.#localDescription = description;
        if (description && description.sdp) {
          client.#listeningWebRTCConnections.set(description.sdp, this);
        }
        this.#maybeConnect();
        // Generate ice candidates
        this.dispatchInternal('icecandidate', new MockRTCPeerConnectionIceEvent('icecandidate', {candidate: new MockICECandidate(client.#options.address)}));
        this.dispatchInternal('icecandidate', new MockRTCPeerConnectionIceEvent('icecandidate', {candidate: null}));
        return Promise.resolve();
      }
      setRemoteDescription(description: RTCSessionDescriptionInit | null) : Promise<void> {
        this.#remoteDescription = description;
        this.#maybeConnect();
        return Promise.resolve();
      }
      createOffer() : Promise<RTCSessionDescriptionInit> {
        return Promise.resolve({type: 'offer', sdp: `${client.#options.address}-offer-${offerId++}`});
      }
      createAnswer() : Promise<RTCSessionDescriptionInit> {
        if (!this.#remoteDescription) {
          throw new Error('No remote description set');
        }
        return Promise.resolve({type: 'answer', sdp: this.#remoteDescription.sdp});
      }
      createDataChannel(label: string, dataChannelDict?: RTCDataChannelInit) : RTCDataChannelInterface {
        throw new Error('Method not implemented.');
      }
      addIceCandidate(candidate: RTCIceCandidateInit) : Promise<void> {
        this.#remoteIceCandidates.push(candidate);
        this.#maybeConnect();
        return Promise.resolve();
      }
      get connectionState(): 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed' {
        return this.#connectionState;
      }
      connectInternal(remote: MockRTCPeerConnection) {
        this.#remoteConnection = remote;
        this.#connectionState = 'connected';
      }
      close(): void {
        const remote = this.#remoteConnection;
        if (!remote) {
          return;
        }
        this.#remoteConnection = null;
        // TODO: Delay close by latency.
        remote.close();
        this.#connectionState = 'closed';
        this.dispatchInternal('connectionstatechange', new Event('connectionstatechange'));
      }
      // WebRTC magically connects once both sides have set their descriptions and exchanged ice candidates.
      #maybeConnect() {
        if (!this.#localDescription || !this.#localDescription.sdp || !this.#remoteDescription || !this.#remoteDescription.sdp) {
          return;
        }
        // Check for a reachable client based on ice candidates.
        for (const candidate of this.#remoteIceCandidates) {
          if (candidate.candidate) {
            const remoteClient = client.#environment.getClient(candidate.candidate);
            if (!remoteClient) continue;
            const remoteConnection = remoteClient.#listeningWebRTCConnections.get(this.#localDescription.sdp) as MockRTCPeerConnection | undefined;
            if (!remoteConnection) continue;
            // Check that the offers and answers match.
            if (JSON.stringify(remoteConnection.remoteDescription) == JSON.stringify(this.localDescription)) {
              // Connected!
              // TODO: Delay connection by latency.
              this.connectInternal(remoteConnection);
              remoteConnection.connectInternal(this);
              this.dispatchInternal('connectionstatechange', new Event('connectionstatechange'));
              remoteConnection.dispatchInternal('connectionstatechange', new Event('connectionstatechange'));
              return;
            }
          }
        }
      }
    };
    this.WebSocketServer = MockWebSocketServer;
    this.WebSocket = MockWebSocket as new (address: string) => WebSocketInterface;
    this.RTCPeerConnection = MockRTCPeerConnection;
  }

  listen(port: number, server: MockServer) {
    this.#listeners.set(port, server);
  }

  unlisten(port: number, server: MockServer) {
    if (this.#listeners.get(port) == server)
      this.#listeners.delete(port);
  }

  connect(port: number): MockServer {
    const server = this.#listeners.get(port);
    if (!server)
      throw new Error(`No server listening on port ${port} for client ${this.#options.address}`);
    return server;
  }

  createServer = (callback: ServerCallback) => {
    return new MockServer(this, callback);
  }

  WebSocketServer: new (options: { server: MockServer }) => WebSocketServerInterface;
  WebSocket: new (address: string) => WebSocketInterface;
  RTCPeerConnection: new () => RTCPeerConnectionInterface;

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
