var lobby = lobby || {};

lobby.signaling.createSession = localCreateSession;
lobby.signaling.connect = localConnect;

var sessions = [];
var clients = [];

function localCreateSession(descriptionId, onConnectionCallback, onErrorCallback) {
  var sessionId = sessions.indexOf(descriptionId);
  if (sessionId == -1) {
    sessionId = sessions.push(descriptionId);
    var localConnection = new LocalConnection(sessionId);
    onConnectionCallback(localConnection);
  } else {
    onErrorCallback("duplicate ID");
  }
}

function localConnect(sessionId, descriptionId, onConnectionCallback, onErrorCallback) {
  if (sessionId > sessions.length || sessions[sessionId] != descriptionId) {
    onErrorCallback("Invalid sessionId");
    return;
  }
  var clientId = clients.push({session: sessionId, description: descriptionId});
  var localConnection = new LocalConnection(sessionId);
  localConnection.clientId = clientId;
  onConnectionCallback(localConnection);
}

var LocalConnection = function(sessionId) {
  lobby.signaling.Connection.apply(this, arguments);
  this.sessionId = sessionId;
}

LocalConnection.prototype = lobby.signaling.Connection.prototype;
LocalConnection.prototype.constructor = LocalConnection;

function onConnectionCallback(localConnection) {
  console.log("JR connected! "+localConnection.sessionId);
}

function onErrorCallback(error) {
  console.log("JR error message: "+error);
}

// Tests
/*
sessions = [20, 1337];
localCreateSession(42, onConnectionCallback, onErrorCallback);
localCreateSession(42, onConnectionCallback, onErrorCallback);
localConnect(42, 1337, onConnectionCallback, onErrorCallback);
localConnect(2, 42, onConnectionCallback, onErrorCallback);
*/