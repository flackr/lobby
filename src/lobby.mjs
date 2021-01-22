// Copyright 2019 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

const isSafari = globalThis.navigator && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

class SyntheticEventTarget {
  constructor() {
    this._handlers = {};
  }

  addEventListener(type, fn) {
    this._handlers[type] = this._handlers[type] || [];
    let handlers = this._handlers[type];
    if (handlers.indexOf(fn) == -1)
      handlers.push(fn);
  }

  removeEventListener(type, fn) {
    let handlers = this._handlers[type];
    if (!handlers)
      return;
    let index = handlers.indexOf(fn);
    if (index == -1)
      return;
    handlers.splice(index, 1);
  }

  dispatchEvent(event) {
    let handlers = this._handlers[event.type];
    if (!handlers)
      return;
    for (let handler of handlers) {
      handler.apply(null, [event]);
    }
  }
};

export class MatrixError extends Error {
  constructor(json) {
    super(json.errcode + ': ' + json.error);
    this.errcode = json.errcode;
    this.error = json.error;
    this.details = json;
  }
}

export async function createService(options) {
  return new Service(options);
}

function parse_user_id(user_id) {
  const userPattern = /^@([^:]*):(.*)$/;
  let m = user_id.match(userPattern);
  if (!m)
    throw Error('user_id must match pattern @<user>:<matrix-host>');
  return {
    'username': m[1],
    'host': 'https://' + m[2],
  };
}

function clone(json) {
  return JSON.parse(JSON.stringify(json));
}

function keys(dict) {
  let val = [];
  for (let key in dict)
    val.push(key);
  return val;
}

function gatherIceCandidates(peerConnection) {
  return new Promise((resolve) => {
    let candidates = [];
    function addIceCandidate(evt) {
      if (evt.candidate)
        candidates.push(evt.candidate);
    }
    function gatheringStateChange() {
      if (peerConnection.iceGatheringState != 'complete')
        return;
      peerConnection.removeEventListener('icecandidate', addIceCandidate);
      peerConnection.removeEventListener('icegatheringstatechange', gatheringStateChange);
      resolve(candidates);
    }
    peerConnection.addEventListener('icecandidate', addIceCandidate);
    peerConnection.addEventListener('icegatheringstatechange', gatheringStateChange);
  });
}

const USER_AUTH_KEY = 'com.github.flackr.lobby.User';
class Service {
  constructor(options) {
    this.options_ = options || {};
    this.options_.defaultHost = this.options_.defaultHost || 'https://matrix.org';
    // Set a default app name of the URL.
    this.options_.appName = this.options_.appName || (window.location.origin + window.location.pathname);
    this.options_.globals = this.options_.globals || globalThis;
    this.options_.webRtcConfig = this.options_.webRtcConfig || {
      iceServers: [
          {urls: "stun:stun.l.google.com:19302"},
      ],
    };
    this.options_.timeout = this.options_.timeout || 30000;
    this.client_ = null;
  }

  async fetchJson(url, options, params, data) {
    if (params) {
      if (url.indexOf('?') == -1)
        url += '?';
      for (let k in params) {
        let val = params[k];
        if (val instanceof Object)
          val = JSON.stringify(val);
        if (!url.endsWith('?'))
          url += '&';
        url += encodeURIComponent(k) + '=' + encodeURIComponent(val)
      }
    }
    if (options.method != 'GET') {
      options.headers = options.headers || {};
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(data || {});
    }
    let success = false;
    let response;
    let tries = 0;
    while (!success && tries < 3) {
      ++tries;
      try {
        response = await this.options_.globals.fetch(url, options);
        success = true;
      } catch (e) {
        console.error(e);
      }
    }
    if (!response) {
      throw new Error('No response');
    }
    let json = await response.json();
    if (response.status >= 400 && response.status < 500 && json.errcode)
      throw new MatrixError(json);
    return json;
  }  

  async reauthenticate() {
    let userJson = this.options_.globals.localStorage.getItem(USER_AUTH_KEY);
    if (!userJson)
      return null;
    let user = JSON.parse(userJson);
    // TODO: Verify access token?
    return this.client = new Client(this, user, user.type, user.host);
  }

