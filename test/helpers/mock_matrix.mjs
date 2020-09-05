const MATRIX_CLIENT_API_PREFIX = '_matrix/client/r0/';
const AUTH_PREFIX = 'Bearer ';
const JOIN_PREFIX = 'join/';
const SYNC_PREFIX = 'sync';
const SEND_REGEX = /^rooms\/(?<room>[^\/]*)\/send\/(?<type>[^\/]*)\/(?<id>.*)$/;
const TOKEN_PREFIX = 'token';
let tokenIndex = 0;
let roomIndex = 0;
let txnIndex = 0;

function generateTxnId(host) {
  return '$' + (++txnIndex) + ':' + host;
}

function generateRoomId(host) {
  return '!' + (++roomIndex) + ':' + host;
}

function generateToken(user_id) {
  return TOKEN_PREFIX + '_' + user_id + '_' + (++tokenIndex);
}

export default class MockMatrixServer {
  constructor(options) {
    this._options = options;
    this._tokens = {};
    this._servers = {};
    this._rooms = {};
    this._messages = [];
    this._onmessage = new Set();
  }

  connect(server) {
    if (this._servers[server._options.host])
      return;
    this._servers[server._options.host] = {server, latency: 0};
    server.connect(this);
  }

  fetch = async (resource, init) => {
    if (!resource.startsWith(this._options.host + '/'))
      return null;

    let path = resource.substring(this._options.host.length + 1);
    if (!path.startsWith(MATRIX_CLIENT_API_PREFIX))
      throw new Error('Request path must start with ' + MATRIX_CLIENT_API_PREFIX);
    
    let request = path.substring(MATRIX_CLIENT_API_PREFIX.length);
    let user_id = null;
    let token;
    if (request == 'login') {
      let details = JSON.parse(init.body);
      user_id = '@' + details.identifier.user + ':' + this._options.host;
      token = generateToken(user_id);
      this._tokens[token] = user_id;
      return {status: 200, body: JSON.stringify({
        user_id,
        access_token: token,
      })};
    }
    let auth = init.headers['Authorization'];
    if (auth && auth.startsWith(AUTH_PREFIX))
      user_id = this._tokens[auth.substring(AUTH_PREFIX.length)];
    if (!user_id) {
      return {status: 403, body: JSON.stringify({'error': 'Unauthorized'})};
    }
    
    let result;
    if (request == 'createRoom') {
      let details = JSON.parse(init.body);
      let room_id = generateRoomId(this._options.host);
      this._rooms[room_id] = {
        messages: [],
      };
      return {status: 200, body: JSON.stringify({
        room_id,
      })};
    } else if (request.startsWith(JOIN_PREFIX)) {
      let room_id = request.substring(JOIN_PREFIX.length);
      if (room_id.indexOf('?') != -1)
        room_id = room_id.substring(0, room_id.indexOf('?'));
      return {status: 200, body: JSON.stringify({room_id})};
    } else if (result = request.match(SEND_REGEX)) {
      let details = JSON.parse(init.body);
      let message = {type: result.groups.type, content: details, room_id: result.groups.room};
      this._messages.push(message);
      for (let observer of this._onmessage)
        observer();
      return {status: 200, body: JSON.stringify({
        event_id: generateTxnId(this._options.host),
      })};
    } else if (request.startsWith(SYNC_PREFIX)) {
      let params = {};
      let since = 0;
      let filter;
      let timeout;
      if (request[SYNC_PREFIX.length] == '?') {
        let split = request.substring(SYNC_PREFIX.length + 1).split('&');
        for (let param of split) {
          let contents = param.split('=', 2);
          params[contents[0]] = decodeURIComponent(contents[1]);
          if (contents[0] == 'filter')
            filter = JSON.parse(params.filter);
          else if (contents[0] == 'since')
            since = JSON.parse(params.since);
          else if (contents[0] == 'timeout')
            timeout = JSON.parse(params.timeout);
          else
            throw new Error('Sync parameter ' + param + ' unsupported');
        }
      }
      if (!filter)
        throw new Error('Sync only supported with filter');
      if (!filter.room || !filter.room.rooms)
        throw new Error('Sync only supported with room filter');
      if (filter.room.rooms.length != 1)
        throw new Error('Sync only supports a single room');
      let room = filter.room.rooms[0];
      let roomUpdates = {join: {}};
      roomUpdates.join[room] = {
        state: {
          events: [],
        },
        timeline: {
          events: [],
          prev_batch: 0,
        },
      };
      let messageCount = 0;
      let filterFn = function(msg) {
        return msg.room_id == room
      }

      for (; since < this._messages.length; since++) {
        if (!filterFn(this._messages[since]))
          continue;
        messageCount++;
        roomUpdates.join[room].timeline.events.push(this._messages[since]);
      }
      if (timeout && messageCount == 0) {
        const self = this;
        await new Promise((resolve) => {
          let finish = () => {
            self._onmessage.delete(handler);
            self._options.globals.clearTimeout(timer);
            resolve();
          }

          let handler = function() {
            for (; since < self._messages.length; since++) {
              if (!filterFn(self._messages[since]))
                continue;
              messageCount++;
              roomUpdates.join[room].timeline.events.push(self._messages[since]);
            }
            if (messageCount)
              finish();
          }

          let timer = self._options.globals.setTimeout(finish, timeout);
          self._onmessage.add(handler);
        });
      }
      let response = {
        next_batch: this._messages.length,
        rooms: roomUpdates,
      };
      return {status: 200, body: JSON.stringify(response)};
    }
    // return {status: 200, body: JSON.stringify({})};
    throw new Error('Request ' + request + ' unhandled');
  }
}