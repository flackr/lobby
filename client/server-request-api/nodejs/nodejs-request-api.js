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
    console.log("Host connection open");
  });
  websocket.addEventListener('close', function(error) {
    //TODO(jonross) parse for errors vs close, call error callback
    console.log("Host connection close "+error.toString());
  });
  websocket.addEventListener('message', function(msg) {
    console.log("Host message "+msg.data);
    var data;
    try {
      data = JSON.parse(msg.data);
    } catch (err) {
    }
    if (data.host) {
      hostId = data.host;
      console.log("JR set host id "+hostId);
      onConnectionCallback();
    }
    if (data.client) {
      if (data.data.type == 'offer') {
        console.log("Host offer received "+data.data.desc);
        createHostConnection();
        var description = new RTCSessionDescription(data.data.desc);
        hostPeerConnection.setRemoteDescription(description);
        hostPeerConnection.createAnswer(function(desc) {
          gotHostDescription(desc, data.client);
        });
      }
    }
  });
}

function nodeConnect(sessionId, descriptionId, onConnectionCallback, onErrorCallback) {
  clientSocket = new WebSocket('ws://localhost:' + testPort.toString() + '/' + sessionId);
  clientSocket.addEventListener('open', function() {
    onConnectionCallback();
    console.log("Client connection openned");
  });
  clientSocket.addEventListener('close', function(error) {
    //TODO(jonross) parse for errors vs close, call error callback
    console.log("Client connection close "+error)
  });
  clientSocket.addEventListener('message', function(msg) {
    console.log("Client message "+msg.data)
    var data;
    try {
      data = JSON.parse(msg.data);
    } catch (err) {
    }
    if(data.type == 'answer') {
      var description = new RTCSessionDescription(data);
      hostPeerConnection.setRemoteDescription(description);
      console.log("Client received answer");
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
  // Send intent
}

nodeCreateSession(1337, onHostConnected, 42)

function onHostConnected() {
  console.log("JR host connected callback");
  createHostConnection();
  nodeConnect(hostId, 1337, clientConnectionCallback, 42)
}

// Setup RTC
var hostPeerConnection;
var clientPeerConnection;
var hostChannel;
var clientChannel;

function createHostConnection() {
  var servers = null;
  hostPeerConnection = new RTCPeerConnection(servers, {optional: [{RtpDataChannels: true}]});
  try {
    hostChannel = hostPeerConnection.createDataChannel("sendDataChannel", {reliable: false});
  } catch (e) {
    console.log("JR failed to create host channel "+e.message);
  }
  hostPeerConnection.onicecandidate = gotHostCandidate;
  hostChannel.onopen = handleHostChannelStateChange;
  hostChannel.onclose = handleHostChannelStateChange;
}

function gotHostCandidate(event) {
  //console.log("JR host candidate event "+event);
  if (event.candidate) {
    console.log("Host candidate "+event.candidate.candidate);
    // Send candidate via websocket so client can add it
    //clientPeerConnection.addIceCandidate(event.candidate);
   // websocket.send(JSON.stringify({'client':clientId, 'data':event.candidate.candidate}));
  }
}

function handleHostChannelStateChange() {
  var readyState = hostChannel.readyState;
  console.log("JR host channel ready state "+readyState);
}

function gotHostDescription(desc, client) {
  hostPeerConnection.setLocalDescription(desc);
  console.log('Host has description set');// + desc.sdp);
  websocket.send(JSON.stringify({'client':client, 'type': 'answer', 'data':desc}));
  //Send via websocket to client
  //clientPeerConnection.setRemoteDescription(desc);
 //         clientPeerConnection.createAnswer(gotRemoteDescription);
}

function createClientConnection() {
  var servers = null;
  clientPeerConnection = new RTCPeerConnection(servers, {optional: [{RtpDataChannels: true}]});
  clientPeerConnection.onicecandidate = gotClientIceCandidate;
  clientPeerConnection.ondatachannel = gotClientChannel;
  clientPeerConnection.createOffer(gotClientDescription);
}

function gotClientIceCandidate(event) {
  //console.log("JR client candidate event "+event);
  if (event.candidate) {
 //Send via websocket
    //   localPeerConnection.addIceCandidate(event.candidate);
    console.log('Client ICE candidate: ' + event.candidate.candidate);
  }
}

function gotClientChannel(event) {
  clientChannel = event.channel;
  clientChannel.onmessage = handleMessage;
  clientChannel.onopen = handleClientChannelStateChange;
  clientChannel.onclose = handleClientChannelStateChange;
}

function gotClientDescription(desc) {
  console.log("JR client desc "+desc);
  clientPeerConnection.setLocalDescription(desc);
 // hostPeerConnection.setRemoteDescription(desc);
  clientSocket.send(JSON.stringify({'type' : 'offer', 'desc' : desc}));
}

function handleMessage(event) {
  console.log("JR client message "+event.data);
}

function handleClientChannelStateChange() {
  var readyState = clientChannel.readyState;
  console.log("JR client change state change "+readyState);
}