  async login(user_id, password) {
    let parsed = user_id.startsWith('@') ? parse_user_id(user_id) : {
      username: user_id,
      host: this.options_.defaultHost,
    };
    let username = parsed.username;
    let user = await this.fetchJson(parsed.host + '/_matrix/client/r0/login', {'method': 'POST'}, null, {
      'type': 'm.login.password',
      'identifier': {
        'type': 'm.id.user',
        'user': username,
      },
      'password': password,
      'initial_device_display_name': 'Lobby Client',
    });
    // TODO: Verify access token?
    return this.client = new Client(this, user, 'user', parsed.host);
  }

  async register(user_id, password) {
    let user;
    let parsed = user_id.startsWith('@') ? parse_user_id(user_id) : {
      username: user_id,
      host: this.options_.defaultHost,
    };
    let username = parsed.username;
    let params = {
      'username': username,
      'password': password,
      'initial_device_display_name': 'Lobby Client',
    };
    let attempts = 0;
    while(true) {
      attempts++;
      let result = await this.fetchJson(parsed.host + '/_matrix/client/r0/register', {'method': 'POST'}, null, params);
      // Success
      if (result.access_token) {
        user = result;
        break;
      }
      if (attempts >= 2)
        throw Error('Failed to register after dummy authentication');
      // Search for a dummy auth flow
      // TODO: Support m.login.email.identity authentication flow.
      let i = 0;
      for (i = 0; i < result.flows.length; i++) {
        if (result.flows[i].stages.length == 1 && result.flows[i].stages[0] == 'm.login.dummy') {
          break;
        }
      }
      if (i == result.flows.length)
        throw Error('Matrix server does not support password only registration.');
      params.auth = {
        session: result.session,
        type: 'm.login.dummy',
      };
    }
    // TODO: Verify access token?
    return this.client = new Client(this, user, 'user');
  }

  async loginAsGuest(host) {
    let user = await this.fetchJson((host || this.options_.defaultHost) + '/_matrix/client/r0/register', {'method': 'POST'}, {'kind': 'guest'});
    // TODO: Verify access token?
    return this.client = new Client(this, user, 'guest');
  }

  set client(newClient) {
    let oldClient = this.client_;
    this.client_ = newClient;

    // Only one client should be logged in at a time. Note, we log out the
    // client after replacing the new client so that it doesn't recursively
    // invoke set client(null).
    if (oldClient)
      oldClient.logout();

    if (this.client_) {
      this.options_.globals.localStorage.setItem(USER_AUTH_KEY, JSON.stringify({
        'access_token': this.client_.access_token,
        'user_id': this.client_.user_id,
        'type': this.client_.type,
        'host': this.client_.host_,
      }));
    } else {
      this.options_.globals.localStorage.removeItem(USER_AUTH_KEY);
    }
    return this.client_;
  }

  get client() {
    return this.client_;
  }
};

class Client {
  constructor(service, user, userType, host) {
    this.service_ = service;
    this.access_token = user.access_token;
    this.user_id = user.user_id;
    this.type = userType;

    // Set a default app name of the URL.
    this.txnCtr_ = 0;
    let parsed = parse_user_id(this.user_id);
    this.host_ = host || parsed.host;
    this.lobby_ = null;
  }

  async lobby() {
    if (!this.service_.options_.lobbyRoom)
      return null;
    if (!this.lobby_)
      this.lobby_ = await new Lobby(this, this.service_.options_.lobbyRoom);
    await this.lobby_.join();
    return this.lobby_;
  }

  logout() {
    if (this.service_ && this.service_.client == this) {
      // Invoking this setter will recusively log out this client.
      this.service_.client = null;
      this.service_ = null;
      return;
    }

    if (!this.access_token)
      return;
    // Log out of the current user if one is logged in. Don't wait for these
    // responses to avoid slowing down the logout request.
    if (this.type == 'guest') {
      // When logging out of a "guest" account, we will never be able to log
      // back in so it seems the nice thing to do is deactivate the account.
      this.fetch('/_matrix/client/r0/account/deactivate', 'POST');
    } else if (this.user_id) {
      this.fetch('/_matrix/client/r0/logout', 'POST');
    }
    this.access_token = '';
  }

  async fetch(url, method, params, data) {
    return this.service_.fetchJson(this.host_ + url,
        {
          'method': method,
          'headers': {'Authorization': 'Bearer ' + this.access_token}
        },
        params, data);
  }

