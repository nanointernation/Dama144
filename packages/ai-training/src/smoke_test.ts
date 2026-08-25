import { createInitialBoard, legalMovesForPlayer } from '@dama144/engine';
import { encodeBoard, actionIndexForSequence, ACTION_SPACE_SIZE, NUM_CHANNELS, buildNetwork, runMcts } from '@dama144/neural-ai';
import { playOneSelfPlayGame } from './selfplay.js';
import { saveModelToDisk, loadModelFromDisk } from './modelIO.js';
import * as path from 'path';
import * as fs from 'fs';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error('FALLO: ' + msg);
  console.log('OK:', msg);
}

async function main() {
  console.log('=== 1. Codificacion del tablero ===');
  const board = createInitialBoard();
  const encoded = encodeBoard(board, 'B');
  assert(encoded.length === 12 * 12 * NUM_CHANNELS, 'el tablero codificado tiene el tamano esperado');

  const legal = legalMovesForPlayer(board, 'B');
  const idx = actionIndexForSequence(legal.sequences[0], 'B');
  assert(idx >= 0 && idx < ACTION_SPACE_SIZE, 'el indice de accion cae dentro del espacio valido');

  console.log('\n=== 2. Construccion de la red ===');
  const model = buildNetwork(NUM_CHANNELS, 8, 1, 2); // red diminuta, solo para validar que el sistema funciona
  assert(model.outputs.length === 2, 'la red tiene 2 salidas (politica y valor)');
  console.log('Parametros totales de la red de prueba:', model.countParams());

  console.log('\n=== 3. Una pasada de MCTS ===');
  const t0 = Date.now();
  const { visitCounts } = await runMcts(board, 'B', model, 4);
  assert(visitCounts.size > 0, 'MCTS genero al menos una jugada visitada');
  console.log('MCTS (4 simulaciones) tardo', Date.now() - t0, 'ms');

  console.log('\n=== 4. Una partida completa de auto-juego (acotada a 10 jugadas para la prueba) ===');
  const t1 = Date.now();
  const examples = await playOneSelfPlayGame(model, 3, 15, 10);
  assert(examples.length > 0, 'la partida de auto-juego genero ejemplos de entrenamiento');
  assert(
    examples.every((e) => e.value === 1 || e.value === -1),
    'todos los ejemplos tienen un valor final valido (+1 o -1)'
  );
  console.log('Partida de auto-juego completa:', examples.length, 'posiciones, tardo', Date.now() - t1, 'ms');

  console.log('\n=== 5. Guardar y cargar el modelo desde disco ===');
  const dir = path.resolve('smoke_test_checkpoint');
  await saveModelToDisk(model, dir);
  assert(fs.existsSync(path.join(dir, 'model.json')), 'se creo model.json');
  assert(fs.existsSync(path.join(dir, 'weights.bin')), 'se creo weights.bin');
  const loaded = await loadModelFromDisk(dir);
  assert(loaded.countParams() === model.countParams(), 'el modelo cargado tiene los mismos parametros');
  fs.rmSync(dir, { recursive: true, force: true });

  console.log('\nTODAS LAS PRUEBAS PASARON');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
