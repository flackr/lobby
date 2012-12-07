/**
 * Lobby server providing game listings for aribtrary games.
 */

var port = 9999;
var http = require('http'),
    fs = require('fs'),
    net = require('net'),
    path = require('path'),
    ws = require('websocket');

// The folder to serve content out of.
var www = '../lobby';
// The default page to serve if no page is specified.
var defaultHtml = 'index.html';

var lobby = {};

lobby.Server = function() {
  // games keyed by gameId.
  var gameIdMap = {};
  var idMap = [];
  var nextId = 1;

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
      function getContentType(filePath) {
        if (filePath.substr(filePath.length - 5) == '.html')
          return 'text/html';
        if (filePath.substr(filePath.length - 4) == '.css')
          return 'text/css';
        if (filePath.substr(filePath.length - 3) == '.js')
          return 'text/javascript';
        if (filePath.substr(filePath.length - 4) == '.svg')
          return 'image/svg+xml';
        return 'text/plain';
      }

      var separatorIndex = request.url.indexOf('?');
      if (separatorIndex == -1)
        separatorIndex = request.url.length;
      var requestPath = request.url.slice(0, separatorIndex);
      var requestQuery = request.url.slice(separatorIndex);

      if (requestPath.indexOf('/details/') >= 0) {
        var id = parseInt(requestPath.split('/details/')[1] || 0);
        var game = idMap[id];
        if (!game) {
          response.WriteHead(404);
          response.end();
          return;
        }
        response.writeHead(200, {'Content-Type': 'application/json',
                                 'Access-Control-Allow-Origin': '*'});
        response.end(JSON.stringify({'game': game}));
      } else if (requestPath.indexOf('/list') >= 0) {
        response.writeHead(200, {'Content-Type': 'application/json',
                                 'Access-Control-Allow-Origin': '*'});
        var gameId = requestPath.split('/list/')[1] || '';
        var games = gameIdMap[gameId] || [];

        // If no gameId is specified, return all the games from the lobby 
        // server.
        if (!gameId) {
          games = [];
          for (gameId in gameIdMap)
            for (var i = 0, game; game = gameIdMap[gameId][i++];)
              games.push(game);
        }

        response.end(JSON.stringify({'games': games}));
      } else {
        if (requestPath == '/')
          requestPath = '/' + defaultHtml;
        var filePath = www + requestPath.replace('../', './');
        path.exists(filePath, function(exists) {
          if (!exists) {
            response.writeHead(404);
            response.end();
            return;
          }
          fs.readFile(filePath, function(error, content) {
            if (error) {
              response.writeHead(500);
              response.end();
              return;
            }

            response.writeHead(200, {'Content-Type': getContentType(filePath)});
            response.end(content);
          });
        });
      }
    },

    /**
     * On a WebSocket connection request.
     * @param request The request object.
     */
    onWSRequest: function(request) {
      var connection = request.accept('game-protocol', request.origin);
      this.setupGame(connection);
    },

    setupGame: function(connection) {

      var self = this;
      var game;
      var pingStart = 0;
      var pingInterval;

      var ping = function() {
        if (pingStart == 0) {
          pingStart = Date.now();
          connection.sendUTF(JSON.stringify({type:'ping'}));
        }
      };

      var updateInfo = function(info, skipClient) {
        if (!game)
          return;
        for (var i in info) {
          game[i] = info[i];
        }
        if (!skipClient)
          connection.sendUTF(JSON.stringify({type:'update', details:info}));
      }

      // TODO(flackr): We should close a connection after a timeout if it
      // fails to register a game.
      connection.on('message', function(message) {
        if (message.type != 'utf8') {
          connection.close();
          return;
        }

        var json;
        try {
          // TODO(flackr): The entire message may not fit in one packet. We
          // should aggregate messages if we plan to have longer messages.
          json = JSON.parse(message.utf8Data);
        } catch (e) {
          connection.close();
          return;
        }
        if (json.type) {
          if (!game) {
            if (json.type == 'register') {
              game = json.details;
              game.ping = undefined;
              updateInfo({
                id: nextId++,
                publicAddress: game.publicAddress || connection.remoteAddress,
              });

              pingInterval = setInterval(ping, 10000);
              self.onGameCreated(game);
              var connectivitySocket = net.connect(
                  { host: game.publicAddress,
                    port: game.port
                  });
              connectivitySocket.on('connect', function(connect) {
                updateInfo({visibility: 'public'});
                game.visibility = 'public';
                connectivitySocket.end();
              });
              connectivitySocket.on('error', function(error) {
                updateInfo({visibility: 'private'});
                connectivitySocket.end();
              });
              connectivitySocket.on('end', function() {
              });
            }
          } else {
            if (json.type == 'update') {
              updateInfo(json.details, true);
            } else if (json.type == 'pong') {
              game.ping = Date.now() - pingStart;
              pingStart = 0;
            }
          }
        }
      });

      connection.on('close', function(reasonCode, description) {
        if (pingInterval)
          clearTimeout(pingInterval);
        if (game)
          self.onGameDestroyed(game);
      });

    },

    onGameCreated: function(game) {
      if (!gameIdMap[game.gameId])
        gameIdMap[game.gameId] = [];
      gameIdMap[game.gameId].push(game);
      idMap[game.id] = game;
    },

    onGameDestroyed: function(game) {
      var index, games;
      if (game.gameId)
        games = gameIdMap[game.gameId] || [];
      if ((index = games.indexOf(game)) != -1) {
        // Remove game from list.
        games.splice(index, 1);
      }
      delete idMap[game.id];
    }

  };

  return Server;
}();

var server = new lobby.Server();
