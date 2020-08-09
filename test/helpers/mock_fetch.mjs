const MOCK_METHODS = ['fetch'];

class MockResponse {
  constructor(data) {
    this._data = data;
  }

  get status() {
    return this._data.status;
  }

  json() {
    return new Promise((accept, reject) => {
      let data = null;
      let error = null;
      try {
        data = JSON.parse(this._data.body);
      } catch(e) {
        error = e;
      }
      if (error)
        reject(error);
      else
        accept(data);
    });
  }
};

class Network {
  constructor(global) {
    this._global = global || globalThis;
    this._servers = [];
  }

  install(server) {
    this._servers.push(server);
  }

  fetch = async (resource, init) => {
    for (let server of this._servers) {
      let response = await server(resource, init);
      if (response)
        return new MockResponse(response);
    }
    throw new Error('No server handled request: ' + resource);
  };

  connection(latency) {
    return new Connection(this, latency);
  }
};

class Connection {
  constructor(network, latency) {
    this._network = network;
    // By default assume symmetric latency
    this._upstream = latency / 2;
    this._downstream = latency / 2;
  }

  setLatency(upstream, downstream) {
    this._upstream = upstream;
    this._downstream = downstream;
  }

  fetch = (resource, init) => {
    const global = this._network._global;
    const network = this._network;
    const upstream = this._upstream;
    const downstream = this._downstream;
    return new Promise((accept, reject) => {
      global.setTimeout(async () => {
        let response = await network.fetch(resource, init);
        global.setTimeout(() => {
          accept(response);
        }, downstream);
      }, upstream);
    });
  }
};

export default Network;