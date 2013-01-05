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

chess.offerDraw = function () {
  if (window.client) {
    var pendingOffer = window.client.getPendingRequest() == 'draw';
    if (pendingOffer) {
      chess.stopGame(null, 'Players agreed to a draw.');
    } else {
      window.client.sendMessage({
        request: 'draw', 
        chat: 'Will you accept a draw?'
      });
    }
  }
};

chess.resign = function() {
  if (window.client) {
    var role = chess.getRole();
    var reason, winner;
    if (role == chess.Role.PLAYER_WHITE) {
      reason = 'White resigns';
      winner = 'Black';
    } else if (role == chess.Role.PLAYER_BLACK) {
      reason = 'Black resigns';
      winner = 'White';
    }
    chess.stopGame(winner, reason);
  }
};

chess.undo = function(){
  if (window.client) {
    var pendingOffer = window.client.getPendingRequest() == 'undo';
    if (pendingOffer) {
      var moves = chess.chessboard.getMoves();
      if (moves.length > 0) {
        var whiteToMove = moves.length % 2 == 0;
        if ((chess.getRole() == chess.Role.PLAYER_BLACK && whiteToMove) ||
            (chess.getRole() == chess.Role.PLAYER_WHITE && !whiteToMove)) {
          moves.pop(); // Take back an additional move ply.
        }
        moves.pop();
        window.client.sendMessage({moveList: moves, echo: true});
      }
      window.client.cancelPendingRequest();
    } else {
      window.client.sendMessage({
        request: 'undo',
        chat: 'Can I take that last move back?'
      });
    }
  }
};

chess.getRole = function() {
  return window.client ? window.client.role_ : chess.Role.PLAYER_UNASSIGNED;
};

chess.newGame = function() {
  Overlay.show('chess-lobby');
};

/**
 * Terminate the game
 * @param {?string} winner The winner of the game, which may be null if the
 *     result is a drawn game.
 * @param {string} reason The reason for the outcome, e.g. 'checkmate!' 
 */
chess.stopGame = function(winner, reason) {
  var title = 'Game over:\u00A0\u00A0$1';
  var message = reason + '\u00A0\u00A0$1';
  if (winner) {
    title = title.replace('$1', (winner == 'White') ? '1 - 0' : '0 - 1');
    message = message.replace('$1', winner + ' wins.');
  } else {
    title = title.replace('$1', '1/2 - 1/2');
    var suffix = (reason.indexOf('draw') < 0) ? 'Game is drawn.' : '';
    message = message.replace('$1', suffix);
  }
  if (window.client) {
    window.client.sendMessage({
      infoDialog: {title: title, message: message},
      abort: true,
      echo: true,
    });
  } else {
    Dialog.showInfoDialog(title, message);
  }
};

chess.sendMessage = function() {
  if (window.client) {
    var message = $('chat-message');
    window.client.sendMessage({chat: message.value});
    message.value = '';
    message.focus();
  }
};

chess.createGame = function(lobbyUrl, listenPort, description) {
  var host = new lobby.Host(lobbyUrl, parseInt(listenPort));
  window.server = new chess.GameServer(host, description);
  host.addEventListener('ready', function(address) {
    window.client = new chess.GameClient(server.createLocalClient(),
                                         chess.Role.PLAYER_UNASSIGNED);
  });
  host.addEventListener('error', function(errorCode, errorMsg) {
    if (errorCode == 'listen') {
      Dialog.showInfoDialog('Error', errorMsg);
    }
  });
};

