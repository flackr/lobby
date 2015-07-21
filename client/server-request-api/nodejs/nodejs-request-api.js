var lobby = lobby || {};
var RTCPeerConnection = RTCPeerConnection || webkitRTCPeerConnection || mozRTCPeerConection;

lobby.WebSocketSignalingClient = function(host) {
  this.host_ = host;
  this.websocket_ = null;
};

lobby.WebSocketSignalingClient.prototype = {
  createSession: function(acceptCallback) {
    return new lobby.WebSocketSignalingHostSession(this.host_, acceptCallback);
  },

  joinSession: function(identifier, rtcConnection) {
    return new lobby.WebSocketSignalingJoinSession(this.host_, identifier, rtcConnection);
  },
};

lobby.WebSocketSignalingHostSession = function(host, acceptCallback) {
  this.acceptCallback_ = acceptCallback;
  this.addEventTypes(['open', 'connection', 'close']);
  this.websocket_ = new WebSocket(host + '/new');
  this.websocket_.addEventListener('message', this.onMessage_.bind(this));
  this.clients_ = [];
};

lobby.WebSocketSignalingHostSession.prototype = lobby.util.extend(lobby.util.EventSource.prototype, {
  onMessage_: function(e) {
    var data = JSON.parse(e.data);
    if (data.host)
      this.dispatchEvent('open', data.host);
    if (data.client) {
      if (data.type == 'offer') {
        this.clients_[data.client] = this.acceptCallback_(this.onSuccess.bind(this, data.client));
        if (!this.clients_[data.client]) {
          // TODO(flackr): Reject connection.
          return;
        }
        var clientRTCConnection = this.clients_[data.client];
        clientRTCConnection.onicecandidate = this.sendIceCandidate_.bind(this, data.client);
        clientRTCConnection.setRemoteDescription(new RTCSessionDescription(data.data));
        clientRTCConnection.createAnswer(this.sendAnswer_.bind(this, data.client));
      } else if (data.type == 'candidate') {
        var clientRTCConnection = this.clients_[data.client];
        if (clientRTCConnection)
          clientRTCConnection.addIceCandidate(new RTCIceCandidate(data.data));
      }
    }
  },
  sendAnswer_: function(client, desc) {
    this.clients_[client].setLocalDescription(desc);
    this.websocket_.send(JSON.stringify({'client':client, 'type': 'answer', 'data':desc}));
  },
  sendIceCandidate_: function(client, event) {
    if (event.candidate) {
      this.websocket_.send(JSON.stringify({'client':client, 'type':'candidate', 'data': event.candidate}));
    }
  },
  onSuccess: function(client) {
    this.dispatchEvent('connection', this.clients_[client]);
    delete this.clients_[client];
  }
});

lobby.WebSocketSignalingJoinSession = function(host, identifier, rtcConnection) {
  this.websocket_ = new WebSocket(host + '/' + identifier);
  this.rtcConnection_ = rtcConnection;
  this.websocket_.addEventListener('open', this.onOpen_.bind(this));
  this.websocket_.addEventListener('message', this.onMessage_.bind(this));
}

lobby.WebSocketSignalingJoinSession.prototype = lobby.util.extend(lobby.util.EventSource.prototype, {
  onOpen_: function() {
    this.rtcConnection_.createOffer(this.onOffer_.bind(this));
    this.rtcConnection_.onicecandidate = this.onIceCandidate_.bind(this);
  },
  onOffer_: function(desc) {
    this.rtcConnection_.setLocalDescription(desc);
    this.websocket_.send(JSON.stringify({'type' : 'offer', 'data' : desc}));
  },
  onIceCandidate_: function(event) {
    this.websocket_.send(JSON.stringify({'type' : 'candidate', 'data' : event.candidate}));
  },
  onMessage_: function(e) {
    var data = JSON.parse(e.data);
    if (data.type == 'answer')
      this.rtcConnection_.setRemoteDescription(new RTCSessionDescription(data.data));
    else if (data.type == 'candidate')
      this.rtcConnection_.addIceCandidate(new RTCIceCandidate(data.data));
  },
  close: function() {
    this.websocket_.close();
  },
});
