import * as tf from '@tensorflow/tfjs';
import * as fs from 'fs';
import * as path from 'path';
import { buildNetwork, ACTION_SPACE_SIZE, NUM_CHANNELS } from '@dama144/neural-ai';
import { playOneSelfPlayGame, type TrainingExample } from './selfplay.js';
import { SIZE } from '@dama144/engine';
import { saveModelToDisk, loadModelFromDisk, modelExistsOnDisk } from './modelIO.js';

// ============================================================
// Parametros de entrenamiento. Los valores por defecto son PEQUEÑOS
// (a proposito) para poder validar que todo el sistema funciona en
// minutos. Para un entrenamiento REAL que produzca una IA fuerte,
// hay que subir estos numeros y dejarlo corriendo horas/dias.
// Se pueden sobreescribir con variables de entorno, ej:
//   ITERATIONS=200 GAMES_PER_ITERATION=50 MCTS_SIMULATIONS=200 npm run train
// ============================================================
const ITERATIONS = Number(process.env.ITERATIONS ?? 3);
const GAMES_PER_ITERATION = Number(process.env.GAMES_PER_ITERATION ?? 4);
const MCTS_SIMULATIONS = Number(process.env.MCTS_SIMULATIONS ?? 20);
const EPOCHS_PER_ITERATION = Number(process.env.EPOCHS_PER_ITERATION ?? 2);
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 32);
const CHECKPOINT_DIR = process.env.CHECKPOINT_DIR ?? path.resolve('checkpoints');
const RESUME = process.env.RESUME === '1';
const NUM_FILTERS = Number(process.env.NUM_FILTERS ?? 64);
const NUM_RES_BLOCKS = Number(process.env.NUM_RES_BLOCKS ?? 6);
const POLICY_HEAD_FILTERS = Number(process.env.POLICY_HEAD_FILTERS ?? 4);
const MAX_PLIES = Number(process.env.MAX_PLIES ?? 200);

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function policyLossFn(yTrue: tf.Tensor, yPred: tf.Tensor): tf.Tensor {
  return tf.losses.softmaxCrossEntropy(yTrue, yPred);
}

function valueLossFn(yTrue: tf.Tensor, yPred: tf.Tensor): tf.Tensor {
  return tf.losses.meanSquaredError(yTrue, yPred) as tf.Tensor;
}

async function trainOnExamples(model: tf.LayersModel, examples: TrainingExample[]) {
  if (examples.length === 0) return;
  const xs = tf.tensor4d(
    Float32Array.from(examples.flatMap((e) => Array.from(e.input))),
    [examples.length, SIZE, SIZE, NUM_CHANNELS]
  );
  const policyYs = tf.tensor2d(
    Float32Array.from(examples.flatMap((e) => Array.from(e.policyTarget))),
    [examples.length, ACTION_SPACE_SIZE]
  );
  const valueYs = tf.tensor2d(Float32Array.from(examples.map((e) => e.value)), [examples.length, 1]);

  await model.fit(xs, [policyYs, valueYs], {
    epochs: EPOCHS_PER_ITERATION,
    batchSize: Math.min(BATCH_SIZE, examples.length),
    shuffle: true,
    verbose: 0,
  });

  xs.dispose();
  policyYs.dispose();
  valueYs.dispose();
}

async function main() {
  log(`Iniciando entrenamiento: iteraciones=${ITERATIONS}, partidas/iter=${GAMES_PER_ITERATION}, simulaciones MCTS=${MCTS_SIMULATIONS}`);

  let model: tf.LayersModel;
  if (RESUME && modelExistsOnDisk(CHECKPOINT_DIR)) {
    log('Cargando modelo existente desde ' + CHECKPOINT_DIR);
    model = await loadModelFromDisk(CHECKPOINT_DIR);
  } else {
    log('Creando red nueva desde cero.');
    model = buildNetwork(NUM_CHANNELS, NUM_FILTERS, NUM_RES_BLOCKS, POLICY_HEAD_FILTERS);
  }
  model.compile({
    optimizer: tf.train.adam(1e-3),
    loss: [policyLossFn, valueLossFn],
  });

  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });

  for (let iter = 1; iter <= ITERATIONS; iter++) {
    const iterStart = Date.now();
    log(`--- Iteracion ${iter}/${ITERATIONS}: generando ${GAMES_PER_ITERATION} partidas de auto-juego ---`);

    const allExamples: TrainingExample[] = [];
    for (let g = 0; g < GAMES_PER_ITERATION; g++) {
      const examples = await playOneSelfPlayGame(model, MCTS_SIMULATIONS, 15, MAX_PLIES);
      allExamples.push(...examples);
      log(`  partida ${g + 1}/${GAMES_PER_ITERATION} completada (${examples.length} posiciones registradas)`);
    }

    log(`Entrenando con ${allExamples.length} posiciones acumuladas...`);
    await trainOnExamples(model, allExamples);

    await saveModelToDisk(model, CHECKPOINT_DIR);
    const elapsed = ((Date.now() - iterStart) / 1000).toFixed(1);
    log(`Iteracion ${iter} completada en ${elapsed}s. Checkpoint guardado en ${CHECKPOINT_DIR}`);
  }

  log('Entrenamiento finalizado.');
}

main().catch((err) => {
  console.error('Error durante el entrenamiento:', err);
  process.exit(1);
});
