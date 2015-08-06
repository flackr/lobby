var lobby = lobby || {};
var RTCPeerConnection = RTCPeerConnection || webkitRTCPeerConnection || mozRTCPeerConection;

lobby.LobbyApi = function(host) {
  this.host_ = host;
  this.configuration = {
    iceServers: [
        {urls: "stun:stun.l.google.com:19302"},
    ],
  };
};

lobby.LobbyApi.prototype = {

  /**
   * Creates a new lobby session.
   *
   * @return {lobby.HostSession} A host lobby session.
   */
  createSession: function(configuration) {
    return new lobby.HostSession(this.host_, configuration || this.configuration);
  },

  /**
   * Joins a lobby session.
   *
   * @return {lobby.ClientSession} A client session.
   */
  joinSession: function(identifier, configuration) {
    return new lobby.ClientSession(this.host_, identifier, configuration || this.configuration);
  },
};

lobby.HostSession = function(host, configuration) {
  this.configuration = configuration;
  this.addEventTypes(['open', 'connection', 'close']);
  this.websocket_ = new WebSocket(host + '/new');
  this.websocket_.addEventListener('message', this.onMessage_.bind(this));
  this.clients_ = [];
};

lobby.HostSession.prototype = lobby.util.extend(lobby.util.EventSource.prototype, {
  onMessage_: function(e) {
    var data = JSON.parse(e.data);
    if (data.host)
      this.dispatchEvent('open', data.host);
    if (data.client) {
      if (data.type == 'offer') {
        var clientRTCConnection = this.clients_[data.client] = new RTCPeerConnection(this.configuration, null);
        clientRTCConnection.ondatachannel = this.onDataChannel_.bind(this, data.client);
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
    console.log('Send ice candidate');
    if (event.candidate) {
      this.websocket_.send(JSON.stringify({'client':client, 'type':'candidate', 'data': event.candidate}));
    }
  },
  onDataChannel_: function(client, e) {
    var channel = e.channel;
    var self = this;
    if (channel.readyState == 'open') {
      this.dispatchEvent('connection', channel);
      delete this.clients_[client];
    }
    channel.onopen = function() {
      self.dispatchEvent('connection', channel);
      delete self.clients_[client];
    }
  },
});

lobby.ClientSession = function(host, identifier, configuration) {
  this.configuration = configuration;
  this.websocket_ = new WebSocket(host + '/' + identifier);
  this.addEventTypes(['open', 'close']);
  this.rtcConnection_ = new RTCPeerConnection(this.configuration, null);
  this.dataChannel_ = this.rtcConnection_.createDataChannel('data', {reliable: false});
  this.dataChannel_.onopen = this.onDataChannel_.bind(this, this.dataChannel_);
  this.websocket_.addEventListener('open', this.onOpen_.bind(this));
  this.websocket_.addEventListener('message', this.onMessage_.bind(this));
  this.rtcConnection_.onicecandidate = this.onIceCandidate_.bind(this);
}

lobby.ClientSession.prototype = lobby.util.extend(lobby.util.EventSource.prototype, {
  onOpen_: function() {
    this.rtcConnection_.createOffer(this.onOffer_.bind(this));
  },
  onOffer_: function(desc) {
    this.rtcConnection_.setLocalDescription(desc);
    this.websocket_.send(JSON.stringify({'type' : 'offer', 'data' : desc}));
  },
  onIceCandidate_: function(event) {
    if (event.candidate)
      this.websocket_.send(JSON.stringify({'type' : 'candidate', 'data' : event.candidate}));
  },
  onMessage_: function(e) {
    var data = JSON.parse(e.data);
    if (data.type == 'answer')
      this.rtcConnection_.setRemoteDescription(new RTCSessionDescription(data.data));
    else if (data.type == 'candidate')
      this.rtcConnection_.addIceCandidate(new RTCIceCandidate(data.data));
  },
  onDataChannel_: function(channel) {
    this.dispatchEvent('open', channel);
    this.close();
  },
  close: function() {
    this.websocket_.close();
  },
});
