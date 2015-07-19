<!-- Mock out websocket stuff. -->

// TODO(flackr): Use listeningPorts to bind the mock server to the correct fake local port.
var listener = null;
var listeningPorts = {};

function NodeJSEventSource() {
}

NodeJSEventSource.prototype = {
  on: function(type, fn) {
    this.on_ = this.on_ || {};
    this.on_[type] = fn;
  },
  dispatch: function(type) {
    if (this.on_[type])
      this.on_[type].apply(/* this */ null, /* args */ Array.prototype.slice.call(arguments, 1));
    else
      console.log('Warning, no handler for event type ' + type);
  }
}

function WebSocketClientMock(address) {
  this.addEventTypes(['open', 'message', 'close']);
  this.ws_ = null;
  this.address = address;
  // Need to give the caller a chance to attach listeners.
  setTimeout(listener.onConnection.bind(listener, this), 0);
}

WebSocketClientMock.prototype = lobby.util.extend(lobby.util.EventSource.prototype, {
  send: function(msg) {
    this.ws_.dispatch('message', msg);
  },
  onConnection: function(ws) {
    this.ws_ = ws;
    this.dispatchEvent('open');
  },
  close: function() {
    this.ws_.dispatch('close');
    this.ws_ = null;
  },
});

window.originalWebSocket = window.WebSocket;
function installWebSocketMock() {
  window.WebSocket = WebSocketClientMock;
  window.WebSocket.prototype = WebSocketClientMock.prototype;
}

function uninstallWebSocketMock() {
  window.WebSocket = window.originalWebSocket;
  window.WebSocket.prototype = window.originalWebSocket.prototype;
}

packages['ws'] = (function() {
  
  function WebSocketServerMock(obj) {
    if (obj) {
      this.port = obj.port;
      listener = this;
      listeningPorts[this.port] = this;
    }
  }
  
  WebSocketServerMock.prototype = lobby.util.extend(NodeJSEventSource.prototype, {
    attach: function(httpServer) {
      httpServer.onConnection = this.onConnection.bind(this);
    },
    onConnection: function(ws) {
      this.dispatch('connection', new WebSocketServerClientMock(ws));
    },
    
  });
  
  function WebSocketServerClientMock(ws) {
    this.ws = ws;
    setTimeout(this.ws.onConnection.bind(this.ws, this), 0);
  }
  
  WebSocketServerClientMock.prototype = lobby.util.extend(NodeJSEventSource.prototype, {
    send: function(msg) {
      this.ws.dispatchEvent('message', {data: msg});
    },
    close: function() {
      this.ws.dispatchEvent('close');
    }
  });

  function attachToHttpServer(server) {
    console.log('Attempted to attatch to WebSocket Server');
    var mockWsServer = new WebSocketServerMock();
    mockWsServer.attach(server);
    return mockWsServer;
  }
  
  return {
    'Server': WebSocketServerMock,
    'attach': attachToHttpServer,
  };
})();

packages['http'] = (function() {
  function MockHttpServer() {
    this.port = undefined;
  }
  
  MockHttpServer.prototype.listen = function(port) {
    listener = this;
    listeningPorts[port] = this;
    this.port = port;
    return this;
  }
  
  MockHttpServer.prototype.onConnection = function(client) {
    throw new Error('Received unhandled connection from client');
  }
  
  function createMockServer() {
    return new MockHttpServer();
  }
  
  return {
    'createServer': createMockServer,
  }
})