Scoresheet = (function() {

  var movesPerPage = 25;

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
    element.__proto__ = Scoresheet.prototype;
    element.decorate();
    return element;
  }

  Scoresheet.prototype = {
 
    __proto__: HTMLDivElement.prototype,

    nextPageStartIndex_: 1,

    decorate: function() {
      this.classList.add('scoresheet');
      this.reset();
    },

    addMove: function(index, color, move) {
      var entry = ScoresheetMove.find(index);
      if (!entry) {
        entry = new ScoresheetMove(index);
        this.appendChild(entry);
      }
      entry.setMove(color, move);
    },

    reset: function() {
      // TOOD: Add support for starting from an arbitary move index if resuming
      // and existing saved game.
      while(this.firstChild) {
        this.removeChild(this.firstChild);
      }
      for (var i = 0; i < movesPerPage; i++)
        this.appendChild(new ScoresheetMove(i + 1));         
    },

  };

  return Scoresheet;

})();
