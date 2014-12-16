var lobby = lobby || {};

lobby.signaling.createSession = nodeCreateSession;
lobby.signaling.connect = nodeConnect;

//TODO(jonross) update to actual port
var testPort = 1337;
var websocket;

function nodeCreateSession(descriptionId, onConnectionCallback, onErrorCallback) {
  websocket = new WebSocket('ws://localhost:' + testPort.toString() + '/new');
  websocket.addEventListener('open', function() {
    onConnectionCallback();
    console.log("Host connection open");
  });
  websocket.addEventListener('close', function(error) {
    //TODO(jonross) parse for errors vs close, call error callback
    console.log("Host connection close "+error.toString());
  });
  websocket.addEventListener('message', function(msg) {
    console.log("Host message "+msg.data);
  });
}

function nodeConnect(sessionId, descriptionId, onConnectionCallback, onErrorCallback) {
  websocket = new WebSocket('ws://localhost:' + testPort.toString() + '/' + sessionId.toString());
  websocket.addEventListener('open', function() {
    onConnectionCallback();
    console.log("Client connection openned");
  });
  websocket.addEventListener('close', function(error) {
    //TODO(jonross) parse for errors vs close, call error callback
    console.log("Client connection close "+error)
  });
  websocket.addEventListener('message', function(msg) {
    console.log("Client message "+msg.data)
  });
}

var NodeConnection = function(sessionId) {
  lobby.signaling.Connection.apply(this, arguments);
  this.sessionId = sessionId;
}

NodeConnection.prototype = lobby.signaling.Connection.prototype;
NodeConnection.prototype.constructor = NodeConnection;

function testOnConnectionCallback(){
}

nodeCreateSession(1337, onHostConnected, 42)

function onHostConnected() {
  nodeConnect(1, 1337, testOnConnectionCallback, 42)
}
