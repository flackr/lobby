var lobby = lobby || {};
var RTCPeerConnection = RTCPeerConnection || webkitRTCPeerConnection || mozRTCPeerConection;

lobby.signaling.createSession = nodeCreateSession;
lobby.signaling.connect = nodeConnect;

//TODO(jonross) update to actual port
var testPort = 1337;
var websocket;
var clientSocket;
var hostId;

function nodeCreateSession(descriptionId, onConnectionCallback, onErrorCallback, onClientOfferCallback) {
  websocket = new WebSocket('ws://localhost:' + testPort.toString() + '/new');
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
        console.log("Host remote desc set");
        hostPeerConnection.setRemoteDescription(description);
        console.log("JR create answer from host");
        hostPeerConnection.createAnswer(function(desc) {
          gotHostDescription(desc, data.client);
        });
      } else if (data.type == 'candidate' ) {
        var candidate = new RTCIceCandidate(data.data);
        hostPeerConnection.addIceCandidate(candidate);
        console.log("Host added new ice candidate from client "+data.data.candidate);
      }
    }
  });
}

function nodeConnect(sessionId, descriptionId, onConnectionCallback, onErrorCallback) {
  clientSocket = new WebSocket('ws://localhost:' + testPort.toString() + '/' + sessionId);
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
      var description = new RTCSessionDescription(data);
      clientPeerConnection.setRemoteDescription(description);
      console.log("Client remote desc set");
    } else if (data.type == 'candidate') {
      var candidate = new RTCIceCandidate(data.data);
      clientPeerConnection.addIceCandidate(candidate);
      console.log("Client added new ice candidate from host: "+data.data.candidate);
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
var hostChannel;
var clientChannel;

function gotHostCandidate(event, clientId) {
  if (event.candidate) {
    console.log("Host candidate "+event.candidate.candidate);
    websocket.send(JSON.stringify({'client':clientId, 'type':'candidate', 'data':{'type':'candidate', 'data':event.candidate}}));
  }
}

function gotHostDescription(desc, client) {
  hostPeerConnection.setLocalDescription(desc);
  console.log('Host local description set');// + desc.sdp);
  websocket.send(JSON.stringify({'client':client, 'type': 'answer', 'data':desc}));
}

function createClientConnection(peerConnection, dataChannel) {
  clientPeerConnection = peerConnection;
  clientChannel = dataChannel;
  clientPeerConnection.onicecandidate = gotClientIceCandidate;
  console.log("JR create offer from client");
  clientPeerConnection.createOffer(gotClientDescription);
}

function gotClientIceCandidate(event) {
  if (event.candidate) {
    console.log('Client ICE candidate: ' + event.candidate.candidate);
    clientSocket.send(JSON.stringify({'type' : 'candidate', 'data' : event.candidate}));
  }
}

function gotClientDescription(desc) {
  console.log("JR client local desc set");
  clientPeerConnection.setLocalDescription(desc);
  clientSocket.send(JSON.stringify({'type' : 'offer', 'data' : desc}));
}
