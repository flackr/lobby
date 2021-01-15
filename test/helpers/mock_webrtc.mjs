import {MockEvent, MockEventTarget} from './mock_event_target.mjs';

const OFFER_STR = 'offer-';
const ANSWER_STR = 'answer-';
const CANDIDATE_STR = 'candidate-';

class MockRTCSessionDescription {
  constructor(desc) {
    this.description = desc.description;
  }
};

class MockRTCIceCandidate {
  constructor(cand) {
    this.candidate = cand.candidate;
  }
}

class MockWebRTC {
  constructor(global) {
    this._global = global;
    this._nextOffer = 1;
    this._nextCandidate = 1;
    this._originals = {
      RTCPeerConnection: global.RTCPeerConnection,
      RTCDataChannel: global.RTCDataChannel,
      RTCSessionDescription: global.RTCSessionDescription,
      RTCIceCandidate: global.RTCIceCandidate,
    };
    // Map of ICE candidates to peers.
    this._peers = {};
  }

  install() {
    let self = this;
    const DATA_CHANNEL_EVENTS = ['open', 'message'];
    class MockRTCDataChannel extends MockEventTarget {
      constructor(peerConnection, label, options) {
        super(DATA_CHANNEL_EVENTS);
        this.readyState = 'connecting';
        this.id = Math.floor(Math.random() * 65535);
        if (options && options.id)
          this.id = options.id;
        this.label = label;
        this._peerConnection = peerConnection;
        this._options = options;
        this._remote = null;
      }

      send(data) {
        if (!this._remote) {
          throw new Error('Attempted to send data on disconnected datachannel');
        }
        let evt = new MockEvent('message');
        evt.data = data;
        // TODO: Make delay configurable.
        self._global.setTimeout(this._remote.dispatchEvent.bind(this._remote, evt), 0);
      }
    };

    const PEER_CHANNEL_EVENTS = ['datachannel', 'icecandidate'];
    class MockRTCPeerConnection extends MockEventTarget {
      constructor(configuration) {
        super(PEER_CHANNEL_EVENTS);
        this.localDescription = null;
        this.remoteDescription = null;
        this.connectionState = 'new';
        this._configuration = configuration;
        this._dataChannels = {};
        this._localCandidates = [];
        this._remoteCandidates = [];
        this._remote = null;
        self._global.setTimeout(this._generateCandidate.bind(this), 0);
      }

      async createOffer() {
        let offer = OFFER_STR + (self._nextOffer++);
        return new MockRTCSessionDescription({description: offer});
      }

      async createAnswer() {
        let answer = ANSWER_STR + this.remoteDescription.description.substring(OFFER_STR.length);
        return new MockRTCSessionDescription({description: answer});
      }

      async setLocalDescription(desc) {
        this.localDescription = desc;
        this._maybeConnect();
      }

      async setRemoteDescription(desc) {
        this.remoteDescription = desc;
        this._maybeConnect();
      }

      addIceCandidate(candidate) {
        this._remoteCandidates.push(candidate);
        this._maybeConnect();
      }

      createDataChannel(label, options) {
        let dc = new MockRTCDataChannel(this, label, options);
        this._dataChannels[dc.id] = dc;
        return dc;
      }

      _generateCandidate() {
        let candidate = CANDIDATE_STR + (self._nextCandidate++);
        this._localCandidates.push(candidate);
        self._peers[candidate] = this;
        let evt = new MockEvent('icecandidate');
        evt.candidate = new MockRTCIceCandidate({candidate});
        this.dispatchEvent(evt);
      }

      _canConnect(peer) {
        // Only one connection.
        if (this._remote)
          return false;
        if (!this.localDescription || !this.remoteDescription ||
            this._localCandidates.length == 0 || this._remoteCandidates.length == 0) {
          return false;
        }
        if (!peer)
          return true;

        // Check descriptions.
        if (this.remoteDescription.description != peer.localDescription.description)
          return false;
        if (peer.remoteDescription.description != this.localDescription.description)
          return false;

        // Check for a connectable ice candidate.
        for (let cand of this._remoteCandidates) {
          for (let lcand of peer._localCandidates) {
            if (cand.candidate == lcand.candidate)
              return true;
          }
        }
      }

      _maybeConnect() {
        if (!this._canConnect())
          return;

        // Find a remote
        let peer = null;
        for (let cand of this._remoteCandidates) {
          peer = self._peers[cand.candidate];
          if (!peer)
            continue;
          if (peer._canConnect(this))
            break;
        }

        // Initiate connection.
        this._connect(peer, true);
      }

      _connect(peer, initial) {
        this.connectionState = 'connected';
        this._remote = peer;

        if (initial)
          peer._connect(this, false);
        
        for (let channelId in this._dataChannels) {
          if (this._dataChannels[channelId]._remote)
            continue;
          let dc = this._dataChannels[channelId];

          // TODO: Only re-use channel with matching id.
          let remoteDc = peer._dataChannels[channelId];
          let dispatchEvent = false;
          // If this data channel doesn't exist in the remote, create it.
          if (!remoteDc) {
            remoteDc = peer._dataChannels[channelId] = new MockRTCDataChannel(peer, dc.label, {...dc._options, id: channelId});
            dispatchEvent = true;
          }

          // Connect the channels.
          remoteDc._remote = dc;
          remoteDc.readyState = 'open';
          dc._remote = remoteDc;
          dc.readyState = 'open';

          // Dispatch events.
          let evt;
          if (dispatchEvent) {
            evt = new MockEvent('datachannel');
            evt.channel = remoteDc;
            peer.dispatchEvent(evt);
          }
          evt = new MockEvent('open');
          dc.dispatchEvent(evt);
          remoteDc.dispatchEvent(evt);
        }
      }
    };

    this._global.RTCPeerConnection = MockRTCPeerConnection;
    this._global.RTCSessionDescription = MockRTCSessionDescription;
    this._global.RTCIceCandidate = MockRTCIceCandidate;
  }

  uninstall() {
    this._global.RTCPeerConnection = this._originals.RTCPeerConnection;
    this._global.RTCSessionDescription = this._originals.RTCSessionDescription;
    this._global.RTCIceCandidate = this._originals.RTCIceCandidate;
  }

};

export default MockWebRTC;