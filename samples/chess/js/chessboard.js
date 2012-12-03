ChessBoard = (function() {

  /**
   * Piece colors.
   * @enum
   */
  var Color = {
    BLACK: 'B',
    WHITE: 'W'
  }

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
     */
    moveIndex_: 1,

    decorate: function() {
      this.classList.add('chess-board');
      for (var rank = 7; rank >= 0; rank--) {
        var row = document.createElement('div');
        this.appendChild(row);
        var rankLabel = document.createElement('div');
        rankLabel.textContent = String(1 + rank);
        row.appendChild(rankLabel);
        for (var file = 0; file < 8; file++) {
          var square = document.createElement('div');
          var squareColor = (rank + file) % 2 == 0 ?
            'black-square' : 'white-square';
          square.classList.add(squareColor);
          square.id = this.squareId(file, rank);
          row.appendChild(square);
        }
      }
      var row = document.createElement('div');
      this.appendChild(row);
      var flipper = document.createElement('div');
      flipper.className = 'flip-board';
      row.appendChild(flipper);
      for (var i = 0; i < 8; i++) {
        var fileLabel = document.createElement('div');
        fileLabel.textContent = String.fromCharCode(65 + i);
        row.appendChild(fileLabel);
      }
      this.addEventListener('click', this.onClick.bind(this));
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
      this.setPosition(
          'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    },

    /**
     * Setup a position on a board.
     * @param {string} fen Board setup described in Forsyth–Edwards notation.
     */
    setPosition: function(fen) {
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

      // TODO - make use of parts[4]. Required for 50 move rule.

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
      fen.push(this.castling_ != '' ? this.castling : '-');
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
     * @return {boolean} True if the move was legal, false if rejected.
     */
    move: function(fromSquare, toSquare, opt_trial_move) {

      var opposingPlayer = this.playerToMove_ == Color.WHITE ? 
          Color.BLACK : Color.WHITE;

      if (!opt_trial_move) {
        // Make sure correct player is moving.
        var movingPiece = $(fromSquare).firstChild;
        if (movingPiece.pieceColor_ != this.playerToMove_)
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
      // TODO: Show last move.
      // TODO: Implement 3 move repetition.
      //       Implement 50 move no pawn push + no capture.
      //       Implement insufficient mating material.

      if (!opt_trial_move) {
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
           if (toRank == 0 || toRank == 7)
             this.promotePawn_(toSquare);
        }

        // Save values before advancing to next move.
        var scoresheetMoveIndex = this.moveIndex_;
        var scoreColor = this.playerToMove_; 

        this.playerToMove_ = opposingPlayer;

        if (opposingPlayer == Color.WHITE)
          this.moveIndex_++;

        this.updateLegalMoves();

        // test
        console.log(this.toString());

        // Update scoresheet after advancing to next player turn in order
        // to determine if player is in check or checkmate.  TODO: Add
        // + or # as required.  Still a bit of plumbing. TOD: Promotions are
        // displaying correctly.  Currently blank, but should be of form
        // move=piece.

        if (displayMove) {
          // Nothing left to do.
        } else if (piece.isPawn() && capturedPiece) {
          displayMove = capturedPiece.isPawn() ?
              fromSquare.charAt(0) + toSquare.charAt(0) : 
              fromSquare.charAt(0) + 'x' + toSquare;
          displayMove = displayMove.toLowerCase();
        } else {
          var movesTargettingSquare = 
              this.findAllMovesTargettingSquare(toSquare, piece.pieceType_);
          displayMove = toSquare;
          if (capturedPiece)
            displayMove = 'x' + displayMove;
          if (movesTargettingSquare.length > 1) {
            // TODO: simplify since normally only rank or file is need from the
            // source square.
            displayName = fromSquare + displayName;
          }
          displayMove = displayMove.toLowerCase();
          if (!piece.isPawn())
            displayMove = piece.pieceType_.toUpperCase() + displayMove;
        }
        scoresheet.addMove(scoresheetMoveIndex, 
                           scoreColor, 
                           displayMove);
      }
      return true;
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
      var id = this.getSquare(e.target);
      if (id) {
        if(this.selectedSquare_) {
          if (id != this.selectedSquare_) {
            this.move(this.selectedSquare_, id);
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
          this.move(key, target, true);
          // Prune moves that leave the king in check.
          var opposingMoves = this.getCandidateMoves_(opposingPlayer);
          if (this.isInCheck(this.playerToMove_, opposingMoves)) 
            moves.splice(i, 1);
          // Undo trial move.
          this.move(target, key, true);
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

/*
      // test
      console.log('----------------');
      for (var key in moveList) {
        console.log(key + ': ' + moveList[key].join(', '));
      }
*/
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

    findAllMovesTargettingSquare: function(target, pieceType) {
      var moves = [];
      for (var key in this.legalMoveList_) {
        var piece = $(key);
        if (piece.pieceType_ == pieceType) {
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
     * @param {string} square  The promotion square.
     */
    promotePawn_: function(square) {
      var self = this;
      var callback = function(promotionSquare, pieceType) {
        self.placePiece(promotionSquare, pieceType);
        self.updateLegalMoves();
      }
      this.resetSelection();
      Dialog.showPromotionDialog(square, callback);
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
