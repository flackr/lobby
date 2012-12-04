/**
 * A client API to communicate to the game host.
 */

/**
 * Usage of Client
 *
 * var client = new Client('ws://localhost:9999/');
 * client.addEventListener('connected', function() {
 *   // called when the connection to the game host is made.
 * });
 * client.addEventListener('disconnected', function() {
 *   // called when the connection to the game host is lost/disconnected.
 * });
 * client.addEventListener('message', function(message) {
 *   // Handles the message from the game host.
 * });
 */
lobby.Client = function() {
  var Client = function(hostUrl) {
    this.ws = new WebSocket(hostUrl, ['game-protocol']);
    this.ws.onopen = this.openConnection.bind(this);
    this.ws.onclose = this.closeConnection.bind(this);
    this.ws.onmessage = this.receiveMessage.bind(this);
    this.ws.onerror = this.onError.bind(this);
    this.eventSource = new lobby.util.EventSource();
    this.clientInfo = {
      name: 'game client'
    };
  }

  Client.prototype = {
    openConnection: function(evt) {
      console.log('Connected to game host', evt);
      this.eventSource.dispatchEvent('connected');
      this.ws.send(JSON.stringify({type: 'clientconnection',
                                   details: this.clientInfo}));
    },
    closeConnection: function(evt) {
      console.log('Connection to game host lost.');
      this.eventSource.dispatchEvent('disconnected');
    },
    receiveMessage: function(evt) {
      console.log('message received: ', evt.data);
      this.eventSource.dispatchEvent('message', evt.data);
    },
    onError: function(evt) {
      console.log('Error: ', evt.data);
    },
    addEventListener: function(type, callback) {
      this.eventSource.addEventListener(type, callback);
    },
    removeEventListener: function(type, callback) {
      this.eventSource.removeEventListener(type, callback);
    }
  };

  return Client;
}();
