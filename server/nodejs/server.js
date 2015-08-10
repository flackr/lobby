/**
 * Lobby server providing game listings for aribtrary games.
 */
var http = require('http');
var https = require('https');
var WebSocketServer = require('ws').Server;
var finalhandler = require('finalhandler');
var serveStatic = require('serve-static');

exports.Server = function() {

  var Server = function(options) {
    this.sessions = [];
    this.listings_ = {};
    this.listingTypes_ = [];
    this.nextId_ = 1;
    this.allowRelay_ = true;
    options.port = options.port || (options.key ? 443 : 80);
    if (options.key)
      this.webServer_ = https.createServer(options, this.onRequest_.bind(this));
    else
      this.webServer_ = http.createServer(this.onRequest_.bind(this));
    this.webSocketServer_ = new WebSocketServer({'server': this.webServer_});
    this.webSocketServer_.on('connection', this.onConnection_.bind(this));
    this.webServer_.listen(options.port);
    this.serve = serveStatic('../../');
    console.log('Listening on ' + options.port);
  };

  Server.prototype = {

    onRequest_: function(req, res) {
      console.log('Request for ' + req.url);
      if (req.url == '/list' || req.url.substring(0, 6) == '/list/') {
        this.listSessions_(req, res);
      } else {
        // Default handler.
        var done = finalhandler(req, res);
        this.serve(req, res, done);
      }
    },

    listSessions_: function(req, res) {
      res.writeHead(200, {'Content-Type': 'application/json'});
      if (req.url.length > 6) {
        res.end(JSON.stringify(this.listings_[req.url.slice(6)] || {}));
      } else {
        // Simply look up game types.
        res.end(JSON.stringify(this.listingTypes_));
      }
    },

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
      // Origin is of the form 'https://www.lobbyjs.com'
      var origin = websocket.upgradeReq.headers.origin || 'unknown';
      console.log('connection for ' + origin);
      if (websocket.upgradeReq.url == '/new' || websocket.upgradeReq.url.substring(0, 5) == '/new/') {
        this.createHost_(websocket, websocket.upgradeReq.url.substring(5));
        return;
      }
      this.connectClient_(websocket);
    },

    /**
     * Connect client on |websocket| to host specified by connection url.
     *
     * @param {WebSocket} websocket A connected websocket client connection.
     */
    connectClient_: function(websocket) {
      var self = this;
      var sessionId = websocket.upgradeReq.url.substr(1);
      var session = this.sessions[sessionId];
      if (!session) {
        console.log("Client attempted to connect to invalid sessionId "+sessionId);
        // TODO(flackr): Investigate generating this error before upgrading to
        // a websocket. (http://nodejs.org/api/http.html#http_http_createserver_requestlistener)
        websocket.send(JSON.stringify({'error': 404}));
        websocket.close();
        return;
      }

      var clientId = session.nextClientId++;
      session.clients[clientId] = {
        'socket': websocket
      };
      console.log("Client " + clientId + " attempting to connect to session " + sessionId);
      websocket.on('message', function(message) {
        if (!session) {
          console.log("Client attempted to deliver a message on ended session.");
          websocket.send(JSON.stringify({'error': 404}));
          websocket.close();
          return;
        }
        var data = null;
        try {
          // Do not double JSON.stringify
          data = JSON.parse(message);
        } catch (err) {
        }
        if (data !== null && session.socket.readyState == 1) {
          session.socket.send(JSON.stringify({'client': clientId, 'type': data.type, 'data': data.data}));
        } else {
          console.log("Client message is not JSON: " + message);
          websocket.close();
        }
      });
      websocket.on('close', function() {
        console.log('client ' + clientId + ' disconnected for session ' + sessionId);
        delete session.clients[clientId];
        // TODO(flackr): Test if this is called sychronously when host socket
        // closes, if so remove.
        if (!self.sessions[sessionId]) {
            console.log('client ' + clientId + ' disconnected for already closed server');
        }

        if (self.sessions[sessionId]) {
            console.log('Client ' + clientId + ' closing connection');
            if (session.socket.readyState == 1) {
              session.socket.send(JSON.stringify({
                'client': clientId,
                'type': 'close'}));
            }
        }
      });
      // Inform the server that a client connected.
      session.socket.send(JSON.stringify({'client': clientId}));
    },

    registerListing_: function(type, id, details) {
      if (!this.listings_[type]) {
        this.listings_[type] = {};
        this.updateListingTypes_();
      }
      this.listings_[type][id] = details;
    },

    removeListing_: function(type, id) {
      if (!this.listings_[type])
        return;
      delete this.listings_[type][id];
      // Check if there are still any games in this type.
      for (var i in this.listings_[type]) {
        return;
      }
      // If not, remove the type.
      delete this.listings_[type];
      this.updateListingTypes_();
    },

    updateListingTypes_: function() {
      this.listingTypes_ = [];
      for (var i in this.listings_) {
        this.listingTypes_.push(i);
      }
    },

    /**
     * Create a new session host accepting connections through signaling socket
     * |websocket|.
     *
     * @param {WebSocket} websocket A connected websocket client connection.
     */
    createHost_: function(websocket, type) {
      var self = this;
      var origin = websocket.upgradeReq.headers.origin || 'unknown';
      var sessionId = this.getNextId_();
      console.log('Created session ' + sessionId);
      var session = this.sessions[sessionId] = {
        'socket': websocket,
        'clients': {},
        'nextClientId': 1,
        'type': type || origin,
        'desc': {},
      };
      websocket.on('message', function(message) {
        var data;
        try {
          data = JSON.parse(message);
        } catch (err) {
          websocket.close();
          return;
        }
        if (!data.client) {
          if (data.type == 'desc') {
            session.desc = data.data;
            self.registerListing_(session.type, sessionId, session.desc);
          }
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
        if (client.socket.readyState == 1)
          client.socket.send(JSON.stringify({'type':data.type, 'data':data.data}));
        if (data.type != 'close')
          return;
        console.log('Forcing session ' + sessionId + ', client ' + clientId + ' to close');
        client.socket.close();
        delete session.clients[clientId];
      });
      websocket.on('close', function() {
        console.log("Session " + sessionId + " ended, disconnecting clients.");
        self.removeListing_(session.type, sessionId);
        for (var clientId in session.clients) {
          // Server went away while client was connecting.
          if (session.clients[clientId].socket.readyState != 1)
            continue;
          session.clients[clientId].socket.send(JSON.stringify({'error': 404}));
          session.clients[clientId].socket.close();
        }
        delete self.sessions[sessionId];
      });
      websocket.send(JSON.stringify({'host': sessionId, 'relay': this.allowRelay_}));
    },

    /**
     * Shuts down the signaling server for game sessions.
     */
    shutdown: function() {
      this.webSocketServer_.close();
    },

  };

  return Server;
}();
