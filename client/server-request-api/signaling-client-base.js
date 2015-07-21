var lobby = lobby || {};
lobby.util = {};

lobby.AbstractClassError = function(obj, functionName) {
  this.name = 'AbstractClassError';
  this.message = obj.name + ' is abstract';
  if (functionName)
    this.message += ', ' + functionName + ' not implemented.';
}

lobby.util.SignalingClientBase = function() {
};

lobby.util.SignalingClientBase.prototype = {
    
  /**
   * Create a new session.
   * 
   * @return {lobby.SignalingHost} A new signaling host session.
   */
  createSession: function() {
    throw new lobby.AbstractClassError(this, 'createSession');
  },

  /**
   * Joins the session with the given identifier.
   * 
   * @return {lobby.SignalingClient} A new signaling client session.
   */
  joinSession: function(identifier) {
    throw new lobby.AbstractClassError(this, 'joinSession');
  },
};

lobby.util.SignalingHost = function() {
  lobby.util.EventSource.apply(this);
};

lobby.util.SignalingHost.prototype =
    lobby.util.extend(lobby.util.EventSource.prototype, {

  /**
   * Close the signaling host session. From this point on it will not be
   * possible to send any more signaling messages.
   */
  close: function() {
    throw new lobby.AbstractClassError(this, 'close');
  },
});

lobby.util.SignalingClient = function() {
  lobby.util.EventSource.apply(this);
};

lobby.util.SignalingClient.prototpe =
    lobby.util.extend(lobby.util.EventSource.prototype, {

  /**
   * Send |message| to the remote device.
   */
  send: function(message) {
    throw new lobby.AbstractClassError(this, 'send');
  },

  /**
   * Close the signaling backend connection.
   */
  close: function() {
    throw new lobby.AbstractClassError(this, 'close');
  },
});
