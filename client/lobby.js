var lobby = lobby || {};

lobby.LobbyApi = function(signalingClient) {
  /**
   * Client which will handle signaling between hosts and clients.
   * @type {lobby.SignalingClientBase}
   * @private
   */
  this.signalingClient_ = signalingClient;
};

lobby.LobbyApi.prototype = {

  /**
   * Creates a new lobby session.
   *
   * @return {lobby.HostSession} A host lobby session.
   */
  createSession: function(acceptCallback) {
    return this.signalingClient_.createSession(acceptCallback)
  },

  /**
   * Joins a lobby session.
   *
   * @return {lobby.ClientSession} A client session.
   */
  joinSession: function(identifier, rtcConnection) {
    return this.signalingClient_.joinSession(identifier, rtcConnection);
  },
};

lobby.HostSession = function() {
  lobby.util.EventSource.apply(this);
}

lobby.HostSession.prototype = lobby.util.extend(lobby.util.EventSource.prototype, {

  /**
   * Close the host session.
   */
  close: function() {
    
  },
});

lobby.ClientSession = function() {
  
}

