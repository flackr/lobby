/**
 * Lobby server providing game listings for aribtrary games.
 */

var port = 8000;
var http = require('http'),
    fs = require('fs'),
    path = require('path'),
    ws = require('websocket');

var lobby = {};

lobby.Server = function() {
  var games = [];

  var Server = function() {
    this.server = http.createServer(this.onHttpRequest.bind(this));
    this.server.listen(port);

    this.wsServer = new ws.server({
      httpServer: this.server,
      autoAcceptConnections: false
    });

    this.server.on('request', this.onHttpRequest.bind(this));
    this.wsServer.on('request', this.onWSRequest.bind(this));
    console.log('Awaiting connections');
  };

  Server.prototype = {

    onHttpRequest: function(request, response) {
      console.log('Http request');
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('Not implemented yet.');
    },

    /**
     * On a WebSocket connection request.
     * @param request The request object.
     */
    onWSRequest: function(request) {
      console.log('Websocket connection received');
      var connection = request.accept('game-protocol', request.origin);
      this.setupGame(connection);
    },

    setupGame: function(connection) {

      var game;

      connection.on('message', function(message) {
        console.log('Received message: ' + message.utf8Data);
        if (message.type == 'utf8') {
          if (!game) {
            // Before a game is started we only care about register.
            if (message.utf8Data.slice(0, 9)  == 'register ') {
              game = JSON.parse(message.utf8Data.slice(9));
              // Add game to games list.
              games.push(game);
              connection.sendUTF('OK');
            }
          } else {
            // Handle messages after a game has been started.

          }
        }
      });

      connection.on('close', function(reasonCode, description) {
        var index;
        if (game && (index = games.indexOf(game)) != -1) {
          // Remove game from list.
          games.splice(index, 1);
        }
      });

    },

  };

  return Server;
}();

var server = new lobby.Server();
