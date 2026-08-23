import {
  createInitialBoard,
  legalMovesForPlayer,
  applySequence,
  checkGameStatus,
  countPieces,
} from './rules.js';
import { getBestMove } from './ai.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error('FALLO: ' + msg);
  console.log('OK:', msg);
}

const board = createInitialBoard();
const counts = countPieces(board);
assert(counts.B === 30 && counts.N === 30, 'cada jugador inicia con 30 fichas');

const legal = legalMovesForPlayer(board, 'B');
assert(!legal.mandatory, 'no hay captura obligatoria al inicio');
assert(legal.sequences.length > 0, 'blancas tienen movimientos disponibles al inicio');

// Jugar unas cuantas jugadas con la IA en modo facil para verificar que no explota
let b = board;
let turn: 'B' | 'N' = 'B';
for (let i = 0; i < 12; i++) {
  const status = checkGameStatus(b, turn);
  if (status.over) break;
  const move = getBestMove(b, turn, 'facil');
  assert(move !== null, `la IA encuentra una jugada en el turno ${i}`);
  b = applySequence(b, move!);
  turn = turn === 'B' ? 'N' : 'B';
}
console.log('Partida de prueba con IA avanzo', 12, 'medias-jugadas sin errores.');

console.log('\nTODAS LAS PRUEBAS PASARON');
