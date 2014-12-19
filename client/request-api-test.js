var peerConnection;
var dataChannel;
// Optional servers for RTCPeerConnection
var servers = null;

function startup() {
  if (window.location.hash != '') {
    document.getElementById("differentiation").innerHTML = 'Client';
    nodeConnect(window.location.hash.substr(1), 1337, clientConnectionCallback, 42);
  } else {
    document.getElementById("differentiation").innerHTML = 'Host';
    nodeCreateSession(1337, onHostConnected, 42, onClientOffer);
  }
}

function onHostConnected(hostId) {
  window.location.hash = hostId;
}

function onClientOffer(clientID) {
  peerConnection = new RTCPeerConnection(servers, {optional: [{RtpDataChannels: true}]});
  peerConnection.ondatachannel = gotHostChannel;
  return peerConnection;
}

function clientConnectionCallback(){
  peerConnection = new RTCPeerConnection(servers, {optional: [{RtpDataChannels: true}]});
  try {
    dataChannel = peerConnection.createDataChannel("sendDataChannel", {reliable: false});
  } catch (e) {
    console.log("Failed to create data channel "+e.message);
  }
  dataChannel.onmessage = handleMessage;
  dataChannel.onopen = handleChannelStateChange;
  dataChannel.onclose = handleChannelStateChange;
  createClientConnection(peerConnection);
}

function gotHostChannel(event) {
  dataChannel = event.channel;
  dataChannel.onmessage = handleMessage;
  dataChannel.onopen = handleChannelStateChange;
  dataChannel.onclose = handleChannelStateChange;
}

function handleChannelStateChange() {
  var readyState = dataChannel.readyState;
  console.log("Channel state change: "+readyState);
  if (readyState == "open") {
    dataChannel.send("HEY LISTEN");
  }
}

function handleMessage(event) {
  console.log("Channel message: "+event.data);
}

startup();
