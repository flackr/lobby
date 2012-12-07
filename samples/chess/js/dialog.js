

Dialog = (function() {

  var registry_ = {};

  var activeDialog_ = null;

  function Dialog(name) {
    this.initialize(name);
  }

  function getElement(name) {
    return $(name + '-dialog');
  }

  Dialog.Style = {
    OK: 0,
    OKCANCEL: 1,
    CANCEL: 2,
  }

  Dialog.prototype = {

     name: null,

     dragFrom: null,

     initialize: function(name) {
       this.name = name;
       var element = getElement(name);


       if (!element)
         console.log('unable to find dialog = ' + name);

       // Add listeners for close and cancel.
       var closeButtons = element.getElementsByClassName('close-button');
       for (var i = 0; i < closeButtons.length; i++)
         closeButtons[i].addEventListener('click', this.close.bind(this));
       var cancelButtons = element.getElementsByClassName('cancel-button');
       for (var i = 0; i < cancelButtons.length; i++)
         cancelButtons[i].addEventListener('click', this.cancel.bind(this));

       var titleBar = element.getElementsByClassName('dialog-title')[0];
       if (titleBar)
         titleBar.addEventListener('mousedown', this.onMouseDown_.bind(this));
     },

     show: function() {
       Dialog.show(this.name);
     },

     close: function() {
       this.commit();
       Dialog.dismiss(this.name);
     },

     cancel: function() {
       if (this.onCancelCallback)
         this.onCancelCallback();
       Dialog.dismiss(this.name);
     },

     commit: function() {
       // Override for specific dialog to commit changes to the dialog before closing.
     },

     onMouseDown_: function(e) {
       this.dragFrom = {
         x: e.clientX,
         y: e.clientY
       };
       document.addEventListener('mouseup', this.onMouseUp_.bind(this));
       document.addEventListener('mousemove', this.onMouseMove_.bind(this));
       return false;
     },

     onMouseUp_: function(e) {
       if (this.dragFrom) {
         this.dragFrom = null;
         document.removeEventListener('mouseup', this.onMouseUp_);
         document.removeEventListener('mousemove', this.onMouseMove_);
         return false;
       }
       return true;
     },

     onMouseMove_: function(e) {
       if (this.dragFrom) {
         var dragTo = {
           x: e.clientX,
           y: e.clientY
         };
         var dx = dragTo.x - this.dragFrom.x;
         var dy = dragTo.y - this.dragFrom.y;
         this.dragFrom = dragTo;
         var dialog = getElement(this.name);
         var top = dialog.offsetTop + dy;
         var left = dialog.offsetLeft + dx;
         var bottom = top + dialog.clientHeight;
         var right = left + dialog.clientWidth;
         // Constrain to document bounds.
         if (bottom > document.body.clientHeight)
           top = document.body.clientHeight - dialog.clientHeight;
         // Back off the limit for the right edge of the dialog by the
         // width of the drop shadow to prevent possible layout changes.
         var limit = document.body.clientWidth - 5;
         if (right > limit)
           left = limit - dialog.clientWidth;
         if (top < 0)
           top = 0;
         if (left < 0)
           left = 0;
         dialog.style.left = left + 'px';
         dialog.style.top = top + 'px';
         return false;
       }
       return true;
     },

  }

  /**
   * Displays a popup dialog.
   * @param {string} name Registered name of the dialog.
   * @param {{x: number, y: number}=} opt_position  Optional position of the dialog.
   *     If not specified, the dialog is centered.
   */
  Dialog.show = function(name, opt_position) {
    console.log('show dialog ' + name);
    activeDialog_ = registry_[name];
    var element = getElement(name);
    element.classList.add('positioning');
    element.style.left = '50%';
    element.style.top = '50%';
    element.hidden = false;
    element.parentNode.hidden = false;
    var width = element.clientWidth;
    var height = element.clientHeight;
    var left = element.offsetLeft;
    var top = element.offsetTop;
    console.log('dialog ' + name + ' is ' + width + ' by ' + height);
    var position = opt_position ? opt_position :
        {x: Math.floor(left - width/2), 
         y: Math.floor(top - height/2)};
    element.style.left = position.x + 'px';
    element.style.top = position.y + 'px';
    element.classList.remove('positioning');
  }

  Dialog.dismiss = function(name) {
    console.log('dismiss dialog');
    var element = getElement(name);
    element.hidden = true;
    element.parentNode.hidden = true;
  }

  Dialog.register = function(name, dialog) {
    registry_[name] = dialog;
  }

  Dialog.getInstance = function(name) {
    return registry_[name];
  }

  Dialog.showInfoDialog = function(title, message, opt_style) {
    var dialog = Dialog.getInstance('info');
    dialog.setTitle(title);
    dialog.setMessage(message);
    dialog.setStyle(opt_style ? opt_style : Dialog.Style.OK);
    dialog.show();
  }

  Dialog.showConfirmDialog = function(title, message, callback) {
    // TODO: implement me.
  }

  Dialog.showPromotionDialog = function(square, callback) {
    var dialog = Dialog.getInstance('promotion');
    dialog.setSquare(square);
    dialog.setCallback(callback);
    dialog.show();
  }

  Dialog.showJoinGameDialog = function(game) {
    var dialog = Dialog.getInstance('join-game');
    dialog.setGame(game);
    dialog.show();
  }

  return Dialog;

})();

