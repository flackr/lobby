/**
 * Lobby server providing game listings for aribtrary games.
 */

var WebSocketServer = require('ws').Server;

exports.Server = function() {

  var Server = function(port) {
    this.sessions = [];
    this.nextId_ = 1;
    this.webSocketServer_ = new WebSocketServer({ 'port': port });
    this.webSocketServer_.on('connection', this.onConnection_.bind(this));
    console.log('Listening on ' + port);
  };

  Server.prototype = {

    /**
     * Returns the next game id.
     *
     * @return {String} The next game identifier to be used.
     */
    getNextId_: function() {
      // TODO(flackr): Investigate re-using ids.
      return (this.nextId_++).toString();
    },

    /**
     * Dispatched when a client connects to a websocket.
     *
     * @param {WebSocket} websocket A connected websocket client connection.
     */
    onConnection_: function(websocket) {
      console.log('connection for ' + websocket.upgradeReq.url);
      var self = this;
      if (websocket.upgradeReq.url == '/new') {
        this.createHost_(websocket);
        return;
      }
      var sessionId = websocket.upgradeReq.url.substr(1);
      var session = this.sessions[sessionId];
      if (!session) {
        // TODO(flackr): Investigate generating this error before upgrading to
        // a websocket. (http://nodejs.org/api/http.html#http_http_createserver_requestlistener)
        websocket.send(JSON.stringify({'error': 404}));
        websocket.close();
        return;
      }
      this.connectClient_(websocket, session);
    },
    
    /**
     * Connect client to host.
     */
    connectClient_: function(websocket, session) {
      var clientId = session.nextClientId++;
      session.clients[clientId] = {
        'socket': websocket
      };
      websocket.on('message', function(message) {
        if (!session) {
          websocket.send(JSON.stringify({'error': 404}));
          websocket.close();
          return;
        }
        session.socket.send(JSON.stringify({'client': clientId, 'data': message}));
      });
      websocket.on('close', function() {
        // TODO(flackr): Test if this is called sychronously when host socket
        // closes, if so remove.
        session.socket.send(JSON.stringify({
          'client': clientId,
          'type': 'close'}));
        if (!self.sessions[sessionId])
          return;
        delete session.clients[clientId];
        session.clients[clientId] = undefined;
      })
    },

    createHost_: function(websocket) {
      var self = this;
      var sessionId = this.getNextId_();
      console.log('Created session ' + sessionId);
      var session = this.sessions[sessionId] = {
        'socket': websocket,
        'clients': [],
        'nextClientId': 1
      };
      websocket.on('message', function(message) {
        var data;
        try {
          data = JSON.parse(message);
        } catch (err) {
          websocket.close();
          return;
        }
        var clientId = data.client;
        var client = session.clients[clientId];
        if (!client) {
          websocket.send(JSON.stringify({
            'error': 0,
            'message': 'Client does not exist.'}));
          return;
        }
        client.socket.send(data.data);
      });
      websocket.on('close', function() {
        for (var clientId in session) {
          // Server went away while client was connecting.
          session.clients[clientId].socket.send(JSON.stringify({'error': 404}));
          session.clients[clientId].socket.close();
        }
        delete self.sessions[sessionId];
        self.sessions[sessionId] = undefined;
      });
      websocket.send(JSON.stringify({'host': sessionId}));
    },

    shutdown: function() {
      this.webSocketServer_.close();
    },

  };

  return Server;
}();
