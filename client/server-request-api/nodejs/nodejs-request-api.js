var lobby = lobby || {};
var RTCPeerConnection = RTCPeerConnection || webkitRTCPeerConnection || mozRTCPeerConection;

lobby.signaling.createSession = nodeCreateSession;
lobby.signaling.connect = nodeConnect;

//TODO(jonross) update to actual port
var testPort = 1337;
var websocket;
var clientSocket;
var hostId;

function nodeCreateSession(descriptionId, onConnectionCallback, onErrorCallback) {
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
        createHostConnection(data.client);
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

// Test calling server
function clientConnectionCallback(){
  createClientConnection();
}

//nodeCreateSession(1337, onHostConnected, 42)

function onHostConnected() {
  nodeConnect(hostId, 1337, clientConnectionCallback, 42)
}

// Setup RTC
var hostPeerConnection;
var clientPeerConnection;
var hostChannel;
var clientChannel;

function createHostConnection(clientId) {
  var servers = null;
  hostPeerConnection = new RTCPeerConnection(servers, {optional: [{RtpDataChannels: true}]});
  hostPeerConnection.onicecandidate = function(event) {
    gotHostCandidate(event, clientId);
  }
  hostPeerConnection.ondatachannel = gotHostChannel;
}

function gotHostCandidate(event, clientId) {
  if (event.candidate) {
    console.log("Host candidate "+event.candidate.candidate);
    websocket.send(JSON.stringify({'client':clientId, 'type':'candidate', 'data':{'type':'candidate', 'data':event.candidate}}));
  }
}

function gotHostChannel(event) {
  console.log("JR Host Channel received");
  hostChannel = event.channel;
  hostChannel.onmessage = handleMessage;
  hostChannel.onopen = handleHostChannelStateChange;
  hostChannel.onclose = handleHostChannelStateChange;
}

function handleHostChannelStateChange() {
  var readyState = hostChannel.readyState;
  console.log("JR host channel ready state "+readyState);
}

function gotHostDescription(desc, client) {
  hostPeerConnection.setLocalDescription(desc);
  console.log('Host local description set');// + desc.sdp);
  websocket.send(JSON.stringify({'client':client, 'type': 'answer', 'data':desc}));
}

function createClientConnection() {
  var servers = null;
  clientPeerConnection = new RTCPeerConnection(servers, {optional: [{RtpDataChannels: true}]});
  try {
    clientChannel = clientPeerConnection.createDataChannel("sendDataChannel", {reliable: false});
  } catch (e) {
    console.log("JR failed to create client channel "+e.message);
  }
  clientPeerConnection.onicecandidate = gotClientIceCandidate;
  clientChannel.onopen = handleClientChannelStateChange;
  clientChannel.onclose = handleClientChannelStateChange;
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

function handleMessage(event) {
  console.log("JR client message "+event.data);
}

function handleClientChannelStateChange() {
  var readyState = clientChannel.readyState;
  console.log("JR client change state change "+readyState);
  if (readyState == "open") {
    clientChannel.send("HEY LISTEN");
  }
}