  async joinedRoomStates(stateTypes) {
    let response = await this.fetch('/_matrix/client/r0/sync?', 'GET', {
      'filter': {
        'room': {
          'state': {
            'types': ['m.room.topic',
                      'com.github.flackr.lobby.Game'],
          },
          'timeline': {
            'types': [],
          },
        },
      },
    });
    let rooms = response.rooms.join;
    let result = {};
    for (let roomid in rooms) {
      let roomDetails = {};
      let states = rooms[roomid].state.events;
      for (let i = 0; i < states.length; i++) {
        roomDetails[states[i].type] = states[i].content;
      }
      // Filter only rooms matching the current app name.
      if (roomDetails['com.github.flackr.lobby.Game'] &&
          roomDetails['com.github.flackr.lobby.Game'].tag == this.service_.options_.appName) {
        result[roomid] = roomDetails;
      }
    }
    return result;
  }

  // This allows you to interact with a room without explicitly joining it.
  view(roomId) {
    return new Room(this, roomId);
  }

  async join(roomIdOrAlias, isExperimental) {
    let room = isExperimental ?
        new RTCRoom(this, roomIdOrAlias) :
        new Room(this, roomIdOrAlias);
    await room.join();
    return room;
  }

  async create(details) {
    details = details || {};
    let creationDetails = {
      'visibility': 'private', /* These are specialized rooms not for chat. */
      'preset': 'public_chat', /* Invitation-only rooms not yet supported. */
      'name': details.name || 'Unnamed',
      'topic': details.topic || 'Default Lobby Topic',
      'initial_state': [
        { 'type': 'com.github.flackr.lobby.Game',
          'content': {
            // The URL is used to identify the same app.
            'url': globalThis.location && (globalThis.location.origin + globalThis.location.pathname) || 'unknown',
            // In the future, this can be used to identify the same app hosted
            // from different locations.
            // TODO: Consider a default of turning the location into a Java-like
            // package name and using this as the namespace for event types
            // instead of lobby types as above.
            'tag': this.service_.options_.appName,
          }},

        // TODO: Support registered-user only games.
        { 'type': 'm.room.guest_access', 'content': {'guest_access': 'can_join'}},

        // World readability history_visibility to allow guests to preview
        // room states.
        { 'type': 'm.room.history_visibility', 'content': {'history_visibility': 'world_readable'}},
      ],
    };
    if (details.initial_state) {
      for (let i = 0; i < details.initial_state.length; i++)
        creationDetails.initial_state.push(details.initial_state[i]);
    }
    let room_id = (await this.fetch('/_matrix/client/r0/createRoom', 'POST', null, creationDetails)).room_id;
    // TODO: Automatically post an event to the lobby if one exists.
    return room_id;
  }

  /**
   * Generates a transactionId.
   */
  makeTxnId() {
    return "m" + new Date().getTime() + "." + (this.txnCtr_++);
  };
}

class Room {
  constructor(client, room_id) {
    this.client_ = client;
    this.room_id = room_id;
    this.timeout_ = this.client_.service_.options_.timeout;
    this.joined = false;
    this.initialSync_ = true;
    this.state_ = new RoomState();
    this.syncParams_ = {
      'filter': {
        'room': {
          'rooms': [this.room_id],
        },
      },
    };
  }

  get connected() {
    return this.client_.access_token;
  }

  async join() {
    let params = {};
    const serverPattern = /^!([^:]*):(.*)$/;
    let m = this.room_id.match(serverPattern);
    if (m)
      params.server_name = m[2];
    let response = await this.client_.fetch('/_matrix/client/r0/join/' + encodeURI(this.room_id), 'POST', params);

    // Joining an alias reveals the internal room id which is used for other
    // API calls.
    this.room_id = response.room_id;
    this.joined = true;

    return {
      'username': m[1],
      'host': 'https://' + m[2],
    };
  }

  async leave() {
    let response = await this.client_.fetch('/_matrix/client/r0/rooms/' + encodeURI(this.room_id) + '/leave', 'POST');
  }

  async members() {
    return (await this.client_.fetch('/_matrix/client/r0/rooms/' + encodeURI(this.room_id) + '/members', 'GET')).chunk;
  }

