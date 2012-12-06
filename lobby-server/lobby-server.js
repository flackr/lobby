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
      if (requestPath == '/search') {
        response.writeHead(200, {'Content-Type': 'application/json',
                                 'Access-Control-Allow-Origin': '*'});
        var results = [];
        if (separatorIndex != -1) {
          var query = requestQuery.split('q=')[1];
          for (var i = 0, game; game = games[i++];) {
            if (game.description.indexOf(query) != -1) {
              results.push(game);
            }
          }
        }
        response.end(JSON.stringify({'games': results}));
      } else if (requestPath == '/list') {
        response.writeHead(200, {'Content-Type': 'application/json',
                                 'Access-Control-Allow-Origin': '*'});
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
              game.publicAddress = game.publicAddress || connection.remoteAddress;
              game.ping = undefined;
              pingInterval = setInterval(ping, 10000);
              self.onGameCreated(game);
              var connectivitySocket = net.connect(
                  { host: game.publicAddress,
                    port: game.port
                  });
              connectivitySocket.on('connect', function(connect) {
                game.visibility = 'public';
                connectivitySocket.end();
              });
              connectivitySocket.on('error', function(error) {
                console.log(game.publicAddress,
                            game.port, 'is not connectible.');
                game.visibility = 'private';
                connectivitySocket.end();
                connection.sendUTF(JSON.stringify({
                    type: 'error',
                    code: 'not_reachable',
                    details: 'Game server address ' + game.publicAddress +
                             ':' + game.port + ' is not connectable'}));
              });
              connectivitySocket.on('end', function() {
                console.log('connectivitySocket ends.');
              });
            }
          } else {
            if (json.type == 'update') {
              for (var field in json.details) {
                game[field] = json.details[field];
              }
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
        var index;
        if (game && (index = games.indexOf(game)) != -1) {
          // Remove game from list.
          games.splice(index, 1);
        }
      });

    },

    onGameCreated: function(game) {
      games.push(game);
    },

  };

  return Server;
}();

var server = new lobby.Server();
