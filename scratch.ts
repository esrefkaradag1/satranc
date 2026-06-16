import { Chess } from 'chess.js';

function validate(fen: string) {
  try {
    const res = new Chess(fen);
    console.log("Valid:", fen);
  } catch(e: any) {
    console.log("Invalid:", fen, e.message);
  }
}

validate('k7/8/8/8/8/8/8/K6P w - - 0 1');
validate('P7/8/8/8/8/8/8/K6k w - - 0 1');
