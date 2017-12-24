exports.ServerMultiplexer = function() {
  var WebSocketServer = require('ws').Server;
  var http = require('http');
  var https = require('https');

  var ServerMultiplexer = function(defaultHandler, otherHandlers) {
    this.webServer_ = null;
    this.webSocketServer_ = null;
    this.defaultHandler_ = defaultHandler;
    this.otherHandlers_ = otherHandlers || {};
  }

  ServerMultiplexer.prototype = {
    listen: function(options) {
      options.port = options.port || (options.key ? 443 : 80);
      if (options.key)
        this.webServer_ = https.createServer(options, this.onRequest.bind(this));
      else
        this.webServer_ = http.createServer(this.onRequest.bind(this));
      this.webSocketServer_ = new WebSocketServer({'server': this.webServer_});
      this.webSocketServer_.on('connection', this.onConnection.bind(this));
      this.webServer_.listen(options.port);
    },

    onRequest: function(req, res) {
      for (var prefix in this.otherHandlers_) {
        if (req.url.substring(0, prefix.length) == prefix) {
          req.url = '/' + req.url.substring(prefix.length);
          this.otherHandlers_[prefix].onRequest(req, res);
          return;
        }
      }
      this.defaultHandler_.onRequest(req, res);
    },

    onConnection: function(websocket, req) {
      req = req || websocket.upgradeReq;
      for (var prefix in this.otherHandlers_) {
        if (req.url.substring(0, prefix.length) == prefix) {
          req.url = '/' + req.url.substring(prefix.length);
          this.otherHandlers_[prefix].onConnection(websocket, req);
          return;
        }
      }
      this.defaultHandler_.onConnection(websocket);
    },
  };

  return ServerMultiplexer;
}();
