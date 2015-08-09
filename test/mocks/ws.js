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

function WebSocketClientMock(address, origin) {
  this.addEventTypes(['open', 'message', 'close']);
  this.ws_ = null;
  this.readyState = 0;
  this.address = address;
  this.origin_ = origin;
  // Need to give the caller a chance to attach listeners.
  setTimeout(listener.onConnection.bind(listener, this), 0);
}

WebSocketClientMock.prototype = lobby.util.extend(lobby.util.EventSource.prototype, {
  send: function(msg) {
    this.ws_.dispatch('message', msg);
  },
  onConnection: function(ws) {
    this.ws_ = ws;
    this.readyState = 1;
    var self = this;
    setTimeout(function() {
      self.dispatchEvent('open');
    }, 0);
  },
  close: function() {
    if (this.readyState == 3)
      return;
    this.ws_.readyState = 2;
    this.ws_.dispatch('close');
    this.ws_.readyState = 3;
    this.ws_.ws = null;
    this.ws_ = null;
    this.readyState = 3;
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
      if (obj.server) {
        this.server = obj.server;
        this.server.webSocketServer = this;
        this.port = this.server.port;
      } else if (obj.port) {
        this.port = obj.port;
        listener = this;
        listeningPorts[this.port] = this;
      }
    }
  }
  
  WebSocketServerMock.prototype = lobby.util.extend(NodeJSEventSource.prototype, {
    attach: function(httpServer) {
      httpServer.onConnection = this.onConnection.bind(this);
    },
    onConnection: function(ws) {
      var connection = new WebSocketServerClientMock(ws);
      this.dispatch('connection', connection);
    },
    
  });
  
  function WebSocketServerClientMock(ws) {
    this.ws = ws;
    this.upgradeReq = {
      url: ws.address.match(/^(?:[^/]*\/){2}[^/]*(.*)/)[1],
      headers: {
        origin: ws.origin_,
      },
    };
    this.readyState = 1;
    this.ws.onConnection(this);
  }
  
  WebSocketServerClientMock.prototype = lobby.util.extend(NodeJSEventSource.prototype, {
    send: function(msg) {
      this.ws.dispatchEvent('message', {data: msg});
    },
    close: function() {
      if (this.readyState == 3)
        return;
      this.ws.readyState = 2;
      this.ws.dispatchEvent('close');
      this.ws.readyState = 3;
      this.ws.ws = undefined;
      this.ws = undefined;
      this.readyState = 3;
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
  function MockHttpServer(handler) {
    this.handler_ = handler;
    this.port = undefined;
  }
  
  MockHttpServer.prototype.listen = function(port) {
    listener = this;
    listeningPorts[port] = this;
    this.port = port;
    return this;
  }
  
  MockHttpServer.prototype.onConnection = function(client) {
    if (client instanceof WebSocketClientMock && this.webSocketServer) {
      this.webSocketServer.onConnection(client);
      return;
    }
    throw new Error('Received unhandled connection from client');
  }
  
  function createMockServer(handler) {
    return new MockHttpServer(handler);
  }
  
  return {
    'createServer': createMockServer,
  }
})();

packages['serve-static'] = (function() {

  return function() {
    console.log('serve-static not actually implemented');
  };
})();
