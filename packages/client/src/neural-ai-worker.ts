import * as tf from '@tensorflow/tfjs';
import { runMcts, actionIndexForSequence } from '@dama144/neural-ai';
import type { Board, Player, Sequence } from '@dama144/engine';
import { legalMovesForPlayer } from '@dama144/engine';

// El modelo entrenado se sirve como archivo estatico junto con la app.
// Si no existe (porque aun no se ha corrido un entrenamiento real y copiado
// aqui el resultado), el worker responde con un error claro en vez de fallar
// en silencio o trabar la interfaz.
const MODEL_URL = '/models/dama144-az/model.json';
const MCTS_SIMULATIONS = 120;

let modelPromise: Promise<tf.LayersModel> | null = null;

function getModel(): Promise<tf.LayersModel> {
  if (!modelPromise) {
    modelPromise = tf.loadLayersModel(MODEL_URL);
  }
  return modelPromise;
}

self.onmessage = async (ev: MessageEvent<{ board: Board; player: Player }>) => {
  const { board, player } = ev.data;
  try {
    const model = await getModel();
    const { visitCounts } = await runMcts(board, player, model, MCTS_SIMULATIONS);

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
