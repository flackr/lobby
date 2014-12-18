var lobby = lobby || {};
var RTCPeerConnection = RTCPeerConnection || webkitRTCPeerConnection || mozRTCPeerConection;

lobby.signaling.createSession = nodeCreateSession;
lobby.signaling.connect = nodeConnect;

//TODO(jonross) update to actual port
var testPort = 1337;
var websocket;
var clientSockect;
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
//    websocket.send(JSON.stringify({'client' : 1, 'data': 'shhh'}));
  });
}

function nodeConnect(sessionId, descriptionId, onConnectionCallback, onErrorCallback) {
  clientSockect = new WebSocket('ws://localhost:' + testPort.toString() + '/' + sessionId);
  clientSockect.addEventListener('open', function() {
    onConnectionCallback();
    console.log("Client connection openned");
  });
  clientSockect.addEventListener('close', function(error) {
    //TODO(jonross) parse for errors vs close, call error callback
    console.log("Client connection close "+error)
  });
  clientSockect.addEventListener('message', function(msg) {
    console.log("Client message "+msg.data)
  });
}

var NodeConnection = function(sessionId) {
  lobby.signaling.Connection.apply(this, arguments);
  this.sessionId = sessionId;
}

NodeConnection.prototype = lobby.signaling.Connection.prototype;
NodeConnection.prototype.constructor = NodeConnection;

// Test calling server
function testOnConnectionCallback(){
}

nodeCreateSession(1337, onHostConnected, 42)

function onHostConnected() {
  console.log("JR host connected callback");
    nodeConnect(hostId, 1337, testOnConnectionCallback, 42)
  createHostConnection();
  createClientConnection();
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
  hostPeerConnection.createOffer(gotHostDescription);
}

function gotHostCandidate(event) {
  //console.log("JR host candidate event "+event);
  if (event.candidate) {
    console.log("Host candidate "+event.candidate.candidate);
    // Send candidate via websocket so client can add it
    //clientPeerConnection.addIceCandidate(event.candidate);
  }
}

function handleHostChannelStateChange() {
  var readyState = hostChannel.readyState;
  console.log("JR host channel ready state "+readyState);
}

function gotHostDescription(desc) {
  hostPeerConnection.setLocalDescription(desc);
  console.log('Host has description set');// + desc.sdp);
  //Send via websocket to client
  //clientPeerConnection.setRemoteDescription(desc);
 //         clientPeerConnection.createAnswer(gotRemoteDescription);
}

function createClientConnection() {
  var servers = null;
  clientPeerConnection = new RTCPeerConnection(servers, {optional: [{RtpDataChannels: true}]});
  clientPeerConnection.onicecandidate = gotClientIceCandidate;
  clientPeerConnection.ondatachannel = gotClientChannel;
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

function handleMessage(event) {
  console.log("JR client message "+event.data);
}

function handleClientChannelStateChange() {
  var readyState = clientChannel.readyState;
  console.log("JR client change state change "+readyState);
}
