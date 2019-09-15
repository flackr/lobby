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
  return response.json();
}

export async function createClient(options) {
  return new GameClient(options);
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

class GameClient {
  constructor(options) {
    this.options_ = options || {};
    this.options_.defaultHost = this.options_.defaultHost || 'https://matrix.org';
    // Set a default app name of the URL.
    this.options_.appName = this.options_.appName || (window.location.origin + window.location.pathname);
    this.access_token = '';
    this.user_id = '';
    this.type = '';
    this.txnCtr_ = 0;
    this.host_ = '';
  }
  
  async reauthenticate() {
    let userJson = localStorage.getItem(USER_AUTH_KEY);
    if (!userJson)
      return false;
    let user = JSON.parse(userJson);
    this.setUser(user, user.type);
    return true;
  }
  
  logout() {
    // Clear all user state.
    this.setUser({
      access_token: '',
      user_id: '',
    }, '');
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
    this.setUser(user, 'user');
    return true;
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
        throw Error('Matrix server does not support plain registration.');
      params.auth = {
        session: result.session,
        type: 'm.login.dummy',
      };
    }
    this.setUser(user, 'user');
    return true;
  }
  
  async loginAsGuest(host) {
    let user = await fetchJson(host || this.options_.defaultHost + '/_matrix/client/r0/register', {'method': 'POST'}, {'kind': 'guest'});
    this.setUser(user, 'guest');
    return true;
  }
  
  setUser(user, type) {
    // Log out of the current user if one is logged in. Don't wait for these
    // responses to avoid slowing down the logout request.
    if (this.access_token) {
      if (this.type == 'guest') {
        // When logging out of a "guest" account, we will never be able to log
        // back in so it seems the nice thing to do is deactivate the account.
        this.fetch('/_matrix/client/r0/account/deactivate', 'POST');
      } else if (this.user_id) {
        this.fetch('/_matrix/client/r0/logout', 'POST');
      }
    }

    // TODO: Verify access token?
    this.access_token = user.access_token;
    this.user_id = user.user_id;
    this.type = type;
    this.txnCtr_ = 0;
    this.host_ = '';

    // Remove the stored user credentials if no user provided.
    if (!this.user_id) {
      localStorage.removeItem(USER_AUTH_KEY);
      return;
    }

    let parsed = parse_user_id(this.user_id);
    this.host_ = parsed.host;
    localStorage.setItem(USER_AUTH_KEY, JSON.stringify({
      'access_token': this.access_token,
      'user_id': this.user_id,
      'type': this.type,
    }));
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
      // Filter only rooms matching the current url.
      if (roomDetails['com.github.flackr.lobby.Game'] &&
          roomDetails['com.github.flackr.lobby.Game'].url == window.location.origin + window.location.pathname) {
        result[roomid] = roomDetails;
      }
    }
    return result;
  }
  
  async join(roomIdOrAlias) {
    let response = await this.fetch('/_matrix/client/r0/join/' + roomIdOrAlias, 'POST');
    let room_id = response.room_id;
    return new Room(this, room_id)
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
            'tag': this.options_.appName,
          }},

        // TODO: Support registered-user only games.
        { 'type': 'm.room.guest_access', 'content': {'guest_access': 'can_join'}},
      ],
    })).room_id;
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
    this.room_id = room_id;
    this.client_ = client;
    this.connected = true;
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
  
  quit() {
    this.connected = false;
  }
}