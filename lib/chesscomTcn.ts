/** Chess.com TCN (Two-Character Notation) — callback/live/game moveList çözümü */

const TCN_ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$,./&-*++=';

export type TcnMove = {
  from?: string;
  to: string;
  promotion?: string;
  drop?: string;
};

export function decodeChessComTcn(tcn: string): TcnMove[] {
  const raw = String(tcn ?? '').trim();
  if (!raw) return [];
  const out: TcnMove[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const move: TcnMove = { to: 'a1' };
    let fromIdx = TCN_ALPHABET.indexOf(raw[i]!);
    let toIdx = TCN_ALPHABET.indexOf(raw[i + 1]!);
    if (fromIdx < 0 || toIdx < 0) break;

    if (toIdx > 63) {
      move.promotion = 'qnrbkp'[Math.floor((toIdx - 64) / 3)] ?? 'q';
      toIdx = fromIdx + (fromIdx < 16 ? -8 : 8) + ((toIdx - 1) % 3) - 1;
    }

    if (fromIdx > 75) {
      move.drop = 'qnrbkp'[fromIdx - 79] ?? 'p';
    } else {
      move.from = `${TCN_ALPHABET[fromIdx % 8]}${Math.floor(fromIdx / 8) + 1}`;
    }
    move.to = `${TCN_ALPHABET[toIdx % 8]}${Math.floor(toIdx / 8) + 1}`;
    out.push(move);
  }
  return out;
}
