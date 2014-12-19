function startup() {
  if (window.location.hash != '') {
    document.getElementById("differentiation").innerHTML = 'Client';
    nodeConnect(window.location.hash.substr(1), 1337, clientConnectionCallback, 42);
  } else {
    document.getElementById("differentiation").innerHTML = 'Host';
    nodeCreateSession(1337, onHostConnected, 42);
  }
}

function onHostConnected(hostId) {
  console.log("JR host onHostConnected!");
  window.location.hash = hostId;
}

function clientConnectionCallback(){
  createClientConnection();
}

startup();
