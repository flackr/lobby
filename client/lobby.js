'use strict';

window.lobby = window.lobby || {};
window.RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
window.RTCSessionDescription = window.RTCSessionDescription || window.webkitRTCSessionDescription || window.mozRTCSessionDescription;
window.RTCIceCandidate = window.RTCIceCandidate || window.webkitRTCIceCandidate || window.mozRTCIceCandidate;

// Polyfill Object.create
Object.create = Object.create || function(proto) {
  var f = function() {};
  f.prototype = proto;
  return new f();
};

lobby.util = {};

lobby.util.extend = function(base, derived) {
  var proto = Object.create(base);
  for (var i in derived)
    proto[i] = derived[i];
  return proto;
}

lobby.util.EventSource = function() {
};

lobby.util.EventSource.prototype = {
  addEventTypes: function(types) {
    if (!this.listeners_)
      this.listeners_ = {};
    for (var i = 0; i < types.length; i++) {
      this.listeners_[types[i]] = [];
    }
  },

  addEventListener: function(type, callback) {
    if (!this.listeners_[type])
      throw new Error("cannot add event listener for unknown type " + type);
    this.listeners_[type].push(callback);
  },

  removeEventListener: function(type, callback) {
    if (!this.listeners_[type])
      throw new Error("cannot remove event listener for unknown type " + type);
    for (var i = this.listeners_[type].length - 1; i >= 0; i--) {
      if (this.listeners_[type][i] == callback) {
        this.listeners_[type].splice(i, 1);
      }
    }
  },

  dispatchEvent: function(type, args) {
    // Call the onX function if defined.
    if (this['on' + type])
      this['on' + type].apply(/* this */ null, /* args */ Array.prototype.slice.call(arguments, 1));
    if (!this.listeners_[type])
      throw new Error("cannot dispatch event listeners for unknown type " + type);
    for (var i = this.listeners_[type].length - 1; i >= 0; i--) {
      this.listeners_[type][i].apply(
          /* this */ null, /* args */ Array.prototype.slice.call(arguments, 1));
    }
  }
};

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
  createSession: function(type) {
    return new lobby.HostSession(this.host_, this.configuration, type);
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

lobby.HostSession = function(host, configuration, type) {
  this.configuration = configuration;
  this.addEventTypes(['open', 'connection', 'close']);
  this.websocket_ = new WebSocket(host + '/new' + (type ? ('/' + type) : ''));
  this.websocket_.addEventListener('message', this.onMessage_.bind(this));
  this.websocket_.addEventListener('close', this.onClose_.bind(this));
  this.clients_ = [];
};

lobby.HostSession.prototype = lobby.util.extend(lobby.util.EventSource.prototype, {
  close: function() {
    this.websocket_.close();
  },
  setDescription: function(data) {
    this.websocket_.send(JSON.stringify({'type': 'desc', 'data': data}));
  },
  onClose_: function() {
    this.dispatchEvent('close');
  },
  onMessage_: function(e) {
    var data = JSON.parse(e.data);
    if (data.host) {
      this.relay_ = data.relay;
      this.dispatchEvent('open', data.host);
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
  this.state = 'connecting';
  this.hostSession_ = hostSession;
  this.clientId_ = clientId;
  this.addEventTypes(['open', 'message', 'close', 'state']);
};

lobby.HostClient.prototype = lobby.util.extend(lobby.util.EventSource.prototype, {
  changeState: function(state) {
    if (state == this.state)
      return;
    this.state = state;
    this.dispatchEvent('state', state);
  },
  connectRelay_: function() {
    this.relay_ = true;
    this.hostSession_.websocket_.send(JSON.stringify({'client': this.clientId_, 'type': 'relay', 'data': true}));
    this.changeState('relay');
    this.dispatchEvent('open');
  },
  onMessage_: function(data) {
    if (data.type == 'offer') {
      this.rtcConnection_ = new RTCPeerConnection(this.hostSession_.configuration, null);
      this.rtcConnection_.ondatachannel = this.onDataChannel_.bind(this);
      this.rtcConnection_.onicecandidate = this.sendIceCandidate_.bind(this);
      this.rtcConnection_.oniceconnectionstatechange = this.onIceConnectionStateChange_.bind(this);
      this.rtcConnection_.setRemoteDescription(new RTCSessionDescription(data.data));
      this.rtcConnection_.createAnswer(this.sendAnswer_.bind(this), function(e) {
        console.log('Failed to create answer');
      });
    } else if (data.type == 'candidate' && this.rtcConnection_.signalingState != 'closed') {
      this.rtcConnection_.addIceCandidate(new RTCIceCandidate(data.data));
    } else if (data.type == 'message') {
      this.dispatchEvent('message', {'data': data.data});
    } else if (data.type == 'close') {
      this.relay_ = false;
      if (!this.isDataChannelConnected_()) {
        if (this.rtcConnection_ && this.rtcConnection_.signalingState != 'closed')
          this.rtcConnection_.close();
        this.changeState('closed');
        this.dispatchEvent('close');
      }
    }
  },
  onIceConnectionStateChange_: function() {
    if (this.rtcConnection_.iceConnectionState == 'disconnected' && !this.relay_)
      this.dispatchEvent('close');
  },
  isDataChannelConnected_: function() {
    return this.dataChannel_ && this.dataChannel_.readyState == 'open' && this.rtcConnection_.iceConnectionState != 'disconnected';
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
    this.dataChannel_ = e.channel;
    this.dataChannel_.addEventListener('message', this.onDataChannelMessage_.bind(this));
    var self = this;
    if (this.dataChannel_.readyState == 'open')
      this.onDataChannelConnected_();
    else
      this.dataChannel_.onopen = this.onDataChannelConnected_.bind(this);
  },
  onDataChannelConnected_: function(channel) {
    if (this.relay_) {
      this.hostSession_.websocket_.send(JSON.stringify({'client': this.clientId_, 'type': 'close', 'data': ''}));
      this.relay_ = false;
      this.changeState('open');
    } else {
      this.changeState('open');
      this.dispatchEvent('open', channel);
    }
  },
  send: function(msg) {
    if (this.dataChannel_ && this.dataChannel_.readyState == 'open')
      this.dataChannel_.send(msg);
    else
      this.hostSession_.websocket_.send(JSON.stringify({'client': this.clientId_, 'type': 'message', 'data': JSON.stringify(msg)}));
  },
  close: function() {
    this.changeState('closed');
    if (this.rtcConnection_)
      this.rtcConnection_.close();
    if (this.relay_)
      this.hostSession_.websocket_.send(JSON.stringify({'client': this.clientId_, 'type': 'close', 'data': ''}));
  }
});

lobby.ClientSession = function(host, identifier, configuration) {
  this.state = 'connecting';
  this.configuration = configuration;
  this.addEventTypes(['open', 'message', 'close', 'state']);
  if (window.RTCPeerConnection) {
    this.rtcConnection_ = new RTCPeerConnection(this.configuration, null);
    this.dataChannel_ = this.rtcConnection_.createDataChannel('data', null);
    this.dataChannel_.addEventListener('open', this.onDataChannelConnected_.bind(this, this.dataChannel_));
    this.dataChannel_.addEventListener('message', this.onDataChannelMessage_.bind(this));
    this.rtcConnection_.onicecandidate = this.onIceCandidate_.bind(this);
    this.rtcConnection_.oniceconnectionstatechange = this.onIceConnectionStateChange_.bind(this);
  }
  this.websocket_ = new WebSocket(host + '/' + identifier);
  this.websocket_.addEventListener('open', this.onOpen_.bind(this));
  this.websocket_.addEventListener('message', this.onMessage_.bind(this));
  this.websocket_.addEventListener('close', this.onWebSocketClose_.bind(this));
}

lobby.ClientSession.prototype = lobby.util.extend(lobby.util.EventSource.prototype, {
  changeState: function(state) {
    if (state == this.state)
      return;
    this.state = state;
    this.dispatchEvent('state', state);
  },
  onOpen_: function() {
    if (this.rtcConnection_) {
      this.rtcConnection_.createOffer(this.onOffer_.bind(this), function(e) {
        console.log('Failed to create offer');
      });
    }
  },
  onOffer_: function(desc) {
    this.rtcConnection_.setLocalDescription(desc);
    if (this.websocket_)
      this.websocket_.send(JSON.stringify({'type' : 'offer', 'data' : desc}));
  },
  onIceCandidate_: function(event) {
    if (event.candidate && this.websocket_)
      this.websocket_.send(JSON.stringify({'type' : 'candidate', 'data' : event.candidate}));
  },
  onMessage_: function(e) {
    var data = JSON.parse(e.data);
    if (data.type == 'answer' && this.rtcConnection_.signalingState != 'closed')
      this.rtcConnection_.setRemoteDescription(new RTCSessionDescription(data.data));
    else if (data.type == 'candidate' && this.rtcConnection_.signalingState != 'closed')
      this.rtcConnection_.addIceCandidate(new RTCIceCandidate(data.data));
    else if (data.type == 'message')
      this.dispatchEvent('message', {'data': JSON.parse(data.data)});
    else if (data.type == 'relay') {
      this.relay_ = true;
      this.changeState('relay');
      this.dispatchEvent('open');
    } else if (data.type == 'close') {
      this.websocket_.close();
      this.onWebSocketClose_();
    }
  },
  onWebSocketClose_: function() {
    delete this.websocket_;
    if (!this.isDataChannelConnected_()) {
      this.dispatchEvent('close');
      if (this.rtcConnection_ && this.rtcConnection_.signalingState != 'closed')
        this.rtcConnection_.close();
    }
  },
  onDataChannelConnected_: function(channel) {
    this.changeState('open');
    if (!this.relay_)
      this.dispatchEvent('open', channel);
  },

  onDataChannelMessage_: function(e) {
    this.dispatchEvent('message', e);
  },
  
  onIceConnectionStateChange_: function() {
    if (this.rtcConnection_.iceConnectionState == 'disconnected' && !this.relay_)
      this.dispatchEvent('close');
  },
  
  isDataChannelConnected_: function() {
    return this.dataChannel_ && this.dataChannel_.readyState == 'open' && this.rtcConnection_.iceConnectionState != 'disconnected';
  },

  send: function(msg) {
    if (this.dataChannel_ && this.dataChannel_.readyState == 'open')
      this.dataChannel_.send(msg);
    else if (this.websocket_)
      this.websocket_.send(JSON.stringify({'type': 'message', 'data': msg}));
    else
      throw new Error('Trying to send message while not connected');
  },

  close: function() {
    this.rtcConnection_.close();
    if (this.websocket_) {
      this.websocket_.close();
      delete this.websocket_;
    }
  },
});
