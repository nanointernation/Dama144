import * as tf from '@tensorflow/tfjs';
import { createInitialBoard, legalMovesForPlayer, applySequence, checkGameStatus, otherPlayer, Board, Player } from '@dama144/engine';
import { runMcts, encodeBoard, actionIndexForSequence, ACTION_SPACE_SIZE, NUM_CHANNELS } from '@dama144/neural-ai';

export interface TrainingExample {
  input: Float32Array; // tablero codificado [12,12,NUM_CHANNELS]
  policyTarget: Float32Array; // tamano ACTION_SPACE_SIZE, disperso (mayoria ceros)
  value: number; // resultado final desde la perspectiva del jugador a mover en esa posicion
}

const MAX_PLIES_DEFAULT = 200; // limite de seguridad para evitar partidas eternas en el auto-juego

export async function playOneSelfPlayGame(
  model: tf.LayersModel,
  numSimulations: number,
  temperatureMoves = 15,
  maxPlies = MAX_PLIES_DEFAULT
): Promise<TrainingExample[]> {
  let board: Board = createInitialBoard();
  let player: Player = 'B';
  const history: { input: Float32Array; policyTarget: Float32Array; player: Player }[] = [];

  let ply = 0;
  let winner: Player | null = null;

  while (ply < maxPlies) {
    const status = checkGameStatus(board, player);
    if (status.over) {
      winner = status.winner;
      break;
    }

    const { visitCounts } = await runMcts(board, player, model, numSimulations);
    const totalVisits = Array.from(visitCounts.values()).reduce((a, b) => a + b, 0) || 1;

    const policyTarget = new Float32Array(ACTION_SPACE_SIZE);
    for (const [idx, visits] of visitCounts) policyTarget[idx] = visits / totalVisits;

    history.push({ input: encodeBoard(board, player), policyTarget, player });

    // Eleccion de la jugada real: con "temperatura" al inicio de la partida
    // (mas exploracion/variedad), y la mas visitada despues (mas fuerte).
    const legal = legalMovesForPlayer(board, player);
    let chosen;
    if (ply < temperatureMoves) {
      const entries = Array.from(visitCounts.entries());
      const total = entries.reduce((a, [, v]) => a + v, 0) || 1;
      let r = Math.random() * total;
      let chosenIdx = entries[0]?.[0];
      for (const [idx, v] of entries) {
        r -= v;
        if (r <= 0) {
          chosenIdx = idx;
          break;
        }
      }
      chosen = legal.sequences.find((s) => actionIndexForSequence(s, player) === chosenIdx) ?? legal.sequences[0];
    } else {
      let bestIdx = -1;
      let bestVisits = -1;
      for (const [idx, v] of visitCounts) {
        if (v > bestVisits) {
          bestVisits = v;
          bestIdx = idx;
        }
      }
      chosen = legal.sequences.find((s) => actionIndexForSequence(s, player) === bestIdx) ?? legal.sequences[0];
    }

    board = applySequence(board, chosen);
    player = otherPlayer(player);
    ply++;
  }

  if (winner === null) {
    // se alcanzo el limite de jugadas: se declara ganador por mayor cantidad de fichas
    let countB = 0;
    let countN = 0;
    for (let r = 0; r < 12; r++)
      for (let c = 0; c < 12; c++) {
        const p = board[r][c];
        if (p) {
          if (p.player === 'B') countB++;
          else countN++;
        }
      }
    winner = countB >= countN ? 'B' : 'N';
  }

  return history.map((h) => ({
    input: h.input,
    policyTarget: h.policyTarget,
    value: h.player === winner ? 1 : -1,
  }));
}
