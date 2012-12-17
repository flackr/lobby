ChessBoard = (function() {

  /**
   * Views of the board.
   */
  ChessBoard.View = {
    BLACK_AT_TOP: 0, 
    WHITE_AT_TOP: 1
  };

  /**
   * Piece colors.
   * @enum
   */
  var Color = {
    BLACK: 'B',
    WHITE: 'W'
  };

  /**
   * Mapping from piece type specified in FEN notation to class constructor.
   * Initialized during creation of constructors.
   * @type{!Object.<string,Object>) 
   */
  var PieceTypes = {};

  /**
   * Finds ancestor element matching a search condition.
   * @param {!Element} el Reference element for starting the search.
   * @param {function} selectorFunc Function to test whether the element
   *     matches the search condition.
   */
  function findAncestor(el, selectorFunc) {
    if (selectorFunc(el) == true)
      return el;
    if (el.parentNode)
      return findAncestor(el.parentNode, selectorFunc);
    return false;
  }

  function ChessBoard() {
    var element = document.createElement('div');
    element.__proto__ = ChessBoard.prototype;
    element.decorate();
    return element;
  }

  ChessBoard.prototype = {

    __proto__: HTMLDivElement.prototype,

    /**
     * Selected square denoting the piece to move.
     * @type(string?}
     * @private
     */
    selectedSquare_: null,
    /**
     * Next player to move.
     * @enum
     * @private
     */
    playerToMove_: Color.WHITE,

    /**
     * Allowable castling options based on previous piece movement. Uppercase
     * denotes white and lowercase black castling.  'Kk' denotes kingside, and 
     * 'Qq' denotes queenside castling.
     * @type {string}
     * @private
     */
    castling_: 'KQkq',

    /**
     * If en passant is possible, it indicates the capture square.
     * @type {?string}
     * @private
     */
    enpassant_: null,

    /**
     * List of legal moves.  Legal moves tracked for both sides regardless of
     * which side is to move in order to track if player is in check or can
     * castle.
     * @type {{fromSquare: string, toSquare: Array.<string>}}
     * @private
     */
    legalMoveList_: {},

    /**
     * Index of current move for scoresheet.
     * @type {Number}
     * @private
     */
    moveIndex_: 1,

    /**
     * Number of moves since last pawn move or capture.
     * Used to detect 50 move rule. 
     */
    movesSincePawnMoveOrCapture_: 0,

    /**
     * View of the board.
     * @type {enum}
     * @private
     */
    view_: ChessBoard.View.BLACK_AT_TOP,

    /**
     * List of noves played in the game.
     */
    moveList_: [],

    /**
     * Positions used to detect threefold repetition.
     * @type{Object.<string,Number>} Number of times each position has
     *     appeared.
     */
    positions_: {},

    decorate: function() {
      this.classList.add('chess-board-container');
      this.addEventListener('click', this.onClick.bind(this));
      this.layoutBoard_();
    },

    /**
     * Positions squares and labels on the chessboard from either a white or
     * black perspective.
     */
    layoutBoard_: function() {
      var board = document.createElement('div');
      board.classList.add('chess-board');
      this.appendChild(board);

      var fromRank = 7;
      var toRank= -1;
      var deltaRank = -1;
      var fromFile = 0;
      var toFile = 8;
      var deltaFile = 1;
      if (this.view_ == ChessBoard.View.WHITE_AT_TOP) {
        var fromRank = 0;
        var toRank= 8;
        var deltaRank = 1;
        var fromFile = 7;
        var toFile = -1;
        var deltaFile = -1;
      }
      for (var rank = fromRank; rank != toRank; rank += deltaRank) {
        var row = document.createElement('div');
        board.appendChild(row);
        var rankLabel = document.createElement('div');
        rankLabel.textContent = String(1 + rank);
        row.appendChild(rankLabel);
        for (var file = fromFile; file != toFile; file += deltaFile) {
          var square = document.createElement('div');
          var squareColor = (rank + file) % 2 == 0 ?
            'black-square' : 'white-square';
          square.classList.add(squareColor);
          square.id = this.squareId(file, rank);
          row.appendChild(square);
        }
      }
      var row = document.createElement('div');
      board.appendChild(row);
      var flipper = document.createElement('div');
      row.appendChild(flipper);
      var left = document.createElement('div');
      left.className = 'triangle-top-left';
      flipper.appendChild(left);
      var right = document.createElement('div');
      right.className = 'triangle-bottom-right';
      flipper.appendChild(right);

      for (var i = fromFile; i != toFile; i += deltaFile) {
        var fileLabel = document.createElement('div');
        fileLabel.textContent = String.fromCharCode(65 + i);
        row.appendChild(fileLabel);
      }
    },

    /**
     * Label for a square in algebraic notation.
     * @param {Number} file Zero based index of the column from left to right.
     * @param {Number} rank Zero based index of the row starting from the
     *     bottom.
     * @return {string}
     */
    squareId: function(file, rank) {
        return String.fromCharCode(65 + file) + (1+rank);
    },

    /**
     * Retrieve ID of the a square.
     * @param {!Element} element Reference element.
     * @return {string} ID in algebraic notation.
     */
    getSquare: function(element) {
      var selector = function(el) {
        var cl = el.classList;
        return cl && (cl.contains('white-square') ||
          cl.contains('black-square'));
      };
      var square = findAncestor(element, selector);
      return square ? square.id : null;
    },

    /**
     * Reset board to starting position.
     */
    reset: function() {
      this.moveList_ = [];
      this.positions_ = {};
      this.setPosition(
          'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    },

    /**
     * Setup a position on a board.
     * @param {string} fen Board setup described in Forsyth–Edwards notation.
     */
    setPosition: function(fen) {
      this.hideLastMove();
      // Clear board.
      for (var file = 0; file < 8; file++) {
        for (var rank = 0; rank < 8; rank++) {
          var square = this.squareId(file, rank);
          var element = $(square);
          while(element.firstChild)
            element.removeChild(element.firstChild);
        }
      }

      // FEN made of up following parts: 
      //  piece placement
      //  color to move
      //  castling restrictions
      //  en passant capture square
      //  # of half moves since last pawn advance or capture.
      //  # of full moves (including current turn).
      var parts = fen.split(' ');

      // Place pieces.
      var rank = 0;
      var file = 0;
      var piecePlacement = parts[0];
      for(var i = 0; i < piecePlacement.length; i++) {
        var ch = fen.charAt(i);
        if (ch >= '1' && ch <= '8') {
          file += parseInt(ch);
        } else if (ch == '/') {
          rank++;
          file = 0;
        } else {
          this.placePiece( this.squareId(file, rank), ch);
          file++;
        }
      }
      // Color to move.
      this.playerToMove_ = (parts[1] == 'b') ? Color.BLACK : Color.WHITE;
      
      // Castling rights.
      this.castling_ = parts[2];

      // En passant.
      this.enpassant_ = parts[3] == '-' ? null : parts[3].toUpperCase();

      // Ply counts.
      this.movesSincePawnMoveOrCapture_ = parts[4];
      this.moveIndex_ = parts[5];

      this.updateLegalMoves();
    },

    placePiece: function(square, piece) {
      this.removePiece(square);
      $(square).appendChild(new ChessBoard.ChessPiece(piece));
    },

    /**
     * Creates FEN representation of the board.
     * @return {string}
     */ 
    toString: function() {
      var fen = [];
      var segments = [];
      for (var rank = 0; rank < 8; rank++) {
        var blankCounter = 0;
        for (var file = 0; file < 8; file++) {
          var square = this.squareId(file, rank);
          var piece = $(square).firstChild;
          if (piece) {
            if (blankCounter) {
              segments.push(blankCounter);
              blankCounter = 0;
            }
            segments.push(piece.pieceType_);
          } else {
            blankCounter++;
          }
        }
        if (rank < 7) {
          if (blankCounter)
            segments.push(blankCounter);
          segments.push('/');
        }
      }
      fen.push(segments.join(''));
      fen.push(this.playerToMove_ == Color.WHITE ? 'w' : 'b');
      fen.push(this.castling_ != '' ? this.castling_ : '-');
      fen.push(this.enpassant_ ? this.enpassant_.toLowerCase() : '-');

      // TODO - fix ply counts once tracked.
      fen.push(0);
      fen.push(this.moveIndex_);

      return fen.join(' ');
    },

    /**
     * Moves a piece between two squares.
     * @param {string} fromSquare ID of the square to move from in algebraic
     *     notation.
     * @param {string} toSquare ID of the square to move to in algebraic
     *     notation.
     * @param {boolean} trialMove  True if the move a trial moved used to prune
     *     the list of legal moves.
     * @param {boolean} messageResponse  True if the move is made in response
     *      to a messgae from another client.
     * @return {boolean} True if the move was legal, false if rejected.
     */
    move: function(fromSquare, toSquare, trialMove, messageResponse) {

      // Store list of possible captures for disambiguation.
      var pieceType = $(fromSquare).firstChild.pieceType_;
      var movesTargettingSquare = trialMove ? [] :
          this.findAllMovesTargettingSquare(toSquare, pieceType);

      var opposingPlayer = this.playerToMove_ == Color.WHITE ? 
          Color.BLACK : Color.WHITE;

      // On promoting a pawn, the toSquare may be of the form E8=Q to denote
      // the promotion piece.
      var promotionPiece = null;
      if (toSquare.indexOf('=') > 0) {
        var parts = toSquare.split('=');
        toSquare = parts[0];
        promotionPiece = parts[1];
      }

      if (!trialMove && !promotionPiece && !messageResponse) {
        // Make sure correct player is moving.
        var movingPiece = $(fromSquare).firstChild;
        if (movingPiece.pieceColor_ != this.playerToMove_)
          return false;
        var role = chess.getRole();
        if (role == chess.Role.OBSERVER)
          return false;
        if (role == chess.Role.PLAYER_BLACK &&
            this.playerToMove_ != Color.BLACK)
          return false;
        if (role == chess.Role.PLAYER_WHITE &&
            this.playerToMove_ != Color.WHITE)
          return false;

        // Make sure move is in list of legal moves for the selected piece.
        var allowed = this.legalMoveList_[fromSquare];
        if (allowed) {
          var foundMove = false;
          for (var i = 0; i < allowed.length; i++) {
            if (allowed[i] == toSquare) {
              foundMove = true;
              break;
            }
          }
          if (!foundMove)
            return false;
        } else {
          return false;
        }
      }

      var capturedPiece = this.removePiece(toSquare);
      var piece = this.removePiece(fromSquare);
      $(toSquare).appendChild(piece);

      if (!trialMove) {
        var displayMove = null;

        // Update castling restrictions.
        var castlingRestriction = null;
        switch (fromSquare) {
        case 'A1':
          castlingRestriction = /Q/;
          break;
        case 'E1':
          castlingRestriction = /[KQ]/g;
          break;
        case 'H1':
          castlingRestriction = /K/;
          break;
        case 'A8':
          castlingRestriction = /q/;
          break;
        case 'E8':
          castlingRestriction = /[kq]/g;
          break;
        case 'H8':
          castlingRestriction = /k/;
          break;
        }
        if (castlingRestriction) {
          this.castling_ = this.castling_.replace(castlingRestriction, '');
        }
        // Complete castling.
        if (piece.isKing()) {
          if (fromSquare == 'E1') {
            if(toSquare == 'C1') {
              var piece = this.removePiece('A1');
              $('D1').appendChild(piece);
              displayMove = 'O-O-O';
            } else if (toSquare == 'G1') {
              var piece = this.removePiece('H1');
              $('F1').appendChild(piece);
              displayMove = 'O-0';
            }
          } else if (fromSquare == 'E8') {
            if(toSquare == 'C8') {
              var piece = this.removePiece('A8');
              $('D8').appendChild(piece);
              displayMove = 'O-O-O';
            } else if (toSquare == 'G8') {
              var piece = this.removePiece('H8');
              $('F8').appendChild(piece);
              displayMove = 'O-O';
            }
          }
        }

        if (toSquare == this.enpassant_ && piece.isPawn()) {
          // Remove pawn that was captured en passant.
          var rank = piece.getRank(fromSquare);
          var file = piece.getFile(toSquare);
          this.removePiece(this.squareId(file, rank));
        }
        this.enpassant_ = null;
        if (piece.isPawn()) {
           // Update en passant square.
           var fromRank = piece.getRank(fromSquare);
           var toRank = piece.getRank(toSquare);
           if (Math.abs(toRank - fromRank) == 2) {
             this.enpassant_ = this.squareId(piece.getFile(fromSquare),
                                             (fromRank + toRank) / 2);
           }
           if (toRank == 0 || toRank == 7) {
             if (!promotionPiece) {
               this.promotePawn_(fromSquare, toSquare, capturedPiece);
               // Early return.  Once piece selected from promotion dialog
               // a second call is made to move to do that actual move.
               return false;
             } else {
               this.placePiece(toSquare, promotionPiece);
             }
           }
        }

        // Save values before advancing to next move.
        var scoresheetMoveIndex = this.moveIndex_;
        var scoreColor = this.playerToMove_; 
        this.playerToMove_ = opposingPlayer;

        if (opposingPlayer == Color.WHITE) {
          this.moveIndex_++;
          opposingPlayer = Color.BLACK;
        } else {
          opposingPlayer = Color.WHITE;
        }

        var saveMoves = this.legalMoveList_;
        this.updateLegalMoves();
        var opposingMoves = this.getCandidateMoves_(opposingPlayer);

        // Update scoresheet after advancing to next player turn in order
        // to determine if player is in check or checkmate.
        if (displayMove) {
          // Nothing left to do.
        } else if (piece.isPawn() && capturedPiece) {
          displayMove = capturedPiece.isPawn() ?
              fromSquare.charAt(0) + toSquare.charAt(0) : 
              fromSquare.charAt(0) + 'x' + toSquare;
          displayMove = displayMove.toLowerCase();
        } else {
          displayMove = toSquare;
          if (capturedPiece)
            displayMove = 'x' + displayMove;
          if (movesTargettingSquare.length > 1) {           
            var file = fromSquare.charAt(0);
            var rank = fromSquare.charAt(1);
            var tally = {};
            tally[file] = 0;
            tally[rank] = 0;
            var bump = function(key) {
              if (key in tally)
                 tally[key]++;
            }
            for (var i = 0; i < movesTargettingSquare.length; i++) {
               var move = movesTargettingSquare[i];
               if (move == fromSquare)
                 continue;
               bump(move.charAt(0));
               bump(move.charAt(1));
            }
            var prefix = (tally[file] == 0) ? file : 
                (tally[rank] == 0 ? rank : fromSquare);
            displayMove = prefix + displayMove;
          }
          displayMove = displayMove.toLowerCase();
          if (!piece.isPawn())
            displayMove = piece.pieceType_.toUpperCase() + displayMove;
        }
        if (promotionPiece)
            displayMove = displayMove + '=' + promotionPiece.toUpperCase();

        // Check if player is in check or checkmate
        if (this.isInCheck(this.playerToMove_, opposingMoves)) {
          var suffix = '#';
          for (key in this.legalMoveList_) {
            if (this.legalMoveList_[key].length > 0) {
              suffix = '+';
              break;
            }
          }
          displayMove = displayMove + suffix;
        }
 
        chess.scoresheet.addMove(scoresheetMoveIndex, 
                                 scoreColor, 
                                 displayMove);
        this.moveList_.push({from: fromSquare, to: toSquare});

        // Test for draw conditions.
        var position = this.toString();
        var key = position.split(' ')[0];
        if (!this.positions_[key])
          this.positions_[key] = 1;
        else
          this.positions_[key]++;
        if (this.positions_[key] > 2) {
          Dialog.showInfoDialog('Game Over::\u00A0\u00A01/2 - 1/2', 
                                'Draw by threefold repetition.');
          // TODO: set the game state.
        }
        if (piece.isPawn() || capturedPiece) {
          this.movesSincePawnMoveOrCapture_ = 0;
        } else {
           if (++this.movesSincePawnMoveOrCapture_ > 99) {
             Dialog.showInfoDialog('Game Over::\u00A0\u00A01/2 - 1/2', 
                                  '50 moves with no capture or pawn move.');
             // TODO: set the game state.
           }
        }
        // TODO: Test for insufficient mating material.

        $('move-sound').play();
        this.showLastMove();
        if (window.client && ! messageResponse) {
          var message = {
            moveFrom: fromSquare,
            moveTo: toSquare,
            position: position,
            text: displayMove,
            echo: false,
          };
          window.client.sendMessage(message);
        }
      }
      return true;
    },

    showLastMove: function() {
      if(this.moveList_.length > 0) {
        var marker = this.querySelector('.last-move-marker');
        if (!marker) {
          var svgns = 'http://www.w3.org/2000/svg';
          var version = '1.1';
          marker = document.createElement('div');
          marker.className = 'last-move-marker';
          this.appendChild(marker);
          var svg = document.createElementNS(svgns, 'svg');
          svg.setAttribute('version', version);
          marker.appendChild(svg);
          var graphics = document.createElementNS(svgns, 'g');
          svg.appendChild(graphics);
          var path = document.createElementNS(svgns, 'path');
          path.className = 'move-arrow';
          graphics.appendChild(path);
        }
        var last = this.moveList_[this.moveList_.length-1];

        var fromBounds = this.getBounds(last.from);
        var toBounds = this.getBounds(last.to);

        var x1 = fromBounds.left + 0.5 * fromBounds.width;
        var y1 = fromBounds.top + 0.5 * fromBounds.height;
        var x2 = toBounds.left + 0.5 * toBounds.width;
        var y2 = toBounds.top + 0.5 * toBounds.height;
        var dx = x2 - x1;
        var dy = y2 - y1;
        var len = Math.floor(Math.sqrt(dx * dx + dy * dy) - 0.3 * fromBounds.width);
        var width = Math.floor(0.1 * fromBounds.width);
        var base = Math.floor(len - 2 * width);
        var pathStr = 'M0,0 L0,%1 L%2,%1 L%2,%3 L%4,0 L%2,-%3 L%2,-%1 L0,-%1 L0,0';
        pathStr = pathStr.replace(/%1/g, width);
        pathStr = pathStr.replace(/%2/g, base);
        pathStr = pathStr.replace(/%3/g, 2*width);
        pathStr = pathStr.replace(/%4/g, len);
        marker.querySelector('path').setAttribute('d', pathStr);
        var rotation = 0;
        if (dx != 0) {
          var angle = Math.atan(dy/dx);
          angle *= 180/Math.PI;
          if (dx < 0)
            angle = 180 + angle;
        } else {
          angle = (dy < 0) ? -90 : 90;
        }
        marker.querySelector('g').setAttribute(
            'transform',
            'translate(' + x1 + ',' + y1 + ') rotate(' + angle + ')');
        marker.classList.remove('hide-last-move');
      }
    },

    hideLastMove: function() {
      var marker = this.querySelector('.last-move-marker');
      if (marker)
        marker.classList.add('hide-last-move');
    },

    getMoves: function() {
      return this.moveList_;
    },

    resize: function(size) {
      this.style.setProperty('height', size + 'px');
      this.style.setProperty('width', size + 'px');
      var marker = this.querySelector('.last-move-marker');
      if (marker && !marker.classList.contains('hide-last-move'))
        this.showLastMove();
    },

    /**
     * Removes a piece from a square.
     * @param {string} square ID of the square in algebraic notation.
     * @return {?ChessPiece}  Piece previously occupying the square.
     */
    removePiece: function(square) {
      var element = $(square);
      var currentPiece = element.firstChild;
      if (currentPiece)
        element.removeChild(currentPiece);
      return currentPiece;
    },

    /**
     * Mouse handler for moving pieces.
     * @param {Event} e Mouse click event.
     */
    onClick: function(e) {
      var bounds = this.getBoardBounds();
      var x = e.clientX - bounds.left;
      var y = e.clientY - bounds.top;
      if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) {
        if (x < 0 && y > bounds.height) {
           this.flipView(); 
        }
        // Cancel selection if clicking outside board area.
        if(this.selectedSquare_)
          this.selectSquare(this.selectedSquare_, false);
        return;
      }
      // Determine, which square was clicked on.
      var file = Math.floor(x / bounds.width * 8);
      var rank = Math.floor(y / bounds.height * 8);
      if (this.view_ == ChessBoard.View.BLACK_AT_TOP)
        rank = 7 - rank;
      else
        file = 7 - file;
      var id = this.squareId(file, rank);

      // If piece currently selected, then move if legal and reset otherwise.
      // Allow piece with no legal move to be selected as reset provides
      // feedback that move is invalid.
      if (id) {
        if(this.selectedSquare_) {
          if (id != this.selectedSquare_) {
            this.move(this.selectedSquare_, 
                      id, 
                      /* trial */ false, 
                      /* message */ false);
            this.selectSquare(this.selectedSquare_, false);
          } else {
            this.selectSquare(id, false);
          }
        } else if (!this.isEmpty(id)) {
          this.selectSquare(id, true);
        }
      }
    },

    /**
     * Retrieve bounds of board in screen coordinates.
     */
    getBoardBounds: function() {
      var a1 = $('A1');
      var h8 = $('H8');
      var left = Math.min(a1.offsetLeft, h8.offsetLeft);
      var top = Math.min(a1.offsetTop, h8.offsetTop);
      var el = a1.offsetParent;
      while(el) {
        left += el.offsetLeft;
        top += el.offsetTop;
        el = el.offsetParent;
      }
      return {
        left: left,
        top: top,
        width: 8 * a1.offsetWidth,
        height: 8 * a1.offsetHeight
      };
    },

    /**
     * Retrieves bounds of a square in board coordinates.
     * @param {string} square Name of the square in algebraic notation.
     */
    getBounds: function(square) {
      var getElementBounds = function(el) {
        var left = 0;
        var top =  0;
        var width = el.offsetWidth;
        var height = el.offsetHeight;
        while(el) {
          left += el.offsetLeft;
          top += el.offsetTop;
          el = el.offsetParent;
        }
        return {
          left: left,
          top: top,
          width: width,
          height:height
        };
      }
      var bounds = getElementBounds($(square));
      var reference = getElementBounds(this.querySelector('.chess-board'));
      bounds.left -= reference.left;
      bounds.top -= reference.top;
      return bounds;
    },

    flipView: function() {
      this.setView(this.view_ == ChessBoard.View.BLACK_AT_TOP ? 
          ChessBoard.View.WHITE_AT_TOP : ChessBoard.View.BLACK_AT_TOP);
    },

    setView: function(view) {
      var savePosition = this.toString();
      while (this.firstChild)
        this.removeChild(this.firstChild);
      this.view_ = view;
      this.layoutBoard_();
      this.setPosition(savePosition);
      this.showLastMove();
      chess.scoresheet.syncView();
    },

    getView: function() {
      return this.view_;
    },

    /**
     * Sets or resets the selected square.
     * @param {string} square ID of the square in algebraic notation.
     * @param {boolean} state The new selection state of the square.
     */
    selectSquare: function(square, state) {
      if (state) {
        $(square).classList.add('selected-square');
        this.selectedSquare_ = square;
      } else {
        $(square).classList.remove('selected-square');
        this.selectedSquare_ = null;
      }
    },

    resetSelection: function() {
      if (this.selectedSquare_)
        this.selectSquare(this.selectedSquare_, false);
    },

    /**
     * Retrieve set of legal moves.
     * @return {Object.<string, Array.<string>>}  Set of legal moves
     *     represented as a list of allowed target squares for each
     *     candidate starting square.
     */
    updateLegalMoves: function() {

      var opposingPlayer = this.playerToMove_ == Color.WHITE ?
          Color.BLACK : Color.WHITE;
      var moveList = this.getCandidateMoves_(this.playerToMove_);
      var removeKeys = [];
      for (var key in moveList) {
        var moves = moveList[key];
        for (var i = moves.length - 1; i >= 0; i--) {
          // Make trial move
          var target = moves[i];
          var candidateCapture = $(target).firstChild;
          this.move(key, target, /* trial */ true, /* message */ false);
          // Prune moves that leave the king in check.
          var opposingMoves = this.getCandidateMoves_(opposingPlayer);
          if (this.isInCheck(this.playerToMove_, opposingMoves)) 
            moves.splice(i, 1);
          // Undo trial move.
          this.move(target, key, /* trial */ true, /* message */ false);
          if (candidateCapture)
             $(target).appendChild(candidateCapture);
        }
        var piece = $(key).firstChild;
        if (piece.isKing()) {
          piece.checkCastlingRights(this, moves);
        }
        if (moves.length == 0)
          removeKeys.push(key);
      }

      for (var i = 0; i < removeKeys.length; i++)
        delete moveList[removeKeys[i]];
      
      this.legalMoveList_ = moveList;

      // Test for checkmate and stalemate.
      var emptyMoveList = true;
      for (key in moveList) {
        emptyMoveList = false;
        break;
      }
      if (emptyMoveList) {
        var opposingMoves = this.getCandidateMoves_(opposingPlayer);
        var title = 'Game over:\u00A0\u00A0$1';
        var score, message;
        if (this.isInCheck(this.playerToMove_, opposingMoves)) {
          var winner;
          message = 'Checkmate!\u00A0\u00A0$1 wins.' 
          if (opposingPlayer == Color.WHITE) {
            winner = 'White';
            score = '1 - 0';
          } else {
            winner = 'Black';
            score = '0 - 1';
          }
          message = message.replace('$1', winner);
        } else {
          message = 'Stalemate! Drawn game.';
          score = '1/2 - 1/2';
        }
        title = title.replace('$1', score);
        Dialog.showInfoDialog(title, message);
      }
    },

    getCandidateMoves_: function(color) {
      var moveList = {};
      for (var rank = 0; rank < 8; rank++) {
        for (var file = 0; file < 8; file++) {
          var square = this.squareId(file, rank);
          var piece = $(square).firstChild;
          if (piece && piece.pieceColor_ == color) {
            var moves = piece.getLegalMoves(this);
            if (moves && moves.length > 0)
              moveList[square] = moves;
          }
        }
      }
      return moveList;
    },

    isEmpty: function(square) {
      return $(square).firstChild == null;
    },

    isAttacked: function(square, color, opt_move_list) {
      var moveList = opt_move_list ? opt_move_list : this.legalMoveList_;
      for (var rank = 0; rank < 8; rank++) {
        for (var file = 0; file < 8; file++) {
          var candidate = this.squareId(file, rank);
          var piece = $(candidate).firstChild;
          if (piece && piece.pieceColor_ == color) {
            var targets = moveList[candidate];
            if (targets) {
              for (var i = 0; i < targets.length; i++) {
                if (targets[i] == square)
                  return true;
              }
            }
          }
        }
      }
      return false;
    },

    kingPosition: function(color) {
      for (var rank = 0; rank < 8; rank++) {
        for (var file = 0; file < 8; file++) {
          var square = this.squareId(file, rank);
          var piece = $(square).firstChild;
          if (piece && piece.isKing() && 
              piece.pieceColor_ == color)
            return square;
        }
      }
    },

    isInCheck: function(color, opt_move_list) {
      var kingPos = this.kingPosition(color);
      var opposingPlayer = color == Color.WHITE ? Color.BLACK : Color.WHITE;
      var moveList = opt_move_list ? opt_move_list : this.legalMoveList_;
      return this.isAttacked(kingPos, opposingPlayer, moveList);
    },

    /**
     * @param {string} target Name of the target square in algebraic notation.
     * @param {string} pieceType The piece type in FEN notation.
     * @param {Object.<string, Array.<string>} moveList List of legal moves.
     */
    findAllMovesTargettingSquare: function(target, pieceType) {
      var moves = [];
      for (var key in this.legalMoveList_) {
        var piece = $(key).firstChild;
        if (piece && piece.pieceType_ == pieceType) {
          var list = this.legalMoveList_[key];
          for (var i = 0; i < list.length; i++) {
            if (list[i] == target)
              moves.push(key);
          }
        }
      }
      return moves;
    },

    /**
     * Query player to select a piece for promotion.
     * @param {string} fromSquare Square that the pawn moved from.
     * @param {string} toSquare The promotion square.
     * @param {?Element} capturedPiece Piece captured on promotion.
     */
    promotePawn_: function(fromSquare, toSquare, capturedPiece) {
      var self = this;
      var callback = function(promotionSquare, pieceType) {
        // Temporarily undo move.
        var piece = self.removePiece(toSquare);
        $(fromSquare).appendChild(piece);
        if (capturedPiece)
          $(toSquare).appendChild(capturedPiece);
        self.move(fromSquare, toSquare + '=' + pieceType);
      }
      this.resetSelection();
      Dialog.showPromotionDialog(toSquare, callback);
    }
  };

  /**
   * Constructor of a chess piece.
   */
  ChessBoard.ChessPiece = function(type) {
    var element = document.createElement('div');
    element.pieceType_ = type;
    element.__proto__ = PieceTypes[type].prototype;
    element.decorate();
    return element;
  };

  /**
   * Rules for rendering and moving chess pieces.
   */
  ChessBoard.ChessPiece.prototype = {
    __proto__: HTMLDivElement.prototype,

    candidateMoves_: null,

    rangePiece_: false,

    decorate: function() {
      var type = this.pieceType_.toUpperCase();
      // FEN uses lowercase for white pieces and uppercase for black.
      this.pieceColor_ = type == this.pieceType_ ? Color.BLACK :Color.WHITE;
      this.className =  this.pieceColor_ + type;
    },

    /**
     * Retrieves list of legal moves for the piece, without factoring in 
     * constraints due to check.
     * @param {!ChessBoard} board  The chess board.
     */
    getLegalMoves: function(board) {
      var moves = [];
      var square = board.getSquare(this);
      var file = this.getFile(square);
      var rank = this.getRank(square);

      if (this.candidateMoves_) {
        var self = this;
        this.candidateMoves_.forEach(function(n) {
          var limit = self.rangePiece_ ? 7 : 1;
          for (var i = 1; i <= limit; i++) {
            var toFile = file + i * n[0];
            var toRank = rank + i * n[1];
            if (toFile >= 0 && toFile < 8 && toRank >= 0 && toRank < 8) {
              var toSquare = board.squareId(toFile, toRank);
              if (board.isEmpty(toSquare)) {
                moves.push(toSquare);
              } else {
                var piece = $(toSquare).firstChild;
                if (piece.pieceColor_ != self.pieceColor_)
                  moves.push(toSquare);
                break;
              }
            }
          }
        });
      }
      return moves;
    },

    getFile: function(square) {
      return square.charCodeAt(0) - 'A'.charCodeAt(0); 
    },

    getRank: function(square) {
      return parseInt(square.charAt(1)) - 1;
    },

    isPawn: function() {
      return false;
    },

    isKing: function() {
      return false;
    },

    getCharacterCode: function() {
      return this.pieceType_;
    }
  };

  // Create constructor for each piece and associate with piece type.
  ['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn'].forEach(function(n) {
    ChessBoard[n] = function() {};
    var type = (n == 'Knight') ? 'n' : n.charAt(0).toLowerCase();
    PieceTypes[type] = ChessBoard[n];
    PieceTypes[type.toUpperCase()] = ChessBoard[n];
  });

  /**
   * Rules for moving kings.
   */
  ChessBoard.King.prototype = {
    __proto__: ChessBoard.ChessPiece.prototype,

    candidateMoves_: [[-1, -1], [-1, 0], [-1, 1], [0, 1],
                     [1, 1], [1, 0], [1, -1], [0, -1]],

    /**
     * Retrieve candidate moves for kings.  Overriding default method for
     * extracting moves to handle castling.
     * @param {!ChessBoard} board  The chess board object.
     * @return {Array.<string>} List of legal king moves.
     */
    getLegalMoves: function(board) {
      var moves = ChessBoard.ChessPiece.prototype.getLegalMoves.call(
          this, board);

      // Special rule for castling.
      var constraints = board.castling_;
      var square = board.getSquare(this);
      var file = this.getFile(square);
      var rank = this.getRank(square);
      var isEmpty = function(fromFile, toFile) {
        for (var file = fromFile; file <= toFile; file++) {
          var square = board.squareId(file, rank);
          if (!board.isEmpty(square))
            return false;
        }
        return true;
      }
      if (square == 'E1') {
        if (constraints.indexOf('K') >= 0 && isEmpty(5, 6))
          moves.push('G1');
        if (constraints.indexOf('Q') >= 0 && isEmpty(1, 3))
          moves.push('C1'); 
      } else if (square == 'E8') {
        if (constraints.indexOf('k') >= 0 && isEmpty(5, 6))
          moves.push('G8');
        if (constraints.indexOf('q') >= 0 && isEmpty(1, 3))
          moves.push('C8');
      }
      return moves;
    },

    /**
     * Prunes moves that involve castling while in check, or castling
     * through check.
     * @param {!ChessBoard} board The chess board.
     * @param {Array.<string>} moves List of target squares for moving the
     *     king.
     */
    checkCastlingRights: function(board, moves) {
      if (!moves || moves.length == 0)
        return;

      var opposingPlayer = board.playerToMove_ == Color.WHITE ?
          Color.BLACK : Color.WHITE;
      var opposingMoves = board.getCandidateMoves_(opposingPlayer);
      var square = board.getSquare(this);
      var isAttacked = function(list) {
        for (var i = 0; i < list.length; i++) {
          if (board.isAttacked(list[i], opposingPlayer, opposingMoves))
            return true;
        }
        return false;
      }
      var removeCandidate = function(list, square) {
        for (var i = 0; i < list.length; i++) {
          if (list[i] == square) {
            list.splice(i, 1);
            return;
          }
        }
      };
      if (square == 'E1') {
        if (isAttacked(['E1', 'F1', 'G1']))
          removeCandidate(moves, 'G1');
        if (isAttacked(['E1', 'D1', 'C1']))
          removeCandidate(moves, 'C1');
      } else if (square == 'E8') {
        if (isAttacked(['E8', 'F8', 'G8']))
          removeCandidate(moves, 'G8');
        if (isAttacked(['E8', 'D8', 'C8']))
          removeCandidate(moves, 'C8');
      }
    },

    isKing: function() {
      return true;
    },

    getCharacterCode: function() {
      return this.pieceType_ == 'k' ? '\u2654' : '\u265A';
    }

  };

  /**
   * Rules for moving queens.
   */
  ChessBoard.Queen.prototype = {
    __proto__: ChessBoard.ChessPiece.prototype,

    candidateMoves_: [[-1, -1], [-1, 0], [-1, 1], [0, 1],
                     [1, 1], [1, 0], [1, -1], [0, -1]],

    rangePiece_: true,

    getCharacterCode: function() {
      return this.pieceType_ == 'q' ? '\u2655' : '\u265B';
    }

  };

  /**
   * Rules for moving rooks.
   */
  ChessBoard.Rook.prototype = {
    __proto__: ChessBoard.ChessPiece.prototype,

    candidateMoves_: [[-1, 0], [0, 1], [1, 0], [0, -1]],

    rangePiece_: true,

    getCharacterCode: function() {
      return this.pieceType_ == 'r' ? '\u2656' : '\u265C';
    }

  };

  /**
   * Rules for moving bishops.
   */
  ChessBoard.Bishop.prototype = {
    __proto__: ChessBoard.ChessPiece.prototype,

    candidateMoves_: [[-1, -1], [-1, 1], [1, 1], [1, -1]],

    rangePiece_: true,

    getCharacterCode: function() {
      return this.pieceType_ == 'b' ? '\u2657' : '\u265D';
    }

  };

  /**
   * Rules for moving knights.
   */
  ChessBoard.Knight.prototype = {
    __proto__: ChessBoard.ChessPiece.prototype,

    candidateMoves_: [[-2, -1], [-2, 1], [-1, 2], [1, 2],
                    [2, 1], [2, -1], [1, -2], [-1, -2]],

    getCharacterCode: function() {
      return this.pieceType_ == 'n' ? '\u2658' : '\u265E';
    }

  };

  /**
   * Rules for moving pawns.
   */
  ChessBoard.Pawn.prototype = {
    __proto__: ChessBoard.ChessPiece.prototype,

    isPawn: function() {
      return true;
    },

    /**
     * Retrieve candidate moves for pawns.  Overriding default method for
     * extracting moves since pawns are odd creatures.
     * @param {!ChessBoard} board  The chess board object.
     * @return {Array.<string>} List of legal pawn moves.
     */
    getLegalMoves: function(board) {
      var moves = [];
      var square = board.getSquare(this);
      var file = this.getFile(square);
      var rank = this.getRank(square);
      var dir = this.pieceColor_ == Color.WHITE ? 1 : -1;
      var toRank = rank + dir;
      var toSquare = board.squareId(file, toRank);
      if (board.isEmpty(toSquare)) {
        moves.push(toSquare);
        if ((rank == 1 && this.pieceColor_ == Color.WHITE) ||
            (rank == 6 && this.pieceColor_ == Color.BLACK)) {
          var toRank = rank + 2 * dir;
          toSquare = board.squareId(file, toRank);
          if (board.isEmpty(toSquare))
            moves.push(toSquare);
        }
      }
      for (var captureDir = -1; captureDir <= 1; captureDir += 2) {
        var toFile = file + captureDir;
        var toRank = rank + dir;
        if (toFile >= 0 && toFile < 8 && toRank >= 0 && toRank < 8) {
          var toSquare = board.squareId(toFile, toRank);
          var piece = $(toSquare).firstChild;
          if (piece && piece.pieceColor_ != this.pieceColor_)
            moves.push(toSquare);
          else if (toSquare == board.enpassant_)
            moves.push(toSquare);
        }
      }
      return moves;
    },

    getCharacterCode: function() {
      return this.pieceType_ == 'p' ? '\u2659' : '\u265F';
    }

  };

  return ChessBoard;
})();
