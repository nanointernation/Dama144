import { Board, Player, Sequence, SIZE } from '@dama144/engine';

export const NUM_CHANNELS = 5;
export const ACTION_SPACE_SIZE = SIZE * SIZE * SIZE * SIZE; // (origen) x (destino final) = 144*144

/**
 * Todo el aprendizaje se hace desde la perspectiva canonica del jugador a
 * mover: si le toca a Negras, el tablero se voltea 180 grados (misma tecnica
 * que usamos para la orientacion visual online) para que la red siempre vea
 * "mis fichas avanzan hacia arriba" sin importar el color real. Esto evita
 * que la red tenga que aprender dos estrategias espejadas por separado.
 */
function canonicalCoords(r: number, c: number, flip: boolean): [number, number] {
  return flip ? [SIZE - 1 - r, SIZE - 1 - c] : [r, c];
}

/** Convierte el tablero a un tensor plano [12,12,5] (fila-mayor, canal al final) desde la perspectiva de `player`. */
export function encodeBoard(board: Board, player: Player): Float32Array {
  const flip = player === 'N';
  const data = new Float32Array(SIZE * SIZE * NUM_CHANNELS);

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const [cr, cc] = canonicalCoords(r, c, flip);
      const mine = piece.player === player;
      let channel: number;
      if (mine && !piece.king) channel = 0;
      else if (mine && piece.king) channel = 1;
      else if (!mine && !piece.king) channel = 2;
      else channel = 3;
      data[(cr * SIZE + cc) * NUM_CHANNELS + channel] = 1;
    }
  }
  // Canal 4: plano constante (ayuda a la red a ubicar posicion/bordes)
  for (let i = 0; i < SIZE * SIZE; i++) {
    data[i * NUM_CHANNELS + 4] = 1;
  }
  return data;
}

/** Indice unico en el espacio de acciones para una secuencia completa, ya canonicalizado segun el jugador. */
export function actionIndexForSequence(seq: Sequence, player: Player): number {
  const flip = player === 'N';
  const [fr, fc] = canonicalCoords(seq.startR, seq.startC, flip);
  const last = seq.steps[seq.steps.length - 1];
  const [tr, tc] = canonicalCoords(last.toR, last.toC, flip);
  return ((fr * SIZE + fc) * SIZE + tr) * SIZE + tc;
}
