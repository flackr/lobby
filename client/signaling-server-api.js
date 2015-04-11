var lobby = lobby || {};

lobby.signaling = function(){

  createSession = function(descriptionId, onConnectionCallback, onErrorCallback) {
  }
  
  connect = function(sessionId, descriptionId, onConnectionCallback, onErrorCallback) {
  }
  
  function Connection(sessionId) {
    this.sessionId = sessionId;
  }
  
  Connection.prototype = {
    onMessage: function(message) {
    }, 
    
    onClose: function(closeReasonId) {
    },
    
    sendMessage: function(message) {
    },
  };

  return {
    'createSession': createSession,
    'connect': connect,
    'Connection': Connection
  };
}();