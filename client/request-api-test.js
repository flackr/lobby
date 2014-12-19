var peerConnection;
var dataChannel;

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
  console.log("JR host onHostConnected!");
  window.location.hash = hostId;
}

function onClientOffer(clientID) {
  var servers = null;
  peerConnection = new RTCPeerConnection(servers, {optional: [{RtpDataChannels: true}]});
  peerConnection.ondatachannel = gotHostChannel;
  return peerConnection;
}

function clientConnectionCallback(){
  var servers = null;
  peerConnection = new RTCPeerConnection(servers, {optional: [{RtpDataChannels: true}]});
  try {
    dataChannel = peerConnection.createDataChannel("sendDataChannel", {reliable: false});
  } catch (e) {
    console.log("JR failed to create client channel "+e.message);
  }
  dataChannel.onopen = handleClientChannelStateChange;
  dataChannel.onclose = handleClientChannelStateChange;
  createClientConnection(peerConnection, dataChannel);
}

function gotHostChannel(event) {
  console.log("JR Host Channel received");
  dataChannel = event.channel;
  dataChannel.onmessage = handleMessage;
  dataChannel.onopen = handleHostChannelStateChange;
  dataChannel.onclose = handleHostChannelStateChange;
}

function handleClientChannelStateChange() {
  var readyState = dataChannel.readyState;
  console.log("JR client change state change "+readyState);
  if (readyState == "open") {
    dataChannel.send("HEY LISTEN");
  }
}

function handleHostChannelStateChange() {
  var readyState = dataChannel.readyState;
  console.log("JR host channel ready state "+readyState);
}

function handleMessage(event) {
  console.log("JR client message "+event.data);
}

startup();
