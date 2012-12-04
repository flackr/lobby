/**
 * A client API to communicate to the game host.
 *
 * Public APIs:
 *
 * lobby.client.connect(hostUrl, clientInfo);
 * lobby.client.addEventListener(type, callback);
 * lobby.client.removeEventListener(type, callback);
 */

lobby.client = {};

lobby.client.ws_;
lobby.client.eventSource_ = new lobby.util.EventSource();

/**
 * Connects to the host. It also sends clientInfo when the connection is open.
 */
lobby.client.connect = function(hostUrl, clientInfo) {
  if (lobby.client.ws_) {
    console.log('already connected.');
    return;
  }
  lobby.client.ws_ = new WebSocket(hostUrl, ['game-protocol']);
  lobby.client.ws_.onopen = function(evt) {
    lobby.client.openConnection_(evt, clientInfo);
  };
  lobby.client.ws_.onclose = lobby.client.closeConnection_;
  lobby.client.ws_.onmessage = function(evt) {
    lobby.client.receiveMessage_(evt.data);
  };
  lobby.client.ws_.onerror = lobby.client.onError_;
};

/**
 * Adds event listener. Type must be one of 'connected', 'disconnected',
 * 'message'
 */
lobby.client.addEventListener = function(type, callback) {
  lobby.client.eventSource_.addEventListener(type, callback);
};

/**
 * Removes event listener. Type must be one of 'connected', 'disconnected',
 * 'message'
 */
lobby.client.removeEventListener = function(type, callback) {
  lobby.client.eventSource_.removeEventListener(type, callback);
};

/**
 * Below are helper functions.
 */
lobby.client.openConnection_ = function(evt, clientInfo) {
  console.log('connected to the game host', evt);
  lobby.client.eventSource_.dispatchEvent('connected');
  lobby.client.ws_.send(JSON.stringify({type: 'clientconnection',
                                        details: clientInfo}));
};

lobby.client.closeConnection_ = function(evt) {
  console.log('Connection to game host lost.');
  lobby.client.eventSource_.dispatchEvent('disconnected');
};

lobby.client.receiveMessage_ = function(message) {
  console.log('message received: ', message);
  lobby.client.eventSource_.dispatchEvent('message', message);
};

lobby.client.onError_ = function(evt) {
  console.log('Error: ', evt);
};
