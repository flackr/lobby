/**
 * A client API to communicate to the game host.
 *
 * Public APIs:
 *
 * lobby.client.connect(hostUrl, clientInfo);
 * lobby.client.addEventListener(type, callback);
 * lobby.client.removeEventListener(type, callback);
 */

lobby.Client = function() {

  var Client = function(gameInfo) {
    lobby.util.EventSource.apply(this);

    var hostUrl;
    if (typeof gameInfo == 'string') {
      hostUrl = gameInfo;
    } else {
      if ((!gameInfo.visibility || gameInfo.visibility == 'private') &&
          gameInfo.ifaces && gameInfo.ifaces.length > 0) {
        hostUrl = 'ws://' + gameInfo.ifaces[0] + ':' + gameInfo.port;
      } else {
        hostUrl = 'ws://' + gameInfo.publicAddress + ':' + gameInfo.port;
      }
    }
    this.ws_ = new WebSocket(hostUrl, ['game-protocol']);
    this.ws_.onopen = this.onConnected.bind(this);
    this.ws_.onclose = this.onDisconnected.bind(this);
    this.ws_.onmessage = this.onMessage.bind(this);
    this.ws_.onerror = this.onError.bind(this);
  }

  Client.prototype = lobby.util.extend(lobby.util.EventSource.prototype, {
    onConnected: function(evt) {
      this.dispatchEvent('connected');
    },

    onDisconnected: function(evt) {
      this.dispatchEvent('disconnected');
    },

    onMessage: function(evt) {
      try {
        var json = JSON.parse(evt.data);
        if (json.type == 'ping') {
          this.ws_.send(JSON.stringify({type: 'pong'}));
        } else {
          this.dispatchEvent('message', json);
        }
      } catch(e) {
        this.ws_.close();
      }
    },

    onError: function(evt) {
      console.log('Error: ' + evt.data);
    },

    send: function(obj) {
      this.ws_.send(JSON.stringify(obj));
    },

    disconnect: function() {
      this.ws_.close();
    }
  });

  return Client;
}();