  setTimelineTypes(types) {
    this.syncParams_.filter.room.timeline.types = types;
  }

  setStateTypes(types) {
    this.syncParams_.filter.room.state.types = types;
  }

  async sync() {
    let response = await this.client_.fetch('/_matrix/client/r0/sync?', 'GET',
        this.syncParams_);
    this.syncParams_.since = response.next_batch;
    let roomDetails = response.rooms.join[this.room_id];
    if (roomDetails)
      this.state_.process(roomDetails.state.events);
    let result = {
      ephemeral: roomDetails ? roomDetails.ephemeral.events : [],
      state: roomDetails ? roomDetails.state.events : [],
      timeline: roomDetails ? roomDetails.timeline.events : [],
    };
    if (roomDetails && this.initialSync_) {
      let prev_batch = roomDetails.timeline.prev_batch;
      // Fetch all events
      let params = clone(this.syncParams_);
      params.dir = 'b';
      while (prev_batch) {
        params.from = prev_batch;
        response = await this.client_.fetch('/_matrix/client/r0/rooms/' + encodeURI(this.room_id) + '/messages', 'GET',
            params);
        if (response.chunk.length == 0)
          break;
        // TODO: There may be a more efficient way to build this array.
        result.timeline = response.chunk.reverse().concat(result.timeline);
        prev_batch = response.end;
      }
    }
    this.syncParams_.timeout = this.timeout_;
    this.initialSync_ = false;
    return result;
  }

  // Deprecated
  async fetchEvents() {
    return (await this.sync()).timeline;
  }

  async sendEvent(eventType, content) {
    let txnId = this.client_.makeTxnId();
    let response = await this.client_.fetch('/_matrix/client/r0/rooms/' +
        encodeURI(this.room_id) + '/send/' + encodeURI(eventType) + '/' +
        encodeURI(txnId), 'PUT', null, content);
    return response.event_id;
  }

  async state() {
    if (!this.joined && this.state_.empty) {
      let events = await this.client_.fetch('/_matrix/client/r0/rooms/' + encodeURI(this.room_id) + '/state', 'GET');
      this.state_.process(events);
    }
    return this.state_;
  }

  async sendTyping() {
    let response = await this.client_.fetch('/_matrix/client/r0/rooms/' +
        encodeURI(this.room_id) + '/typing/' + encodeURI(this.client_.user_id), 'PUT', null, {
          typing: true,
          timeout: 30000,
        });
  }
};

class RoomState {
  constructor(events) {
    this.reset();
  }

  reset() {
    this.empty = true;
    this.state = {};
  }

  process(events) {
    this.empty = false;
    // TODO: Return a list of state changes for listeners.
    for (let i = 0; i < events.length; i++) {
      if (events[i].state_key) {
        this.state[events[i].type] = this.state[events[i].type] || {};
        this.state[events[i].type][events[i].state_key] = events[i];
      } else {
        this.state[events[i].type] = events[i];
      }
    }
  }

  activeMembers() {
    let members = {};
    for (let key in this.state['m.room.member']) {
      let details = this.state['m.room.member'][key];
      if (details.content.membership == 'join') {
        members[details.user_id] = {
          displayname: details.content.displayname,
        };
      }
    }
    return members;
  }
};

const ANNOUNCE_EVENT = 'com.github.flackr.lobby.Announce';
const OFFER_EVENT = 'com.github.flackr.lobby.Offer';
const ANSWER_EVENT = 'com.github.flackr.lobby.Answer';

class RTCRoom extends SyntheticEventTarget {
  constructor(client, room_id) {
    super();
    this._client = client;
    this._connected = true;
    this._uid = Math.floor(Math.random() * 10000000) + 1;
    this._room = new Room(client, room_id);
    // TODO: Implement a way to sync history later in case we need to.
    this._room.initialSync_ = false;
    this._peers = {};
    this._seenSelf = false;
    // state -> ['connecting', 'loading', ]
    // track details like connected peers, pings.
  }

  async join() {
    if (isSafari) {
      // Awful hack to get access to local ICE candidates.
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    }
    let response = await this._room.join();
    // If no one typing, become master:
    // - Send master message (Just to break ties?)
    // - Sync history
    // - Accept connections

    // Otherwise, request connection from master.
    // - If no one connects, become master
    // - On connection, connect all peers
    this._room.sendEvent(ANNOUNCE_EVENT, {
      uid: this._uid});
    this._room.sendTyping();
    this.process();
    return response;
  }

