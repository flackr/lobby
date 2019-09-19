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

export class MatrixError extends Error {
  constructor(json) {
    super(json.errcode + ': ' + json.error);
    this.errcode = json.errcode;
    this.error = json.error;
    this.details = json;
  }
}

async function fetchJson(url, options, params, data) {
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
  let response = await fetch(url, options);
  let json = await response.json();
  if (response.status >= 400 && response.status < 500 && json.errcode)
    throw new MatrixError(json);
  return json;
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

const USER_AUTH_KEY = 'com.github.flackr.lobby.User';
class Service {
  constructor(options) {
    this.options_ = options || {};
    this.options_.defaultHost = this.options_.defaultHost || 'https://matrix.org';
    // Set a default app name of the URL.
    this.options_.appName = this.options_.appName || (window.location.origin + window.location.pathname);
    this.client_ = null;
  }

  async reauthenticate() {
    let userJson = localStorage.getItem(USER_AUTH_KEY);
    if (!userJson)
      return null;
    let user = JSON.parse(userJson);
    // TODO: Verify access token?
    return this.client = new Client(this, user, user.type);
  }

  async login(user_id, password) {
    let parsed = user_id.startsWith('@') ? parse_user_id(user_id) : {
      username: user_id,
      host: this.options_.defaultHost,
    };
    let username = parsed.username;
    let user = await fetchJson(parsed.host + '/_matrix/client/r0/login', {'method': 'POST'}, null, {
      'type': 'm.login.password',
      'identifier': {
        'type': 'm.id.user',
        'user': username,
      },
      'password': password,
      'initial_device_display_name': 'Lobby Client',
    });
    // TODO: Verify access token?
    return this.client = new Client(this, user, 'user');
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
      let result = await fetchJson(parsed.host + '/_matrix/client/r0/register', {'method': 'POST'}, null, params);
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
    let user = await fetchJson((host || this.options_.defaultHost) + '/_matrix/client/r0/register', {'method': 'POST'}, {'kind': 'guest'});
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
      localStorage.setItem(USER_AUTH_KEY, JSON.stringify({
        'access_token': this.client_.access_token,
        'user_id': this.client_.user_id,
        'type': this.client_.type,
      }));
    } else {
      localStorage.removeItem(USER_AUTH_KEY);
    }
    return this.client_;
  }

  get client() {
    return this.client_;
  }
};

class Client {
  constructor(service, user, userType) {
    this.service_ = service;
    this.access_token = user.access_token;
    this.user_id = user.user_id;
    this.type = userType;

    // Set a default app name of the URL.
    this.txnCtr_ = 0;
    let parsed = parse_user_id(this.user_id);
    this.host_ = parsed.host;
    this.lobby_ = null;
  }

  async lobby() {
    if (!this.service_.options_.lobbyRoom)
      return null;
    if (!this.lobby_)
      this.lobby_ = await new Lobby(this, this.service_.options_.lobbyRoom);
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
    return fetchJson(this.host_ + url,
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

  async join(roomIdOrAlias) {
    let room = new Room(this, roomIdOrAlias);
    await room.join();
    return room;
  }

  async create() {
    let room_id = (await this.fetch('/_matrix/client/r0/createRoom', 'POST', null, {
      'visibility': 'private', /* These are specialized rooms not for chat. */
      'preset': 'public_chat', /* Invitation-only rooms not yet supported. */
      'name': 'WebGame', /* TODO: Support customization. */
      'topic': 'WebGame game session', /* TODO: Support customization. */
      'initial_state': [
        { 'type': 'com.github.flackr.lobby.Game',
          'content': {
            // The URL is used to identify the same app.
            'url': window.location.origin + window.location.pathname,
            // In the future, this can be used to identify the same app hosted
            // from different locations.
            // TODO: Consider a default of turning the location into a Java-like
            // package name and using this as the namespace for event types
            // instead of lobby types as above.
            'tag': this.service_.options_.appName,
          }},

        // TODO: Support registered-user only games.
        { 'type': 'm.room.guest_access', 'content': {'guest_access': 'can_join'}},
      ],
    })).room_id;
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
    this.timeout_ = 30000;
    this.syncParams_ = {
      'filter': {
        'room': {
          'rooms': [this.room_id],
          'state': {
            'types': [],
          },
          'timeline': {
            'types': ['m.room.message'],
          },
        },
      },
    };
  }

  get connected() {
    return this.client_.access_token;
  }

  async join() {
    let response = await this.client_.fetch('/_matrix/client/r0/join/' + this.room_id, 'POST');
    // Joining an alias reveals the internal room id which is used for other
    // API calls.
    this.room_id = response.room_id;
  }

  async leave() {
    let response = await this.client_.fetch('/_matrix/client/r0/rooms/' + this.room_id + '/leave', 'POST');
  }

  async members() {
    return (await this.client_.fetch('/_matrix/client/r0/rooms/' + this.room_id + '/members', 'GET')).chunk;
  }

  setTimelineTypes(types) {
    this.syncParams_.filter.room.timeline.types = types;
  }

  setStateTypes(types) {
    this.syncParams_.filter.room.state.types = types;
  }

  async fetchEvents() {
    let response = await this.client_.fetch('/_matrix/client/r0/sync?', 'GET',
        this.syncParams_);
    // TODO: Support using prev_batch token and limit to fetch recent events
    // without entire history.
    this.syncParams_.since = response.next_batch;
    this.syncParams_.timeout = this.timeout_;
    let roomDetails = response.rooms.join[this.room_id];
    return roomDetails ? roomDetails.timeline.events : [];
  }

  async sendEvent(eventType, content) {
    let txnId = this.client_.makeTxnId();
    let response = await this.client_.fetch('/_matrix/client/r0/rooms/' +
        encodeURI(this.room_id) + '/send/' + encodeURI(eventType) + '/' +
        encodeURI(txnId), 'PUT', null, content);
    return response.event_id;
  }
}

class Lobby extends Room {
  constructor(client, room_id) {
    super(client, room_id);
    this.rooms = {};
    this.roomCount = 0;
  }

  async advertise(room) {
    let event = room;
    event.msgtype = 'm.text';
    event.body = 'Created game at ' + room.url;
    event.tag = this.client_.service_.options_.appName;
    // TODO: Replace m.room.message with custom event type.
    await this.sendEvent('m.room.message', event);
  }
  // TODO: Figure out what sort of API the lobby should provide.
}