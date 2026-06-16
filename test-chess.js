const { Chess } = require('chess.js');

const game = new Chess();
const copy = new Chess(game.fen());

try {
  const result = copy.move({ from: 'e2', to: 'e4', promotion: 'q' });
  console.log('Result:', result);
  console.log('Valid?:', !!result);
  console.log('Fen after:', copy.fen());
} catch (e) {
  console.log('Error:', e);
}
