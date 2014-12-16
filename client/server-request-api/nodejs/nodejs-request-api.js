var lobby = lobby || {};

lobby.signaling.createSession = nodeCreateSession;
lobby.signaling.connect = nodeConnect;

//TODO(jonross) update to actual port
var testPort = 8080;
var websocket;

function nodeCreateSession(descriptionId, onConnectionCallback, onErrorCallback) {
  websocket = new WebSocket('wss://0.0.0.0:' + testPort.toString() + '/new');
  websocket.addEventListener('open', function() {
    onConnectionCallback();
  });
  websocket.addEventListener('close', function(error) {
    //TODO(jonross) parse for errors vs close, call error callback
  });
  websocket.addEventListener('message', function(msg) {
  });
  
}

function nodeConnect(sessionId, descriptionId, onConnectionCallback, onErrorCallback) {
  websocket = new WebSocket('wss://localhost:' + testPort.toString() + '/' + sessionId.toString());
  websocket.addEventListener('open', function() {
    onConnectionCallback();
    console.log("connection openned");
  });
  websocket.addEventListener('close', function(error) {
    //TODO(jonross) parse for errors vs close, call error callback
    console.log("connection close "+error)
  });
  websocket.addEventListener('message', function(msg) {
    console.log("message "+msg)
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

nodeCreateSession(1337, 42, testOnConnectionCallback, 42)