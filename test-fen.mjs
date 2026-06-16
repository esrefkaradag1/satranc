import { Chess } from 'chess.js';

const chess = new Chess();
try {
  chess.load("rnbqkbnr/ppppp1pp/8/5p2/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 2");
  console.log("FEN loaded successfully!");
  console.log(chess.fen());
} catch(e) {
  console.log("Error loading fen:", e);
}
