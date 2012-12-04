/**
 * An API for hosting a game on the lobby server.
 */

lobby.serverCapable = function() {
  return chrome.socket && chrome.socket.listen;
};

lobby.Host = function() {

  var constructWebsocketResponseKey = function(clientKey) {
    var toArray = function(str) {
      var a = [];
      for (var i = 0; i < str.length; i++) {
        a.push(str.charCodeAt(i));
      }
      return a;
    }
    var toString = function(a) {
      var str = '';
      for (var i = 0; i < a.length; i++) {
        str += String.fromCharCode(a[i]);
      }
      return str;
    }
    // Magic string used for websocket connection key hashing:
    // http://en.wikipedia.org/wiki/WebSocket
    var magicStr = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    // clientKey is base64 encoded key.
    clientKey += magicStr;
    var sha1 = new lobby.Sha1();
    sha1.reset();
    sha1.update(toArray(clientKey));
    return btoa(toString(sha1.digest()));
  };

  var ArrayBufferToString = function(buffer) {
    return String.fromCharCode.apply(null, new Uint8Array(buffer));
  };

  var StringToArrayBuffer = function(string) {
    var buffer = new ArrayBuffer(string.length);
    var bufferView = new Uint8Array(buffer);
    for (var i = 0; i < string.length; i++) {
      bufferView[i] = string.charCodeAt(i);
    }
    return buffer;
  };

  var Host = function(lobbyUrl) {
    lobby.util.EventSource.apply(this);

    this.clients = [];
    this.ws = new WebSocket(lobbyUrl, ['game-protocol']);
    this.ws.onopen = this.registerServer.bind(this);
    this.ws.onclose = this.connectionLost.bind(this);
    this.ws.onmessage = this.lobbyMessageReceived.bind(this);
    this.ws.onerror = this.onError.bind(this);
    this.gameInfo = {
      gameId: 'default',
      name: 'Default',
      description: 'This is the default game description',
      status: 'awaiting_players',
      accepting: true,
      observable: true,
      password: '',
      port: 9998,
    };
    if (lobby.serverCapable())
      this.listen(this.gameInfo.port);
  }

  Host.prototype = lobby.util.extend(lobby.util.EventSource.prototype, {

    listen: function(port) {
      var self = this;
      chrome.socket.create('tcp', {}, function(socketInfo) {
        self.socketId_ = socketInfo.socketId;
        chrome.socket.listen(self.socketId_, '0.0.0.0', port, function(result) {
          if (result < 0) {
            console.log('Failed to listen on port '+port);
            return;
          }
          self.acceptConnection(port);
        });
      });
    },

    acceptConnection: function(port) {
      var self = this;
      chrome.socket.accept(self.socketId_, function(acceptInfo) {
        var clientIndex = self.clients.length;
        console.log('Client connected on index '+clientIndex);
        self.clients[clientIndex] = {socketId: acceptInfo.socketId, state: 'connecting', data: ''};
        self.dispatchEvent('connection', clientIndex);
        self.listenOnSocket(clientIndex);
        self.acceptConnection(port);
      });
    },

    // Receive messages from the client identified by |clientIndex|.
    listenOnSocket: function(clientIndex) {
      var self = this;
      chrome.socket.read(this.clients[clientIndex].socketId, function(readInfo) {
        if (readInfo.resultCode <= 0) {
          self.closeClientConnection(self.clients[clientIndex].socketId);
          return;
        }
        if (!readInfo.data.byteLength)
          return;
        self.clients[clientIndex].data += ArrayBufferToString(readInfo.data).replace(/\r\n/g,'\n');
        var messages = self.clients[clientIndex].data.split('\n\n');
        for (var i = 0; i < messages.length - 1; i++)
          if (!self.handleClientMessage(clientIndex, messages[i]))
            return;
        self.clients[clientIndex].data = messages[messages.length - 1];
        self.listenOnSocket(clientIndex);
      });
    },

    handleClientMessage: function(clientIndex, message) {
      if (this.clients[clientIndex].state == 'connecting') {
        console.log('Received:\n' + message);
        message = message.split('\n');
        var messageDetails = {};
        for (var i = 0; i < message.length; i++) {
          var details = message[i].split(':');
          if (details.length == 2)
            messageDetails[details[0].trim()] = details[1].trim();
        }
        console.log(messageDetails);
        if (messageDetails['Upgrade'] != 'websocket' ||
            !messageDetails['Sec-WebSocket-Key'] ||
            !messageDetails['Sec-WebSocket-Protocol']) {
          this.closeClientConnection(clientIndex);
          return false;
        }
        var responseKey = constructWebsocketResponseKey(
            messageDetails['Sec-WebSocket-Key']);
        var response =
            'HTTP/1.1 101 Switching Protocols\n' +
            'Upgrade: websocket\n' +
            'Connection: Upgrade\n' +
            'Sec-WebSocket-Accept: ' + responseKey + '\n' +
            'Sec-WebSocket-Protocol: ' + messageDetails['Sec-WebSocket-Protocol'] + '\n' +
            '\n';
        console.log('Sending response:\n' + response);
        response = StringToArrayBuffer(response.replace(/\n/g, '\r\n'));
        var self = this;
        chrome.socket.write(this.clients[clientIndex].socketId, response, function(writeInfo) {
          if (writeInfo.resultCode < 0 || writeInfo.bytesWritten != response.byteLength) {
            self.closeClientConnection(self.clients[clientIndex].socketId);
            return;
          }
          self.clients[clientIndex].state = 'connected';
          self.dispatchEvent('connect', clientIndex);
        });
      } else {
        var json;
        try {
          json = JSON.parse(message);
        } catch (e) {
          this.closeClientConnection(clientIndex);
          return false;
        }
        this.dispatchEvent('message', clientIndex, json);
      }
      return true;
    },

    closeClientConnection: function(clientIndex) {
      // This may be called more than once. Once intending to close the
      // connection and a second time as a result of failing to listen for data
      // on the now closed connection.
      // TODO(flackr): Safely only call this once.
      if (this.clients[clientIndex]) {
        self.dispatchEvent('disconnect', clientIndex);
        chrome.socket.disconnect(this.clients[clientIndex].socketId);
        chrome.socket.destroy(this.clients[clientIndex].socketId);
        delete this.clients[clientIndex];
      }
    },

    // Send |message| to the client identified by |clientIndex|.
    send: function(clientIndex, message) {
      var self = this;
      data = StringToArrayBuffer(JSON.stringify(message) + '\r\n\r\n');
      chrome.socket.write(this.clients[clientIndex].socketId, data, function(writeInfo) {
        if (writeInfo.resultCode < 0 ||
            writeInfo.bytesWritten !== data.byteLength) {
          self.closeClientConnection(self.clients[clientIndex].socketId);
        }
      });
    },

    registerServer: function(evt) {
      console.log('Connected, registering server');
      this.ws.send(JSON.stringify({type: 'register', details: this.gameInfo}));
    },

    connectionLost: function(evt) {
      console.log('Connection to lobby lost');
    },

    lobbyMessageReceived: function(evt) {
      try {
        var json = JSON.parse(evt.data);
        if (json.type == 'ping') {
          this.ws.send(JSON.stringify({type: 'pong'}));
        }
      } catch(e) {
        this.ws.close();
      }
    },

    updateLobby: function() {
      this.ws.send(JSON.stringify({type: 'update', details: this.gameInfo}));
    },

    onError: function(evt) {
      console.log('Error: ' + evt.data);
    },
  });

  return Host;
}();
