import {
  Board,
  Player,
  Sequence,
  SIZE,
  applySequence,
  legalMovesForPlayer,
  otherPlayer,
} from './rules.js';

export type Difficulty = 'facil' | 'media' | 'dificil';

const TIME_BUDGET_MS: Record<Difficulty, number> = {
  facil: 250,
  media: 900,
  dificil: 2200,
};

const MAX_DEPTH: Record<Difficulty, number> = {
  facil: 3,
  media: 6,
  dificil: 10,
};

/** Evaluación heurística del tablero desde el punto de vista de `player`. */
function evaluate(board: Board, player: Player): number {
  let score = 0;
  const opponent = otherPlayer(player);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const p = board[r][c];
      if (!p) continue;
      const base = p.king ? 3.2 : 1.0;
      // avance hacia la coronacion (solo fichas simples)
      const advance = p.king ? 0 : p.player === 'N' ? r / (SIZE - 1) : (SIZE - 1 - r) / (SIZE - 1);
      const centering = 1 - Math.abs(c - (SIZE - 1) / 2) / (SIZE / 2); // preferir el centro levemente
      const value = base + advance * 0.35 + centering * 0.08;
      score += p.player === player ? value : -value;
    }
  }
  return score;
}

interface SearchResult {
  score: number;
  move: Sequence | null;
}

function minimax(
  board: Board,
  playerToMove: Player,
  aiPlayer: Player,
  depth: number,
  alpha: number,
  beta: number,
  deadline: number
): SearchResult {
  const legal = legalMovesForPlayer(board, playerToMove);
  const timeUp = Date.now() > deadline;

  if (legal.sequences.length === 0) {
    // el jugador a mover no tiene movimientos: pierde
    const score = playerToMove === aiPlayer ? -1000 + depth : 1000 - depth;
    return { score, move: null };
  }

  if (depth === 0 || timeUp) {
    return { score: evaluate(board, aiPlayer), move: null };
  }

  // orden simple: las capturas mas largas primero ya vienen filtradas por legalMovesForPlayer
  const maximizing = playerToMove === aiPlayer;
  let best: SearchResult = { score: maximizing ? -Infinity : Infinity, move: null };

  for (const seq of legal.sequences) {
    const nextBoard = applySequence(board, seq);
    const nextPlayer = otherPlayer(playerToMove);
    const child = minimax(nextBoard, nextPlayer, aiPlayer, depth - 1, alpha, beta, deadline);
    const score = child.score;

    if (maximizing) {
      if (score > best.score) best = { score, move: seq };
      alpha = Math.max(alpha, score);
    } else {
      if (score < best.score) best = { score, move: seq };
      beta = Math.min(beta, score);
    }
    if (beta <= alpha) break; // poda
    if (Date.now() > deadline) break;
  }

  return best;
}

/** Devuelve la mejor jugada (secuencia completa) para `aiPlayer` mediante profundizacion iterativa. */
export function getBestMove(board: Board, aiPlayer: Player, difficulty: Difficulty = 'media'): Sequence | null {
  const legal = legalMovesForPlayer(board, aiPlayer);
  if (legal.sequences.length === 0) return null;
  if (legal.sequences.length === 1) return legal.sequences[0]; // captura obligatoria unica: no hace falta buscar

  const deadline = Date.now() + TIME_BUDGET_MS[difficulty];
  let bestMove: Sequence | null = legal.sequences[0];

  for (let depth = 2; depth <= MAX_DEPTH[difficulty]; depth++) {
    const result = minimax(board, aiPlayer, aiPlayer, depth, -Infinity, Infinity, deadline);
    if (result.move) bestMove = result.move;
    if (Date.now() > deadline) break;
  }

  // dificultad "facil": mezclar con algo de aleatoriedad para que no juegue perfecto
  if (difficulty === 'facil' && Math.random() < 0.35) {
    return legal.sequences[Math.floor(Math.random() * legal.sequences.length)];
  }

  return bestMove;
}
