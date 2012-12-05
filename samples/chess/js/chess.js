var chess = {};

function $(id) {
  return document.getElementById(id);
}

chess.offerDraw = function () {
  // TODO: Implement me.  Requires agreement of other player.
}

chess.resign = function() {
    // TODO: Implement me.
  }

chess.undo = function(){
  // TODO: Implement me. Requires agreement of other player.
}

chess.newGame = function() {
  Overlay.show('chess-lobby');
}

chess.createGame = function(path, port) {
  var url = 'ws://' + path + ':' + port + '/';
  var host = new lobby.Host(url);
  window.server = new chess.GameServer(host, 'Blow your socks off crazy blitz chess action.');
  host.addEventListener('ready', function(address) {
    window.client = new chess.GameClient(new lobby.Client(address));
  });
  chess.chessboard.reset();
  chess.scoresheet.reset();
}

chess.GameServer = function(connection, name) {
  this.clients_ = [];
  this.connection_ = connection;
  this.connection_.updateInfo({
    gameId: 'chess',
    name: 'chess',
    description: name,
    status: 'awaiting_players',
  });
  this.connection_.addEventListener('message', this.onMessageReceived.bind(this));
  this.connection_.addEventListener('disconnection', this.onDisconnection.bind(this));
};

chess.GameServer.prototype = {
  onMessageReceived: function(clientIndex, message) {
    var echo = !!message.echo;
    if (message.alias) {
      this.clients_[clientIndex] = message.alias;
      this.updatePlayers();
    } else {
      // Rebroadcast all messages to all clients.
      for (var i in this.connection_.clients) {
        if (echo || i != clientIndex)
          this.connection_.send(i, message);
      }
    }
  },

  onDisconnection: function(clientIndex) {
    delete this.clients_[clientIndex];
    this.updatePlayers();
  },

  updatePlayers: function() {
    var aliases = [];
    for (var i in this.clients_)
      aliases.push(this.clients_[i]);
    this.connection_.updateInfo({
      players: aliases
    });
  }
};

chess.GameClient = function(connection) {
  this.connection_ = connection;
  this.id_ = Date.now();
  this.name_ = 'Anonymous'; // TODO: set when creating a game.
  this.connection_.addEventListener('connected', this.onConnected.bind(this));
  this.connection_.addEventListener('disconnected', this.onDisconnected.bind(this));
  this.connection_.addEventListener('message', this.onMessageReceived.bind(this));
};

chess.GameClient.prototype = {

  onConnected: function() {
    document.body.classList.add('connected');
    this.connection_.send({alias: this.name_});
  },

  onMessageReceived: function(message) {
    if (message.moveFrom) {
      chess.chessboard.move(message,moveFrom, message.moveTo);
    }

    for (key in message) {
       console.log(key + ': ' + message[key]);
    }
  },

  /**
   * Sends a message to all clients.
   */
  sendMessage: function(message) {
    message.sender = this.id_;
    this.connection_.send(message);
  },

  onKeyPress: function(evt) {
    if (evt.keyCode == 13)
      this.sendMessage();
  },

  onDisconnected: function() {
    document.body.classList.remove('connected');
  }
};

window.addEventListener('DOMContentLoaded', function() {
  chess.chessboard = new ChessBoard();
  $('board-area').appendChild(chess.chessboard);
  chess.chessboard.reset();
  chess.scoresheet = new Scoresheet();
  $('move-list').appendChild(chess.scoresheet);

  $('chess-button-offer-draw').addEventListener('click', chess.offerDraw);
  $('chess-button-resign').addEventListener('click', chess.resign);
  $('chess-button-undo').addEventListener('click', chess.undo);
  $('chess-button-new-game').addEventListener('click', chess.newGame);

}, false);


