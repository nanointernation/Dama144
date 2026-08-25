import * as tf from '@tensorflow/tfjs';
import { SIZE } from '@dama144/engine';
import { ACTION_SPACE_SIZE } from './encoding.js';

/**
 * Red convolucional pequeña estilo AlphaZero, dimensionada para un tablero
 * de 12x12 (mucho mas simple que ajedrez/Go, no hace falta una red enorme).
 * Dos salidas: politica (probabilidad relativa de cada posible movimiento
 * en el espacio de acciones fijo) y valor (que tan buena es la posicion
 * para el jugador a mover, entre -1 y 1).
 */
export function buildNetwork(numChannels: number, numFilters = 64, numResBlocks = 6, policyHeadFilters = 4): tf.LayersModel {
  const input = tf.input({ shape: [SIZE, SIZE, numChannels] });

  let x = tf.layers
    .conv2d({ filters: numFilters, kernelSize: 3, padding: 'same', useBias: false })
    .apply(input) as tf.SymbolicTensor;
  x = tf.layers.batchNormalization().apply(x) as tf.SymbolicTensor;
  x = tf.layers.reLU().apply(x) as tf.SymbolicTensor;

  for (let i = 0; i < numResBlocks; i++) {
    const shortcut = x;
    let y = tf.layers
      .conv2d({ filters: numFilters, kernelSize: 3, padding: 'same', useBias: false })
      .apply(x) as tf.SymbolicTensor;
    y = tf.layers.batchNormalization().apply(y) as tf.SymbolicTensor;
    y = tf.layers.reLU().apply(y) as tf.SymbolicTensor;
    y = tf.layers
      .conv2d({ filters: numFilters, kernelSize: 3, padding: 'same', useBias: false })
      .apply(y) as tf.SymbolicTensor;
    y = tf.layers.batchNormalization().apply(y) as tf.SymbolicTensor;
    x = tf.layers.add().apply([shortcut, y]) as tf.SymbolicTensor;
    x = tf.layers.reLU().apply(x) as tf.SymbolicTensor;
  }

  // Cabeza de politica
  let p = tf.layers.conv2d({ filters: policyHeadFilters, kernelSize: 1, padding: 'same' }).apply(x) as tf.SymbolicTensor;
  p = tf.layers.batchNormalization().apply(p) as tf.SymbolicTensor;
  p = tf.layers.reLU().apply(p) as tf.SymbolicTensor;
  p = tf.layers.flatten().apply(p) as tf.SymbolicTensor;
  const policyOut = tf.layers
    .dense({ units: ACTION_SPACE_SIZE, activation: 'linear', name: 'policy' })
    .apply(p) as tf.SymbolicTensor;

  // Cabeza de valor
  let v = tf.layers.conv2d({ filters: 4, kernelSize: 1, padding: 'same' }).apply(x) as tf.SymbolicTensor;
  v = tf.layers.batchNormalization().apply(v) as tf.SymbolicTensor;
  v = tf.layers.reLU().apply(v) as tf.SymbolicTensor;
  v = tf.layers.flatten().apply(v) as tf.SymbolicTensor;
  v = tf.layers.dense({ units: 64, activation: 'relu' }).apply(v) as tf.SymbolicTensor;
  const valueOut = tf.layers.dense({ units: 1, activation: 'tanh', name: 'value' }).apply(v) as tf.SymbolicTensor;

  return tf.model({ inputs: input, outputs: [policyOut, valueOut] });
}
