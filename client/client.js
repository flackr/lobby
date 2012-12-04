/**
 * A client API to communicate to the game host.
 */

lobby.Client = function() {
  var Client = function(hostUrl) {
    this.ws = new WebSocket(hostUrl, ['game-protocol']);
    this.ws.onopen = this.openConnection.bind(this);
    this.ws.onclose = this.closeConnection.bind(this);
    this.ws.onmessage = this.receiveMessage.bind(this);
    this.ws.onerror = this.onError.bind(this);
    this.clientInfo = {
      name: 'game client'
    };
  }

  Client.prototype = {
    openConnection: function(evt) {
      console.log('Connected to game host');
      this.ws.send(JSON.stringify({type: 'clientconnection',
                                   details: this.clientInfo}));
    },
    closeConnection: function(evt) {
      console.log('Connection to game host lost.');
    },
    receiveMessage: function(evt) {
      console.log('message received: ', evt.data);
    },
    onError: function(evt) {
      console.log('Error: ', evt.data);
    }
  };

  return Client;
}();
