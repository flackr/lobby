var chess = {};

function $(id) {
  return document.getElementById(id);
}

chess.GameState = {
  STARTING: 0,
  IN_PROGRESS: 1,
  FINISHED: 2
};

chess.Role = {
  PLAYER_WHITE: 0,
  PLAYER_BLACK: 1,
  PLAYER_UNASSIGNED: 2,
  OBSERVER: 3
};

chess.nickname = 'Anonymous';

chess.offerDraw = function () {
  // TODO: Implement me.  Requires agreement of other player.
}

chess.resign = function() {
    // TODO: Implement me.
  }

chess.undo = function(){
  // TODO: Implement me. Requires agreement of other player.
}

chess.getRole = function() {
  return window.client ? window.client.role_ : chess.Role.PLAYER_UNASSIGNED;
}

chess.newGame = function() {
  Overlay.show('chess-lobby');
}

chess.sendMessage = function() {
  if (chess.gameClient) {
    var message = $('chat-message');
    chess.gameClient.sendMessage({chat: message.value});
    message.value = '';
    message.focus();
  }
}

chess.createGame = function(lobbyUrl, listenPort, description) {
  var host = new lobby.Host(lobbyUrl, parseInt(listenPort));
  window.server = new chess.GameServer(host, description);
  host.addEventListener('ready', function(address) {
    window.client = new chess.GameClient(server.createLocalClient(),
                                         chess.Role.PLAYER_UNASSIGNED);
  });
}

chess.GameServer = function(connection, name, timeControl, timeIncrement) {
  this.clients_ = [];
  this.connection_ = connection;
  this.timestamp_ = undefined;
  this.whiteToMove_ = true;
  this.turnIndex_ = 1;
  this.elapsedTime_ = {white: 0, black: 0};
  this.connection_.updateInfo({
    gameId: 'chess',
    name: 'chess',
    description: name,
    accepting: true,
    observable: false, // Add game create option once observers properly supported.
    status: 'awaiting_players',
    url: 'http://www.dynprojects.com/games/chess/',
    params: 'game={%id}'
  });
  this.gameState_ = chess.GameState.STARTING;
  this.connection_.addEventListener('message', this.onMessageReceived.bind(this));
  this.connection_.addEventListener('disconnection', this.onDisconnection.bind(this));
};

chess.GameServer.prototype = {

  createLocalClient: function() {
    return this.connection_.createLocalClient();
  },

  onMessageReceived: function(clientIndex, message) {
    var echo = !!message.echo;
    var timing = {};
    timing.clock = {
      black: {
        remaining: 60 * chess.timeControl - this.elapsedTime_.black,
        increment: chess.timeIncrement
      }, 
      white: {
        remaining: 60 * chess.timeControl - this.elapsedTime_.white,
        increment: chess.timeIncrement
      }
    };
    if (message.alias) {
      console.log('player[' + clientIndex + '] = ' + message.alias + 
         ', role = ' + message.role);
      this.clients_[clientIndex] = message;
      this.updatePlayers();
    } else if (message.chat) {
      message.from = this.clients_[clientIndex].alias;
      // Player messages are seen by all.
      // Observer messages are only seen by other observers (kibitzers).
      var role = this.clients_[clientIndex].role;
      for (var i in this.connection_.clients) {
        message.toSelf = (i == clientIndex);
        if (role != chess.Role.OBSERVER ||
            this.clients_[i].role == chess.Role.OBSERVER)
          this.connection_.send(i, message);
      }
    } else {
      if (message.moveFrom) {  
        // Add timer information.
        // TODO - ensure that we don't get double move on a pawn promotion or castle.
        var now = Date.now();

        var increment = this.timeIncrement_;
        if (this.turnIndex_ > 1) {
          // Start clocks after each player has made initial move.
          var delta = (now - this.timestamp_) / 1000;
          if (delta > chess.timeIncrement) {
            delta -= chess.timeIncrement;
            increment = 0;
          } else {
            increment = delta;
            delta = 0;
          }
          if (this.whiteToMove_) {
            this.elapsedTime_.white += delta;
            timing.clock.white.remaining -= delta;
            timing.clock.white.increment = increment;
            timing.clock.black.increment = chess.timeIncrement;
          } else {
            this.elapsedTime_.black += delta;
            timing.clock.black.remaining -= delta;
            timing.clock.black.increment = increment;
            timing.clock.white.increment = chess.timeIncrement;
          }
          // Start opponents clock.
          timing.clock.startClock = this.whiteToMove_ ? 'black' : 'white';
        }
        this.whiteToMove_ = !this.whiteToMove_;
        if (this.whiteToMove_) {
          this.turnIndex_++;
          // Clock starts on white's second move.
          if (!timing.clock.startClock)
            timing.clock.startClock = 'white';
        }
        this.timestamp_ = now;
      }

      // Rebroadcast all messages to all clients.
      for (var i in this.connection_.clients) {
        if (echo || i != clientIndex)
          this.connection_.send(i, message);
      }  
    }
    if (timing) {
      for (var i in this.connection_.clients)
        this.connection_.send(i, timing);
    }
  },

  onDisconnection: function(clientIndex) {
    delete this.clients_[clientIndex];
    this.updatePlayers();
  },

  /**
   * Adds players to the game.  If the game has not already started, colors are
   * randomly assigned when the first player joins the game as a player
   * (assumes host is always a player).  Additonal players may join as
   * observers if permitted.
   */
  updatePlayers: function() {
    var aliases = [];
    for (var i in this.clients_) {
      // Only show actual players and not observers.
      if (this.clients_[i].role != chess.Role.OBSERVER)
        aliases.push(this.clients_[i].alias);
    }
    this.connection_.updateInfo({
      players: aliases
    });

    if (this.gameState_ != chess.GameState.STARTING) {
      for (var i in this.clients_) {
        var role = this.clients_[i].role;
        if (role == chess.Role.PLAYER_UNASSIGNED) {
          // TODO: If observer is not allowed, kick the player.

          // Another player won the connection race. Reassign to observer role.
          this.clients_[i].role = chess.Role.OBSERVER;
          // TODO: Inform player that game has already started.
          // TODO: Observers joining late should get the move list.
        }
      }
      return;
    }

    var playerCount = 0;
    var assignedPlayers = 0;

    // See if we have enough players to start the game.
    for (var i in this.clients_) {
      var role = this.clients_[i].role;
      if (role != chess.Role.OBSERVER) {
        playerCount++;
        if (role != chess.Role.PLAYER_UNASSIGNED)
          assignedPlayers++;
      }
    }
    if (playerCount > 1 && assignedPlayers < 2) {
      // Randomly assign roles using first two available players.
      var r = Math.floor(2*Math.random());
      var assigned = [undefined, undefined];
      for (var i in this.clients_) {
        if (this.clients_[i].role != chess.Role.OBSERVER) {
          this.clients_[i].role = r;
          assigned[r] = i;
          r = 1 - r;
          if (assigned[r] != undefined)
            break;
        }
      }
      // Remaining players become observers.
      for (var i in this.clients_) {
        if (this.clients_[i].role == chess.PLAYER_UNASSIGNED)
          this.clients_[i].role = chess.OBSERVER;
      }
      if (assigned[0] != undefined && assigned[1] != undefined) {
        // Dismiss waiting dialog.
        Dialog.dismiss('info');
        // Inform all players of the roles.
        var message = {
          players: {
            white: this.clients_[assigned[0]].alias,
            black: this.clients_[assigned[1]].alias
          }
        };
        for (var i in this.connection_.clients) {
          message.role = this.clients_[i].role;
          this.connection_.send(i, message);
        }
        this.connection_.updateInfo({
          accepting: false,
          status: 'started',
        });
      }
    }
  }
};

