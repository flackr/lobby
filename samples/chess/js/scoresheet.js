Scoresheet = (function() {

  var movesPerPage = 18;

  var Layout = {
    TOP_DOWN: 0,
    BOTTOM_UP: 1
  };

  /**
   * Constructor for a move on a score sheet page.
   * Represents both white's move and black's reply.
   */
  function ScoresheetMove(index) {
    var element = document.createElement('div');
    element.moveIndex_ = index;
    element.__proto__ = ScoresheetMove.prototype;
    element.decorate();
    return element;
  }

  ScoresheetMove.find = function(index) {
     var moveNumberElement = $('move-index-' + index);
     return moveNumberElement ? moveNumberElement.parentNode : null;
  }

  ScoresheetMove.prototype = {
     __proto__: HTMLDivElement.prototype,

    decorate: function() {
      this.classList.add('scoresheet-move');
      var moveNumber = document.createElement('div');
      moveNumber.className = 'move-index';
      moveNumber.id = 'move-index-' + this.moveIndex_;
      moveNumber.textContent = this.moveIndex_;
      this.appendChild(moveNumber);
      var whiteMove = document.createElement('div');
      whiteMove.className = 'white-move';
      this.appendChild(whiteMove);
      var blackMove = document.createElement('div');
      blackMove.className = 'black-move';
      this.appendChild(blackMove);
    },

    setMove: function(color, move) {
      var element = this.querySelector(color == 'W' ?
          '.white-move' : '.black-move');
      element.textContent = move;
    },

  }

  function Scoresheet() {
    var element = document.createElement('div');
    return Scoresheet.decorate(element);
  }

  Scoresheet.decorate = function(el) {
    el.__proto__ = Scoresheet.prototype;
    el.decorate();
    return el;
  };

  Scoresheet.prototype = {
 
    __proto__: HTMLDivElement.prototype,

    nextPageStartIndex_: 1,

    decorate: function() {
      this.classList.add('scoresheet');
      this.clocks_ = [];
      this.clocks_.push(new Scoresheet.Clock(Layout.TOP_DOWN));
      this.appendChild(this.clocks_[0]);
      var moveList = document.createElement('div');
      moveList.className = 'move-list';
      this.appendChild(moveList);
      this.clocks_.push(new Scoresheet.Clock(Layout.BOTTOM_UP));
      this.appendChild(this.clocks_[1]);
      this.reset();
    },

    addMove: function(index, color, move) {
      var entry = ScoresheetMove.find(index);
      if (!entry) {
        entry = new ScoresheetMove(index);
        var moveList = this.querySelector('move-list');
        moveList.appendChild(entry);
      }
      entry.setMove(color, move);
    },

    reset: function() {
      // TOOD: Add support for starting from an arbitary move index if resuming
      // and existing saved game.
      var moveList = this.querySelector('.move-list');
      while(moveList.firstChild) {
        moveList.removeChild(moveList.firstChild);
      }
      for (var i = 0; i < movesPerPage; i++)
        moveList.appendChild(new ScoresheetMove(i + 1));
      this.setPlayerNames([chess.nickname, 'Anonymous']);  
    },

    setPlayerNames: function(players) {
      this.players_ = players;
      this.syncView();
    },

    syncView: function() {
      var view = chess.chessboard.getView();
      if (view == ChessBoard.View.WHITE_AT_TOP) {
         this.clocks_[0].setPlayerName(this.players_[0]);
         this.clocks_[1].setPlayerName(this.players_[1]);
         // TODO: update timers.
      } else {
         this.clocks_[0].setPlayerName(this.players_[1]);
         this.clocks_[1].setPlayerName(this.players_[0]);
      }
    },

  };

  /**
   * 
   */
  Scoresheet.Clock = function(layout) {
    var element = document.createElement('div');
    element.timeControl_ = 5; // TODO: Populate based on move recent game.
    element.timeIncrement_ = 3;
    element.layout_ = layout;
    element.__proto__ = Scoresheet.Clock.prototype;
    element.decorate();
    return element;
  };

  Scoresheet.Clock.prototype = {
  
    __proto__: HTMLDivElement.prototype,

    decorate: function() {
      this.className = 'scoresheet-clock';
      var player = document.createElement('div');
      player.className = 'scoresheet-player-name';
      player.textContent = 'Anonymous';
      var timers = document.createElement('div');
      timers.className = 'scoresheet-timers';
      var mainTimer = document.createElement('div');
      mainTimer.className = 'scoresheet-main-timer';
      var incrementTimer = document.createElement('div');
      incrementTimer.className = 'scoresheet-increment-timer';
      timers.appendChild(mainTimer);
      timers.appendChild(incrementTimer);
      if (this.layout_ == Layout.TOP_DOWN) {
        this.appendChild(player);
        this.appendChild(timers);
      } else {
        this.appendChild(timers);
        this.appendChild(player);
      }
      this.resetTimeControl();
    },

    startClock: function() {
    },

    stopClock: function() {
    },

    resetTimeControl: function() {
      var timer = this.querySelector('.scoresheet-main-timer');
      timer.textContent = this.timeControl_ + ':00';
      this.resetIncrementTimer();
    },

    resetIncrementTimer: function() {
      var timer = this.querySelector('.scoresheet-increment-timer');
      timer.textContent = this.timeIncrement_ + ':00';
    },

    setPlayerName: function(name) {
      var player = this.querySelector('.scoresheet-player-name');
      player.textContent = name;
    }

  };

  return Scoresheet;

})();
