var lobby = lobby || {};
var RTCPeerConnection = RTCPeerConnection || webkitRTCPeerConnection || mozRTCPeerConection;

lobby.LobbyApi = function(host, configuration) {
  this.host_ = host;
  this.configuration = configuration || {
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
  createSession: function() {
    return new lobby.HostSession(this.host_, this.configuration);
  },

  /**
   * Joins a lobby session.
   *
   * @return {lobby.ClientSession} A client session.
   */
  joinSession: function(identifier) {
    return new lobby.ClientSession(this.host_, identifier, this.configuration);
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
    if (data.host) {
      this.dispatchEvent('open', data.host);
      this.relay_ = data.relay;
    }
    if (data.client) {
      if (!this.clients_[data.client]) {
        this.clients_[data.client] = new lobby.HostClient(this, data.client);
        this.clients_[data.client].addEventListener('open', this.onConnection_.bind(this, data.client));
        if (this.relay_)
          this.clients_[data.client].connectRelay_();
      }
      this.clients_[data.client].onMessage_(data);
    }
  },
  onConnection_: function(clientId) {
    this.dispatchEvent('connection', this.clients_[clientId]);
  }
});

lobby.HostClient = function(hostSession, clientId) {
  this.hostSession_ = hostSession;
  this.clientId_ = clientId;
  this.addEventTypes(['open', 'message', 'close']);
};

lobby.HostClient.prototype = lobby.util.extend(lobby.util.EventSource.prototype, {
  connectRelay_: function() {
    this.relay_ = true;
    this.hostSession_.websocket_.send(JSON.stringify({'client': this.clientId_, 'type': 'relay', 'data': true}));
    this.dispatchEvent('open');
  },
  onMessage_: function(data) {
    if (data.type == 'offer') {
      this.rtcConnection_ = new RTCPeerConnection(this.hostSession_.configuration, null);
      this.rtcConnection_.ondatachannel = this.onDataChannel_.bind(this);
      this.rtcConnection_.onicecandidate = this.sendIceCandidate_.bind(this);
      this.rtcConnection_.setRemoteDescription(new RTCSessionDescription(data.data));
      this.rtcConnection_.createAnswer(this.sendAnswer_.bind(this));
    } else if (data.type == 'candidate') {
      this.rtcConnection_.addIceCandidate(new RTCIceCandidate(data.data));
    } else if (data.type == 'message') {
      this.dispatchEvent('message', {'data': data.data});
    }
  },
  onDataChannelMessage_: function(e) {
    this.dispatchEvent('message', e);
  },
  sendAnswer_: function(desc) {
    this.rtcConnection_.setLocalDescription(desc);
    this.hostSession_.websocket_.send(JSON.stringify({'client': this.clientId_, 'type': 'answer', 'data':desc}));
  },
  sendIceCandidate_: function(event) {
    console.log('Send ice candidate');
    if (event.candidate) {
      this.hostSession_.websocket_.send(JSON.stringify({'client': this.clientId_, 'type':'candidate', 'data': event.candidate}));
    }
  },
  onDataChannel_: function(e) {
    var channel = e.channel;
    channel.addEventListener('message', this.onDataChannelMessage_.bind(this));
    var self = this;
    if (channel.readyState == 'open') {
      this.dataChannel_ = channel;
      if (!this.relay_)
        this.dispatchEvent('open', channel);
    }
    channel.onopen = function() {
      self.dataChannel_ = channel;
      if (!self.relay_)
        self.dispatchEvent('open', channel);
    }
  },
  send: function(msg) {
    if (this.dataChannel_)
      this.dataChannel_.send(msg);
    else
      this.hostSession_.websocket_.send(JSON.stringify({'client': this.clientId_, 'type': 'message', 'data': JSON.stringify(msg)}));
  },
  close: function() {
    if (this.dataChannel_)
      this.dataChannel_.close();
  }
});

lobby.ClientSession = function(host, identifier, configuration) {
  this.configuration = configuration;
  this.websocket_ = new WebSocket(host + '/' + identifier);
  this.addEventTypes(['open', 'message', 'close']);
  this.rtcConnection_ = new RTCPeerConnection(this.configuration, null);
  this.dataChannel_ = this.rtcConnection_.createDataChannel('data', {reliable: false});
  this.dataChannel_.addEventListener('open', this.onDataChannel_.bind(this, this.dataChannel_));
  this.dataChannel_.addEventListener('message', this.onDataChannelMessage_.bind(this));
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
    else if (data.type == 'message')
      this.dispatchEvent('message', {'data': JSON.parse(data.data)});
    else if (data.type == 'relay') {
      this.relay_ = true;
      this.dispatchEvent('open');
    }
  },
  onDataChannel_: function(channel) {
    this.websocket_.close();
    delete this.websocket_;
    if (!this.relay_)
      this.dispatchEvent('open', channel);
  },

  onDataChannelMessage_: function(e) {
    this.dispatchEvent('message', e);
  },

  send: function(msg) {
    if (this.websocket_)
      this.websocket_.send(JSON.stringify({'type': 'message', 'data': msg}));
    this.dataChannel_.send(msg);
  },

  close: function() {
    if (this.websocket_)
      this.websocket_.close();
    this.dataChannel_.close();
  },
});
