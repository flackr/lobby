/**
 * An API for hosting a game on the lobby server.
 */

lobby.serverCapable = function() {
  return chrome.socket && chrome.socket.listen;
};

lobby.Host = function() {

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
          chrome.socket.accept(self.socketId_, function(acceptInfo) {
            var clientIndex = self.clients.length;
            console.log('Client connected on index '+clientIndex);
            self.clients[clientIndex] = {socketId: acceptInfo.socketId, state: 'connecting'};
            self.dispatchEvent('connection', clientIndex);
            self.listenOnSocket(clientIndex);
          });
        });
      });
    },

    // Receive messages from the client identified by |clientIndex|.
    // TODO(flackr): Allow receiving parts of messages as they may get split up
    // into separate packets.
    listenOnSocket: function(clientIndex) {
      var self = this;
      chrome.socket.read(this.clients[clientIndex].socketId, function(readInfo) {
        if (readInfo.resultCode <= 0) {
          self.closeClientConnection(self.clients[clientIndex].socketId);
          return;
        }
        if (!readInfo.data.byteLength)
          return;
        var message = ArrayBufferToString(readInfo.data);
        if (self.clients[clientIndex].state == 'connecting') {
          // Sanitize newlines in header.
          message = message.replace('\r\n', '\n').split('\n');
          var messageDetails = {};
          for (var i = 0; i < message.length; i++) {
            var details = message[i].split(':');
            if (details.length == 2)
              messageDetails[details[0].trim()] = details[1].trim();
          }
          if (messageDetails['Upgrade'] != 'websocket' ||
              !messageDetails['Sec-WebSocket-Key'] ||
              !messageDetails['Sec-WebSocket-Protocol']) {
            closeClientConnection(clientIndex);
            return;
          }
          // TODO(flackr): Generate real response key.
          var responseKey = '';
          var response =
              'HTTP/1.1 101 Switching Protocols\n' +
              'Upgrade: websocket\n' +
              'Connection: Upgrade\n' +
              'Sec-WebSocket-Accept: ' + responseKey + '\n' +
              'Sec-WebSocket-Protocol: ' + messageDetails['Sec-WebSocket-Protocol'] + '\n' +
              '\n';
          self.send(clientIndex, response);
          self.clients[clientIndex].state = 'connected';
        } else {
          console.log('Received ' + message);
        }
        self.listenOnSocket(clientIndex);
      });
    },

    closeClientConnection: function(clientIndex) {
      // This may be called more than once. Once intending to close the
      // connection and a second time as a result of failing to listen for data
      // on the now closed connection.
      // TODO(flackr): Safely only call this once.
      if (this.clients[clientIndex]) {
        chrome.socket.disconnect(this.clients[clientIndex].socketId);
        chrome.socket.destroy(this.clients[clientIndex].socketId);
        delete this.clients[clientIndex];
      }
    },

    // Send |message| to the client identified by |clientIndex|.
    send: function(clientIndex, message) {
      var self = this;
      data = StringToArrayBuffer(JSON.stringify(message));
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
