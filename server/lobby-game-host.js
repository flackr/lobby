/**
 * An API for hosting a game on the lobby server.
 */

var lobby = {};
lobby.Host = function() {
  var Host = function(lobbyUrl) {
    this.ws = new WebSocket(lobbyUrl, ['game-protocol']);
    this.ws.onopen = this.registerServer.bind(this);
    this.ws.onclose = this.connectionLost.bind(this);
    this.ws.onmessage = this.lobbyMessageReceived.bind(this);
    this.ws.onerror = this.onError.bind(this);
  }

  Host.prototype = {

    registerServer: function(evt) {
      console.log('Connected, registering server');
      this.ws.send('register {}');
    },

    connectionLost: function(evt) {
      alert('Connection to lobby lost');
    },

    lobbyMessageReceived: function(evt) {
      console.log('Received ' + evt.data);
    },

    onError: function(evt) {
      console.log('Error: ' + evt.data);
    }
  };

  return Host;
}();
