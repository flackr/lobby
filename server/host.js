/**
 * An API for hosting a game on the lobby server.
 */

lobby.serverCapable = function() {
  return chrome.socket && chrome.socket.listen;
};

lobby.Host = function() {
  var Host = function(lobbyUrl) {
    lobby.util.EventSource.apply(this);

    this.clients = {};
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
  }

  Host.prototype = lobby.util.extend(lobby.util.EventSource.prototype, {

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