/**
 * Displays a simple information dialog with a customizable title and message.
 */
InfoDialog = function() {
  Dialog.apply(this, ['info']);
}

InfoDialog.prototype = {
  __proto__: Dialog.prototype,

  // TODO: Remove this unless additional initialization required.
  initialize: function(name) {
    Dialog.prototype.initialize.call(this, name);
  },

  setTitle: function(title) {
    $('info-dialog-title').textContent = title;
  },

  setMessage: function(message) {
    $('info-dialog-message').textContent = message;
  },

  setStyle: function(style) {
    var setStyle = function(buttonType, state) {
      var query = '.button-bar > .' + buttonType + '-button';
      var button = $('info-dialog').querySelector(query);
      button.hidden = !state;
    };
    switch(style) {
    case Dialog.Style.OK:
      setStyle('close', true);
      setStyle('cancel', false);
      break;
    case Dialog.Style.CANCEL:
      setStyle('close', false);
      setStyle('cancel', true);
      break;
    case Dialog.Style.OKCANCEL:
      setStyle('close', true);
      setStyle('cancel', true);
      break;
    default:
      console.log('unknown style');
    }
  },

  setCancelCallback: function(callback) {
    this.onCancelCallback_ = callback;
  },
};


/**
 * Game details dialog.
 */
GameDetailsDialog = function() {
  Dialog.apply(this, ['game-details']);
}

GameDetailsDialog.prototype = {
  __proto__: Dialog.prototype,

  commit: function() {
    $('host-new-chess-game').disabled = true;
    var lobbyUrl = $('chess-lobby-url').value;
    var listenPort = $('game-detail-port').value;
    var description = 'Level: ' + $('player-level').value + ', Time Controls: ' +
        $('time-controls').value;
    chess.nickname = $('nickname').value;
    var timing = $('time-controls').value.split('/');
    chess.timeControl = parseInt(timing[0]);
    chess.timeIncrement = parseInt(timing[1]);
    chess.createGame(lobbyUrl, listenPort, description);
    Overlay.dismiss('chess-lobby');
    // Wait for current dialog to finish closing before opening waiting dialog.
    setTimeout(function() {
      Dialog.showInfoDialog('Starting Game', 
                            'Waiting for opponent to join',
                            Dialog.Style.CANCEL);
      var onCancel = function() {
         // TODO: disconnect the server.
      }
      Dialog.getInstance('info').setCancelCallback(onCancel);
    });
  }
};


/* ----- Join Game Dialog ----- */

JoinGameDialog = function() {
  Dialog.apply(this, ['join-game']);
}

JoinGameDialog.prototype = {
  __proto__: Dialog.prototype,

  initialize: function(name) {
    Dialog.prototype.initialize.call(this, name);
    var self = this;
    var joinGame = function(role) {
      chess.nickname = $('join-game-nickname').value;
      window.client = new chess.GameClient(new lobby.Client(self.game), role);
      self.close();
      Overlay.dismiss('chess-lobby');
    }
    $('play-button').addEventListener('click', function() {
      joinGame(chess.Role.PLAYER_UNASSIGNED);
    });
    $('watch-button').addEventListener('click', function() {
      joinGame(chess.Role.OBSERVER);
    });
  },

  setGame: function(game) {
     this.game = game;
  }

};


/* ----- Pawn Promotion ----- */

PawnPromotionDialog = function() {
  Dialog.apply(this, ['promotion']);
}

PawnPromotionDialog.prototype = {
  __proto__: Dialog.prototype,

  callback_: null,

  promotionSquare_: null,

  initialize: function(name) {
    Dialog.prototype.initialize.call(this, name);
    $('promotion-options').addEventListener(
        'click', this.onClick_.bind(this));
  },

  setSquare: function(square) {
    this.promotionSquare_ = square;
    var rank = parseInt(square.charAt(1));
    var color = (rank == 8) ? 'W' : 'B';
    var setPromotionPiece = function(position, type) {
      var element = $(position);
      while (position.firstChild != null) {
        position.removeCHild(position.firstChild);
      }
      var piece = document.createElement('div');
      piece.className = color + type;
      element.appendChild(piece);
    }
    setPromotionPiece('queen-promotion', 'Q');
    setPromotionPiece('rook-promotion', 'R');
    setPromotionPiece('bishop-promotion', 'B');
    setPromotionPiece('knight-promotion', 'N');
  },

  setCallback: function(callback) {
    this.callback_ = callback;
  },

  onClick_: function(event) {
    var target = event.target;
    var className = target.className;
    var pieceType = className.charAt(1);
    if (className.charAt(0) == 'W')
      pieceType = pieceType.toLowerCase();
    this.callback_(this.promotionSquare_, pieceType);
    event.stopPropagation();
    event.preventDefault();
    this.cancel();
  }
};

window.addEventListener('load', function() {
  Dialog.register('info', new InfoDialog());
  Dialog.register('game-details', new GameDetailsDialog());
  Dialog.register('join-game', new JoinGameDialog());
  Dialog.register('promotion', new PawnPromotionDialog());
}, false);