  async process() {
    while (true) {
      let events = await this._room.sync();
      if (!this._connected)
        return;
      for (let evt of events.timeline) {
        if (evt.type == ANNOUNCE_EVENT) {
          if (evt.content.uid == this._uid) {
            // Once you see your own announcement, connect to others.
            this._seenSelf = true;
          } else if (this._seenSelf) {
            this.initiateConnection(evt.sender, evt.content.uid);
          }
        } else if (evt.type == OFFER_EVENT && evt.content.dest == this._uid) {
          this.acceptOffer(evt.sender, evt.content.uid, evt);
        } else if (evt.type == ANSWER_EVENT && evt.content.dest == this._uid) {
          this.acceptAnswer(evt.sender, evt.content.uid, evt);
        }
      }
    }
  }

  createPeerConnection(user_id, uid, initiator) {
    let mapStr = user_id + '-' + uid;
    if (this._peers[mapStr])
      return this._peers[mapStr];
    let peer = new this._client.service_.options_.globals.RTCPeerConnection(this._client.service_.options_.webRtcConfig)
    const self = this;
    peer.addEventListener('iceconnectionstatechange', (evt) => {
      let dstrstate = self._peers[mapStr].reliable ? self._peers[mapStr].reliable.readyState : 'N/A';
      console.log('iceconnectionstate for ' + mapStr + ' is ' + peer.iceConnectionState + ' dataChannel readyState is ' + dstrstate);
    });
    this._peers[mapStr] = {
      user_id,
      peer,
      reliable: null,
      unreliable: null,
    };

    if (initiator) {
      let dc = peer.createDataChannel('main');
      dc.addEventListener('open', connectDataChannel.bind(null, dc));
    } else {
      peer.addEventListener('datachannel', (evt) => {
        connectDataChannel(evt.channel);
      });
    }

    function connectDataChannel(channel) {
      self._peers[mapStr].reliable = channel;
      self.dispatchEvent({type: 'connection', user_id, channel});
      channel.addEventListener('message', (evt) => {
        self.dispatchEvent({type: 'message', user_id, event: evt, data: evt.data});
      });
      channel.addEventListener('close', () => {
        console.log('datachannel for ' + mapStr + ' closed.');
      });
      channel.addEventListener('error', () => {
        console.log('datachannel for ' + mapStr + ' errored.');
      });
    }

    return peer;
  }

  // Initiate a connection with (user_id, uid).
  async initiateConnection(user_id, uid) {
    // Initialize webrtc and make connection.
    let peer = this.createPeerConnection(user_id, uid, true);
    let offer = await peer.createOffer();
    peer.setLocalDescription(offer);
    let candidates = await gatherIceCandidates(peer);
    this._room.sendEvent(OFFER_EVENT, {offer, candidates, uid: this._uid, dest: uid});
  }

  async acceptOffer(user_id, uid, evt) {
    let peer = this.createPeerConnection(user_id, uid, false);
    peer.setRemoteDescription(new this._client.service_.options_.globals.RTCSessionDescription(evt.content.offer));
    let answer = await peer.createAnswer();
    peer.setLocalDescription(answer);
    let candidates = await gatherIceCandidates(peer);
    for (let i = 0; i < evt.content.candidates.length; i++) {
      peer.addIceCandidate(new this._client.service_.options_.globals.RTCIceCandidate(evt.content.candidates[i]));
    }
    this._room.sendEvent(ANSWER_EVENT, {answer, candidates, uid: this._uid, dest: uid});
  }

  async acceptAnswer(user_id, uid, evt) {
    let mapStr = user_id + '-' + uid;
    let peer = this._peers[mapStr].peer;
    peer.setRemoteDescription(new this._client.service_.options_.globals.RTCSessionDescription(evt.content.answer));
    for (let i = 0; i < evt.content.candidates.length; i++) {
      peer.addIceCandidate(new this._client.service_.options_.globals.RTCIceCandidate(evt.content.candidates[i]));
    }
  }

