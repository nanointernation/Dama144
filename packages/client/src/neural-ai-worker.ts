import * as tf from '@tensorflow/tfjs';
import { runMcts, actionIndexForSequence } from '@dama144/neural-ai';
import type { Board, Player, Sequence } from '@dama144/engine';
import { legalMovesForPlayer } from '@dama144/engine';

// El modelo entrenado se sirve como archivo estatico junto con la app.
// Si no existe (porque aun no se ha corrido un entrenamiento real y copiado
// aqui el resultado), el worker responde con un error claro en vez de fallar
// en silencio o trabar la interfaz.
const MODEL_URL = '/models/dama144-az/model.json';

// Techo de simulaciones (nunca se pasa de aqui aunque quede mucho tiempo en
// el reloj); el limite real, casi siempre, lo pone el presupuesto de tiempo
// de abajo, no este numero.
const MAX_SIMULATIONS = 60;

// El "pensar" de la IA neuronal descuenta de SU PROPIO reloj (igual que le
// pasaria a un humano). Por eso el tiempo de pensamiento se calcula como una
// fraccion pequeña del tiempo que le queda, con un techo y un piso, para que
// nunca se quede sin tiempo por pensar de mas en una sola jugada.
const MAX_THINK_MS = 3500;
const MIN_THINK_MS = 300;
const THINK_FRACTION_OF_REMAINING = 0.04; // ~4% del tiempo restante por jugada

let modelPromise: Promise<tf.LayersModel> | null = null;

function getModel(): Promise<tf.LayersModel> {
  if (!modelPromise) {
    modelPromise = tf.loadLayersModel(MODEL_URL);
  }
  return modelPromise;
}

function computeThinkTimeMs(remainingMs: number | undefined): number {
  if (remainingMs === undefined) return MAX_THINK_MS;
  const budget = remainingMs * THINK_FRACTION_OF_REMAINING;
  return Math.min(MAX_THINK_MS, Math.max(MIN_THINK_MS, budget));
}

self.onmessage = async (ev: MessageEvent<{ board: Board; player: Player; remainingMs?: number }>) => {
  const { board, player, remainingMs } = ev.data;
  try {
    const model = await getModel();
    const thinkTimeMs = computeThinkTimeMs(remainingMs);
    const deadline = Date.now() + thinkTimeMs;
    const { visitCounts } = await runMcts(board, player, model, MAX_SIMULATIONS, deadline);

    const legal = legalMovesForPlayer(board, player);
    let bestIdx = -1;
    let bestVisits = -1;
    for (const [idx, visits] of visitCounts) {
      if (visits > bestVisits) {
        bestVisits = visits;
        bestIdx = idx;
      }
    }
    const chosen: Sequence | undefined = legal.sequences.find((s) => actionIndexForSequence(s, player) === bestIdx);

    (self as unknown as Worker).postMessage({ move: chosen ?? legal.sequences[0] ?? null });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      move: null,
      error:
        'No se encontró un modelo de IA neuronal entrenado. Este modo requiere correr el entrenamiento (ver packages/ai-training) y publicar el modelo resultante.',
    });
    console.error('[Dama144] Error en la IA neuronal:', err);
  }
};
