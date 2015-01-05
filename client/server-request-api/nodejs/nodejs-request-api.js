var lobby = lobby || {};
var RTCPeerConnection = RTCPeerConnection || webkitRTCPeerConnection || mozRTCPeerConection;

lobby.signaling.createSession = nodeCreateSession;
lobby.signaling.connect = nodeConnect;

//TODO(jonross) update to actual port
var lobbyServer = 'lobbyjs.com';
var testPort = 1337;
var websocket;
var clientSocket;
var hostId;

/*
lobby.WebsocketSignalingClient = function(host) {
  this.host_ = host;
}

lobby.WebsocketSignalingClient.prototype =
    lobby.util.extend(lobby.SignalingClientBase, {
  createSession: function() {
    
  },

  joinSession: function(identifier) {
    
  },
});
*/

function nodeCreateSession(descriptionId, onConnectionCallback, onErrorCallback, onClientOfferCallback) {
  websocket = new WebSocket('ws://' + lobbyServer + ':' + testPort.toString() + '/new');
  websocket.addEventListener('open', function() {
  });
  websocket.addEventListener('close', function(error) {
    //TODO(jonross) parse for errors vs close, call error callback
    console.log("Host connection close "+error.toString());
  });
  websocket.addEventListener('message', function(msg) {
    var data;
    try {
      data = JSON.parse(msg.data);
    } catch (err) {
    }
    if (data.host) {
      hostId = data.host;
      onConnectionCallback(hostId);
    }
    if (data.client) {
      if (data.type == 'offer') {
        hostPeerConnection = onClientOfferCallback(data.client);
        hostPeerConnection.onicecandidate = function(event) {
          gotHostCandidate(event, data.client);
        }

        var description = new RTCSessionDescription(data.data);
        hostPeerConnection.setRemoteDescription(description);
        hostPeerConnection.createAnswer(function(desc) {
          gotHostDescription(desc, data.client);
        });
      } else if (data.type == 'candidate' ) {
        var candidate = new RTCIceCandidate(data.data);
        hostPeerConnection.addIceCandidate(candidate);
      }
    }
  });
}

function nodeConnect(sessionId, descriptionId, onConnectionCallback, onErrorCallback) {
  clientSocket = new WebSocket('ws://' + lobbyServer + ':' + testPort.toString() + '/' + sessionId);
  clientSocket.addEventListener('open', function() {
    onConnectionCallback();
  });
  clientSocket.addEventListener('close', function(error) {
    //TODO(jonross) parse for errors vs close, call error callback
    console.log("Client connection close "+error)
  });
  clientSocket.addEventListener('message', function(msg) {
    var data;
    try {
      data = JSON.parse(msg.data);
    } catch (err) {
    }
    if(data.type == 'answer') {
      var description = new RTCSessionDescription(data.data);
      clientPeerConnection.setRemoteDescription(description);
    } else if (data.type == 'candidate') {
      var candidate = new RTCIceCandidate(data.data);
      clientPeerConnection.addIceCandidate(candidate);
    }
  });
}

var NodeConnection = function(sessionId) {
  lobby.signaling.Connection.apply(this, arguments);
  this.sessionId = sessionId;
}

NodeConnection.prototype = lobby.signaling.Connection.prototype;
NodeConnection.prototype.constructor = NodeConnection;

// Setup RTC
var hostPeerConnection;
var clientPeerConnection;

function gotHostCandidate(event, clientId) {
  if (event.candidate) {
    websocket.send(JSON.stringify({'client':clientId, 'type':'candidate', 'data': event.candidate}));
  }
}

function gotHostDescription(desc, client) {
  hostPeerConnection.setLocalDescription(desc);
  websocket.send(JSON.stringify({'client':client, 'type': 'answer', 'data':desc}));
}

function createClientConnection(peerConnection) {
  clientPeerConnection = peerConnection;
  clientPeerConnection.onicecandidate = gotClientIceCandidate;
  clientPeerConnection.createOffer(gotClientDescription);
}

function gotClientIceCandidate(event) {
  if (event.candidate) {
    clientSocket.send(JSON.stringify({'type' : 'candidate', 'data' : event.candidate}));
  }
}

function gotClientDescription(desc) {
  clientPeerConnection.setLocalDescription(desc);
  clientSocket.send(JSON.stringify({'type' : 'offer', 'data' : desc}));
}