  send(msg) {
    this.dispatchEvent({type: 'message', user_id: this._room.client_.user_id, event: {data: msg}, data: msg});
    for (let peerid in this._peers) {
      let channel = this._peers[peerid].reliable;
      if (!channel || channel.readyState != 'open')
        continue;
      this._peers[peerid].reliable.send(msg);
    }
  }

  quit() {
    this._conected = false;
  }

  sync() {
    return this._room.sync();
  }
}

class Lobby extends Room {
  constructor(client, room_id) {
    super(client, room_id);
    // If true, cleans up obsolete rooms while iterating through room listings.
    this.cleanup_ = true;
    this.initialFetch_ = true;
    this.rooms = {};
    this.roomCount = 0;
    // Add API to add whatever states should be synced when fetching room states.
    this.syncStates_ = ['m.room.topic', 'com.github.flackr.lobby.Game'];
    this.prev_batch = '';
    this.next_bacth = '';
    this.fetchAmount_ = 20;
    this.lobbySyncParams_ = {
      'filter': {
        'room': {
          'rooms': [this.room_id],
          'state': {
            'types': [],
          },
          // Using a filter seems to break the prev_batch token.
          'timeline': {},
        },
      },
    };
  }

  async advertise(room) {
    let event = room;
    event.msgtype = 'm.text';
    event.body = 'Created game at ' + room.url;
    event.tag = this.client_.service_.options_.appName;
    // TODO: Replace m.room.message with custom event type.
    await this.sendEvent('m.room.message', event);
  }

  // Returns an array of rooms and sets prev_batch and next_batch to fetch
  // more rooms in either direction.
  async syncRooms(backwards) {
    let events = null;
    if (backwards) {
      // Investigate why we're duplicating initial results.
      if (this.initialFetch_) {
        throw new Error('No prev_batch token yet, sync in forwards direction first');
      }
      // TODO: Fetch messages backwards.
      let params = clone(this.lobbySyncParams_);
      params.from = this.prev_batch;
      params.dir = 'b';
      params.limit = this.fetchAmount_;
      let response = await this.client_.fetch('/_matrix/client/r0/rooms/' + encodeURI(this.room_id) + '/messages', 'GET',
          params);
      this.prev_batch = response.end;
      events = response.chunk;
      if (events.length == 0)
        return null;
    } else {
      let params = clone(this.lobbySyncParams_);
      if (this.next_batch) {
        params.since = this.next_batch;
        params.timeout = this.timeout_;
      } else {
        params.filter.room.timeline.limit = this.fetchAmount_;
      }
      let response = await this.client_.fetch('/_matrix/client/r0/sync?', 'GET', params);
      this.next_batch = response.next_batch;
      this.syncParams_.timeout = this.timeout_;
      let roomDetails = response.rooms.join[this.room_id];
      // Save the prev_batch token for enumerating backwards events.
      if (this.initialFetch_) {
        this.initialFetch_ = false;
        if (roomDetails)
          this.prev_batch = roomDetails.timeline.prev_batch;
      }
      events = roomDetails && roomDetails.timeline.events || [];
    }

    // For each room, fetch information about the room. This loop creates the
    // promises and the following loop awaits them to allow the fetches to be
    // run simultaneously.
    let game_promises = [];
    for (let i = 0; i < events.length; i++) {
      if (events[i].content.tag != this.client_.service_.options_.appName ||
          !events[i].content.room_id)
        continue;
      game_promises.push({
          event: events[i],
          room: this.gameInfo(events[i].content.room_id)});
    }
    let games = [];
    for (let i = 0; i < game_promises.length; i++) {
      let remove = false;
      try {
        let room = await game_promises[i].room;
        if (keys(room.state_.activeMembers()).length > 0) {
          games.push(room);
        } else {
          // Remove empty rooms
          remove = true;
        }
      } catch (e) {
        console.warn('Skipping game due to error fetching details', e);
      }
      if (remove) {
        let event = game_promises[i].event;
        let txnId = this.client_.makeTxnId();
        this.client_.fetch('/_matrix/client/r0/rooms/' + encodeURI(this.room_id) + '/redact/' + encodeURI(event.event_id) + '/' + encodeURI(txnId), 'PUT');
      }
    }
    return games;
  }

  async gameInfo(room_id) {
    let room = this.client_.view(room_id);
    // Await room details.
    await room.state();
    return room;
  }
}