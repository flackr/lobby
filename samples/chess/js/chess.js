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
  // TODO: disable control while game in progress.
  Dialog.show('chess-lobby');
  chess.chessboard.reset();
  chess.scoresheet.reset();
}

window.addEventListener('load', function() {
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


