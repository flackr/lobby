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
      this.appendChild(new Scoresheet.Clock(Layout.TOP_DOWN));
      var moveList = document.createElement('div');
      moveList.className = 'move-list';
      this.appendChild(moveList);
      this.appendChild(new Scoresheet.Clock(Layout.BOTTOM_UP));
      this.reset();
    },

    addMove: function(index, color, move) {
      var entry = ScoresheetMove.find(index);
      entry.setMove(color, move);
      if (color == 'B') {
        entry = ScoresheetMove.find(index + 1);
        if (!entry) {
          entry = new ScoresheetMove(index + 1);
          var moveList = this.querySelector('.move-list');
          moveList.appendChild(entry);
        }        
      }
      var moveList = this.querySelector('.move-list');
      var height = moveList.clientHeight;
      var scrollHeight = moveList.scrollHeight;
      if (scrollHeight > height) {
        moveList.scrollTop = scrollHeight - height;
      }
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
      this.setPlayerNames({white: chess.nickname, black: '?'});  
    },

    setPlayerNames: function(players) {
      this.view_ = ChessBoard.View.BLACK_AT_TOP;
      var moveList = this.querySelector('.move-list');
      moveList.previousSibling.setPlayerName(players.black);
      moveList.nextSibling.setPlayerName(players.white);
      this.syncView();
    },

    syncView: function() {
      var view = chess.chessboard.getView();
      if (view != this.view_) {
         var moveList = this.querySelector('.move-list');
         var previous = moveList.previousSibling;
         var next = moveList.nextSibling;
         var parent = moveList.parentNode;
         parent.removeChild(previous);
         parent.removeChild(next);
         parent.insertBefore(next, moveList);
         parent.appendChild(previous);
         previous.flipLayout();
         next.flipLayout();
         this.view_ = view;
      }
    },

    updateClocks: function(data) {
      var moveList = this.querySelector('.move-list');
      var first = moveList.previousSibling;
      var second = moveList.nextSibling;
      if (data.controls) {
        first.setTimeControls(data.controls);
        second.setTimeControls(data.controls);
      }
      if (this.view_ == ChessBoard.View.BLACK_AT_TOP) {
        first.updateClock(data.black);
        second.updateClock(data.white);
        if(data.startClock) {
          if (data.startClock == 'white') {
            first.stopClock();
            second.startClock();
          } else {
            second.stopClock();
            first.startClock();
          }
        }
      } else {
        first.updateClock(data.white);
        second.updateClock(data.black);
        if(data.startClock) {
          if (data.startClock == 'white') {
            second.stopClock();
            first.startClock();
          } else {
            first.stopClock();
            second.startClock();
          }
        }
      }
    }

  };

  /**
   * 
   */
  Scoresheet.Clock = function(layout) {
    var element = document.createElement('div');
    element.timeControl_ = 5; // TODO: Populate based on most recent game.
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
      player.textContent = '?';
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
      this.startTime_ = Date.now();
      this.resetIncrementTimer();
      var self = this;
      var incrementalCountdown = function() {
        var now = Date.now();
        var delta = (now - self.startTime_) / 1000;
        var remainder = self.timeIncrement_ - delta;
        self.updateIncrementTimer_(remainder);
        if (remainder < 0) {
          clearInterval(self.timer_);
          self.timer_ = setInterval(timerCountdown, 1000);
        }
      };
      var timerCountdown = function() {
        var now = Date.now();
        var elapsed = (now - self.startTime_) / 1000;
        self.updateMainTimer_(self.remaining_ + self.timeIncrement_ - elapsed);
      };
      this.timer_ = setInterval(incrementalCountdown, 100);
    },

    stopClock: function() {
      if (this.timer_) {
        clearInterval(this.timer_);
        this.timer_ = null;
      }
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
    },

    flipLayout: function() {
      if (this.layout_ == Layout.TOP_DOWN) {
        var player = this.querySelector('.scoresheet-player-name');
        var timers = player.nextSibling;
        var parent = timers.parentNode;
        parent.removeChild(timers);
        parent.insertBefore(timers, player); 
        this.layout_ = Layout.BOTTOM_UP;
      } else {
        var timers =  this.querySelector('.scoresheet-timers');
        var player = timers.nextSibling;
        var parent = timers.parentNode;
        parent.removeChild(player);
        parent.insertBefore(player, timers); 
        this.layout_ = Layout.TOP_DOWN
      }
    },

    updateClock: function(data) {
      this.remaining_ = data.remaining;
      this.updateMainTimer_(data.remaining);
      this.updateIncrementTimer_(data.increment);
    },

    setTimeControls: function(data) {
      this.timeControl_ = parseInt(data.limit);
      this.timeIncrement_ = parseInt(data.increment);
    },

    updateMainTimer_: function(remaining) {
      if (remaining < 0) {
         remaining = 0;
         var moves = chess.chessboard.getMoves();
         var winner = (moves.length % 2 == 0) ? 'Black' : 'White';
         chess.stopGame(winner,'Exceeded time control.');
         this.stopClock();
      }
      var seconds = Math.floor(remaining);
      var minutes = Math.floor(seconds / 60);
      seconds = seconds - 60 * minutes;
      if (seconds < 10)
        seconds = '0' + seconds;
      var label = minutes + ':' + seconds;
      this.querySelector('.scoresheet-main-timer').textContent = label;
    },

    updateIncrementTimer_: function(remaining) {
      if (remaining < 0)
        remaining = 0; // TODO: Apply overrun to main timer.
      var seconds = Math.floor(remaining);
      var hundreths = Math.floor(100 * (remaining - seconds));
      if (hundreths < 10)
        hundreths = '0' + hundreths;
      var label = seconds + ':' + hundreths;
      this.querySelector('.scoresheet-increment-timer').textContent = label;
   }

  };

  return Scoresheet;

})();