chess.GameClient = function(connection, role) {
  this.connection_ = connection;
  this.name_ = chess.nickname;
  this.role_ = role;
  this.connection_.addEventListener('connected', this.onConnected.bind(this));
  this.connection_.addEventListener('disconnected', this.onDisconnected.bind(this));
  this.connection_.addEventListener('message', this.onMessageReceived.bind(this));
  chess.gameClient = this;
};

chess.GameClient.prototype = {

  onConnected: function() {
    this.connection_.send({alias: this.name_, role: this.role_});
  },

  onMessageReceived: function(message) {
    if (message.chat) {
      var chat = $('chat-messages');
      var entry = document.createElement('div');
      entry.className = 'chat-message';
      chat.appendChild(entry);
      var from = document.createElement('div');
      from.textContent = message.toSelf ? 'me' : message.from;
      entry.appendChild(from);
      var content = document.createElement('div');
      content.textContent = message.chat;
      entry.appendChild(content);
      var height = chat.clientHeight;
      var scrollHeight = chat.scrollHeight;
      if (scrollHeight > height)
        chat.scrollTop = scrollHeight - height;
      if (!message.toSelf)
        $('chat-sound').play();
    } else if (message.moveFrom) {
      chess.chessboard.move(
          message.moveFrom, 
          message.moveTo, 
          /* trial */ false, 
          /* message response */ true);
    } else if (message.clock) {
      chess.scoresheet.updateClocks(message.clock);
    } else if (message.players) {
      chess.chessboard.reset();
      chess.scoresheet.reset();
      var view = message.role == chess.Role.PLAYER_BLACK ?
        ChessBoard.View.WHITE_AT_TOP : ChessBoard.View.BLACK_AT_TOP;
      chess.chessboard.setView(view);
      this.role_ = message.role;
      // set player names
      chess.scoresheet.setPlayerNames(message.players);
    } else {
      for (key in message) {
         console.log(key + ': ' + message[key]);
      }
    }
  },

  /**
   * Sends a message to all clients.
   */
  sendMessage: function(message) {
    message.sender = this.id_;
    this.connection_.send(message);
  },

  onDisconnected: function() {
  }
};

chess.resizeBoard = function() {
  var area = $('board-area');
  var height = area.clientHeight;
  var width = area.clientWidth;
  chess.chessboard.resize(Math.min(height, width));
};

window.addEventListener('DOMContentLoaded', function() {
  chess.chessboard = new ChessBoard();
  $('board-area').appendChild(chess.chessboard);
  chess.chessboard.reset();
  chess.scoresheet = Scoresheet.decorate($('scoresheet'));
  window.onresize = chess.resizeBoard;

  chess.resizeBoard();

/*
  Teporarily disabling until implemented.
  $('chess-button-offer-draw').addEventListener('click', chess.offerDraw);
  $('chess-button-resign').addEventListener('click', chess.resign);
  $('chess-button-undo').addEventListener('click', chess.undo);
*/
  $('chess-button-new-game').addEventListener('click', chess.newGame);
  $('chat-message').addEventListener('keypress', function(evt) {
    if (evt.keyCode == 13)
      chess.sendMessage();
  });

}, false);


