// Motor de reglas puro (sin DOM) para Dama 144 (tablero 12x12).
// Reutilizable en cliente web, Web Worker (IA) y servidor (validación online).

export const SIZE = 12;
export type Player = 'B' | 'N'; // Blancas | Negras

export interface Piece {
  player: Player;
  king: boolean;
}

export type Cell = Piece | null;
export type Board = Cell[][];

export interface Step {
  toR: number;
  toC: number;
  capR?: number;
  capC?: number;
}

export interface Sequence {
  startR: number;
  startC: number;
  steps: Step[];
}

export interface LegalMoves {
  mandatory: boolean;
  sequences: Sequence[];
}

const DIRS: Array<[number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

export function isDark(r: number, c: number): boolean {
  return (r + c) % 2 === 1;
}

export function createInitialBoard(): Board {
  const board: Board = Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(null));
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!isDark(r, c)) continue;
      if (r <= 4) board[r][c] = { player: 'N', king: false };
      if (r >= 7) board[r][c] = { player: 'B', king: false };
    }
  }
  return board;
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function promotionRow(player: Player): number {
  return player === 'N' ? SIZE - 1 : 0;
}

export function otherPlayer(player: Player): Player {
  return player === 'B' ? 'N' : 'B';
}

function captureSequencesFromSquare(
  board: Board,
  r: number,
  c: number,
  path: Step[] = [],
  capturedSet: string[] = []
): { steps: Step[] }[] {
  const piece = board[r][c] as Piece;
  const sequences: { steps: Step[] }[] = [];

  for (const [dr, dc] of DIRS) {
    if (piece.king) {
      let step = 1;
      let enemyPos: { rr: number; cc: number } | null = null;
      while (true) {
        const rr = r + dr * step;
        const cc = c + dc * step;
        if (!inBounds(rr, cc)) break;
        const cell = board[rr][cc];
        if (cell === null) {
          step++;
          continue;
        }
        if (cell.player === piece.player) break;
        enemyPos = { rr, cc };
        break;
      }
      if (enemyPos) {
        const key = `${enemyPos.rr},${enemyPos.cc}`;
        if (capturedSet.includes(key)) continue;
        let lr = enemyPos.rr + dr;
        let lc = enemyPos.cc + dc;
        while (inBounds(lr, lc) && board[lr][lc] === null) {
          const nb = cloneBoard(board);
          nb[r][c] = null;
          nb[enemyPos.rr][enemyPos.cc] = null;
          const becomesKing = !piece.king && lr === promotionRow(piece.player);
          nb[lr][lc] = { player: piece.player, king: piece.king || becomesKing };
          const stepObj: Step = { toR: lr, toC: lc, capR: enemyPos.rr, capC: enemyPos.cc };
          const newPath = [...path, stepObj];
          const newCaptured = [...capturedSet, key];
          if (becomesKing) {
            sequences.push({ steps: newPath });
          } else {
            const sub = captureSequencesFromSquare(nb, lr, lc, newPath, newCaptured);
            if (sub.length > 0) sequences.push(...sub);
            else sequences.push({ steps: newPath });
          }
          lr += dr;
          lc += dc;
        }
      }
    } else {
      const rr = r + dr;
      const cc = c + dc;
      const lr = r + dr * 2;
      const lc = c + dc * 2;
      if (!inBounds(lr, lc)) continue;
      const mid = board[rr]?.[cc];
      if (mid && mid.player !== piece.player && board[lr][lc] === null) {
        const key = `${rr},${cc}`;
        if (capturedSet.includes(key)) continue;
        const nb = cloneBoard(board);
        nb[r][c] = null;
        nb[rr][cc] = null;
        const becomesKing = lr === promotionRow(piece.player);
        nb[lr][lc] = { player: piece.player, king: becomesKing };
        const stepObj: Step = { toR: lr, toC: lc, capR: rr, capC: cc };
        const newPath = [...path, stepObj];
        const newCaptured = [...capturedSet, key];
        if (becomesKing) {
          sequences.push({ steps: newPath });
        } else {
          const sub = captureSequencesFromSquare(nb, lr, lc, newPath, newCaptured);
          if (sub.length > 0) sequences.push(...sub);
          else sequences.push({ steps: newPath });
        }
      }
    }
  }
  return sequences;
}

export function allCaptureSequences(board: Board, player: Player): Sequence[] {
  const all: Sequence[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const piece = board[r][c];
      if (piece && piece.player === player) {
        const seqs = captureSequencesFromSquare(board, r, c);
        for (const s of seqs) all.push({ startR: r, startC: c, steps: s.steps });
      }
    }
  }
  if (all.length === 0) return [];
  const maxLen = Math.max(...all.map((s) => s.steps.length));
  return all.filter((s) => s.steps.length === maxLen);
}

function simpleMovesFromSquare(board: Board, r: number, c: number): Step[] {
  const piece = board[r][c] as Piece;
  const moves: Step[] = [];
  for (const [dr, dc] of DIRS) {
    if (piece.king) {
      let step = 1;
      while (true) {
        const rr = r + dr * step;
        const cc = c + dc * step;
        if (!inBounds(rr, cc) || board[rr][cc] !== null) break;
        moves.push({ toR: rr, toC: cc });
        step++;
      }
    } else {
      const forward = piece.player === 'N' ? 1 : -1;
      if (dr !== forward) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (inBounds(rr, cc) && board[rr][cc] === null) moves.push({ toR: rr, toC: cc });
    }
  }
  return moves;
}

export function allSimpleMoves(board: Board, player: Player): Sequence[] {
  const all: Sequence[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const piece = board[r][c];
      if (piece && piece.player === player) {
        const mv = simpleMovesFromSquare(board, r, c);
        for (const m of mv) all.push({ startR: r, startC: c, steps: [m] });
      }
    }
  }
  return all;
}

export function legalMovesForPlayer(board: Board, player: Player): LegalMoves {
  const caps = allCaptureSequences(board, player);
  if (caps.length > 0) return { mandatory: true, sequences: caps };
  const simples = allSimpleMoves(board, player);
  return { mandatory: false, sequences: simples };
}

/** Aplica una secuencia COMPLETA (todos sus pasos) sobre el tablero y devuelve un nuevo tablero. Uso: IA / servidor. */
export function applySequence(board: Board, seq: Sequence): Board {
  let b = cloneBoard(board);
  let r = seq.startR;
  let c = seq.startC;
  const piece = b[r][c] as Piece;
  b[r][c] = null;
  let king = piece.king;
  for (const step of seq.steps) {
    if (step.capR !== undefined && step.capC !== undefined) {
      b[step.capR][step.capC] = null;
    }
    if (!king && step.toR === promotionRow(piece.player)) king = true;
    r = step.toR;
    c = step.toC;
  }
  b[r][c] = { player: piece.player, king };
  return b;
}

export function countPieces(board: Board): { B: number; N: number } {
  let B = 0;
  let N = 0;
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      const p = board[r][c];
      if (p) {
        if (p.player === 'B') B++;
        else N++;
      }
    }
  return { B, N };
}

export type GameStatus = { over: false } | { over: true; winner: Player; reason: 'no-moves' | 'no-pieces' };

export function checkGameStatus(board: Board, playerToMove: Player): GameStatus {
  const counts = countPieces(board);
  if (counts[playerToMove] === 0) {
    return { over: true, winner: otherPlayer(playerToMove), reason: 'no-pieces' };
  }
  const legal = legalMovesForPlayer(board, playerToMove);
  if (legal.sequences.length === 0) {
    return { over: true, winner: otherPlayer(playerToMove), reason: 'no-moves' };
  }
  return { over: false };
}
