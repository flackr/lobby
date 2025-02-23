import { request } from 'http';
import { MockClock } from './clock';

/**
 * Simulates a set of clients which can be browsers or servers
 * which can communicate with each other.
 **/
export class MockEnvironment {
  #clock: MockClock = new MockClock();

  constructor() {}

  get clock(): MockClock {
    return this.#clock;
  }

  createClient(options: Partial<ClientOptions>): MockClient {
    return new MockClient(options);
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

class MockClient {
  #options: ClientOptions = {
    address: '',
    latency: 0,
  };
  constructor(options: Partial<ClientOptions>) {
    this.#options = { ...this.#options, ...options };
  }
}