chess.GameServer = function(connection, name) {
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
    observable: chess.observable,
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

    // Only show first termination message.
    if (this.gameState_ == chess.GameState.FINISHED && message.abort)
      return;

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
      },
      controls: {
        limit: chess.timeControl,
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
      if (message.moveList) {
        this.whiteToMove_ = message.moveList.length % 2 == 0;
        timing.clock.startClock = this.whiteToMove_ ? 'white' : 'black';
      } else if (message.moveFrom) {  
        // Add timer information.
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
    
    if (message.abort) {
      this.gameState_ = chess.GameState.FINISHED;
      this.connection_.updateInfo({
        status: 'finished',
      });
      // All players now become observers to allow chat to continue but not
      // piece movement.
      for (var i in this.connection_.clients)
        this.connection_.send(i, {role: chess.Role.OBSERVER});
      // TODO: stop clocks.
    }
    if (timing && this.gameState_ != chess.GameState.FINISHED) {
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
      var players = {};
      for (var i in this.clients_) {
        var role = this.clients_[i].role;
        if (role == chess.Role.PLAYER_WHITE)
          players.white = this.clients_[i].alias;
        else if (role == chess.Role.PLAYER_BLACK)
          players.black = this.clients_[i].alias;
      }
      for (var i in this.clients_) {
        var role = this.clients_[i].role;
        if (!chess.observable &&
            (role == chess.Role.PLAYER_UNASSIGNED ||
            role == chess.Role.OBSERVER)) {
          // Kick the player if game is full and observer not allowed.
          this.connection_.send(i, {infoDialog: {
            title: 'Failed to Join Game',
            message: 'Cannot join a closed game already in progress.'
          }});
          this.connection_.onDisconnection(i);
        }
        if (role == chess.Role.PLAYER_UNASSIGNED) {
          // Another player won the connection race. Reassign to observer role.
          this.clients_[i].role = chess.Role.OBSERVER;
          this.connection_.send(i, {infoDialog: {
            title: 'Join Game',
            message: 'Game already started. You are now an observer.'
          }});
          role = chess.Role.OBSERVER;
        }
        if (role == chess.Role.OBSERVER) {
          this.connection_.send(i, {
            players: players, 
            role: chess.Role.OBSERVER
          });
          var moves = chess.chessboard.getMoves();
          this.connection_.send(i, {moveList: moves});
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
        this.gameState_ = chess.GameState.IN_PROGRESS;
      }
    }
  },

  disconnect: function() {
    this.connection_.disconnect();
  }
};

chess.GameClient = function(connection, role) {
  this.connection_ = connection;
  this.name_ = chess.nickname;
  this.role_ = role;
  this.connection_.addEventListener('connected', this.onConnected.bind(this));
  this.connection_.addEventListener('disconnected', this.onDisconnected.bind(this));
  this.connection_.addEventListener('message', this.onMessageReceived.bind(this));
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
      if (this.role_ != chess.Role.OBSERVER && !message.toSelf)
        this.setPendingRequest(message.request); 
    } else if (message.moveFrom) {
      this.cancelPendingRequest();
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
      if (this.role_ == chess.Role.PLAYER_WHITE ||
          this.role_ == chess.Role.PLAYER_BLACK) {
        $('chess-button-offer-draw').disabled = false;
        $('chess-button-resign').disabled = false;
        $('chess-button-undo').disabled = false;
      }
      // set player names
      chess.scoresheet.setPlayerNames(message.players);
    } else if (message.moveList) {
      // Replay moves when joining game already in progress.
      chess.chessboard.reset();
      chess.scoresheet.reset();
      var moves = message.moveList;
      for (var i = 0; i < moves.length; i++) {
        var move = moves[i];
        chess.chessboard.move(move.from, move.to, false, true);
      }
    } else if (message.infoDialog) {
      Dialog.showInfoDialog(message.infoDialog.title, 
                            message.infoDialog.message);
    } else if (message.role) {
      this.role_ = message.role;
      if (message.role == chess.Role.OBSERVER) {
        $('chess-button-offer-draw').disabled = true;
        $('chess-button-resign').disabled = true;
        $('chess-button-undo').disabled = true;
      }
    } else {
      for (key in message) {
         console.log(key + ': ' + message[key]);
      }
    }
  },

  setPendingRequest: function(request) {
    this.pendingRequest_ = request;
    if (request == 'draw') {
      $('chess-button-offer-draw').value = 'Accept Draw';
    } else if (request == 'undo') {
      $('chess-button-undo').value = 'Accept Take Back';
    }
  },

  getPendingRequest: function() {
    return this.pendingRequest_;
  },

  cancelPendingRequest: function() {
    if (this.pendingRequest_ == 'draw') {
      $('chess-button-offer-draw').value = 'Offer Draw';
    } else if (this.pendingRequest_ == 'undo') {
      $('chess-button-undo').value = 'Request Take Back';
    }
    this.pendingRequest_ = null;
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

  $('chess-button-offer-draw').addEventListener('click', chess.offerDraw);
  $('chess-button-resign').addEventListener('click', chess.resign);
  $('chess-button-undo').addEventListener('click', chess.undo);
  $('chess-button-new-game').addEventListener('click', chess.newGame);
  $('chat-message').addEventListener('keypress', function(evt) {
    if (evt.keyCode == 13)
      chess.sendMessage();
  });

  // fetch preferred settings
  var fetchPreference = function(name, defaultValue) {
    if (chrome && chrome.storage) {
      chrome.storage.local.get(name, function(data) {
        chess[name] = data[name] != undefined ? data[name] : defaultValue;
      });
    } else {
       // TODO: use localStorage.getItem (not available to packaged apps).
       chess[name] = defaultValue;
    }
  };
  fetchPreference('nickname', 'Anonymous');
  fetchPreference('timeControlIndex', 1);
  fetchPreference('ratingIndex', 0);

}, false);


