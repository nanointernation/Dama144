import * as tf from '@tensorflow/tfjs';
import {
  Board,
  Player,
  Sequence,
  legalMovesForPlayer,
  applySequence,
  checkGameStatus,
  otherPlayer,
} from '@dama144/engine';
import { encodeBoard, actionIndexForSequence, NUM_CHANNELS } from './encoding.js';

const C_PUCT = 1.5;

interface MctsNode {
  board: Board;
  player: Player;
  children: Map<number, { node: MctsNode | null; seq: Sequence; prior: number; visits: number; totalValue: number }>;
  expanded: boolean;
  isTerminal: boolean;
  terminalValue: number; // desde la perspectiva de `player` en este nodo
}

function createNode(board: Board, player: Player): MctsNode {
  return { board, player, children: new Map(), expanded: false, isTerminal: false, terminalValue: 0 };
}

/** Una sola evaluacion de red: politica (ya enmascarada/normalizada sobre jugadas legales) + valor. */
async function evaluate(
  model: tf.LayersModel,
  board: Board,
  player: Player,
  legalSeqs: Sequence[]
): Promise<{ priors: Map<number, number>; value: number }> {
  const input = tf.tensor4d(encodeBoard(board, player), [1, 12, 12, NUM_CHANNELS]);
  const [policyLogits, valueOut] = model.predict(input) as tf.Tensor[];
  const logitsArr = (await policyLogits.data()) as Float32Array;
  const valueArr = (await valueOut.data()) as Float32Array;
  input.dispose();
  policyLogits.dispose();
  valueOut.dispose();

  const actionIdxs = legalSeqs.map((s) => actionIndexForSequence(s, player));
  const legalLogits = actionIdxs.map((idx) => logitsArr[idx]);
  const maxLogit = Math.max(...legalLogits);
  const exps = legalLogits.map((l) => Math.exp(l - maxLogit));
  const sumExp = exps.reduce((a, b) => a + b, 0);

  const priors = new Map<number, number>();
  actionIdxs.forEach((idx, i) => priors.set(idx, exps[i] / sumExp));

  return { priors, value: valueArr[0] };
}

async function expand(node: MctsNode, model: tf.LayersModel): Promise<number> {
  const status = checkGameStatus(node.board, node.player);
  if (status.over) {
    node.isTerminal = true;
    node.terminalValue = status.winner === node.player ? 1 : -1;
    node.expanded = true;
    return node.terminalValue;
  }

  const legal = legalMovesForPlayer(node.board, node.player);
  const { priors, value } = await evaluate(model, node.board, node.player, legal.sequences);

  for (const seq of legal.sequences) {
    const idx = actionIndexForSequence(seq, node.player);
    node.children.set(idx, { node: null, seq, prior: priors.get(idx) ?? 1e-3, visits: 0, totalValue: 0 });
  }
  node.expanded = true;
  return value;
}

function selectChild(node: MctsNode): [number, { node: MctsNode | null; seq: Sequence; prior: number; visits: number; totalValue: number }] {
  let bestScore = -Infinity;
  let bestIdx = -1;
  let bestChild: ReturnType<typeof selectChild>[1] | null = null;
  let parentVisits = 0;
  for (const child of node.children.values()) parentVisits += child.visits;

  for (const [idx, child] of node.children) {
    const q = child.visits > 0 ? child.totalValue / child.visits : 0;
    const u = C_PUCT * child.prior * Math.sqrt(parentVisits + 1) / (1 + child.visits);
    const score = q + u;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
      bestChild = child;
    }
  }
  return [bestIdx, bestChild!];
}

/**
 * Corre hasta `maxSimulations` simulaciones desde `root` (o hasta que se
 * acabe el tiempo, si se indica `deadline`), y devuelve la distribucion de
 * visitas (la "politica mejorada"). El limite de tiempo es importante en
 * partidas con reloj: el tiempo que la IA piensa se descuenta de su propio
 * reloj, asi que no puede pensar indefinidamente.
 */
export async function runMcts(
  rootBoard: Board,
  rootPlayer: Player,
  model: tf.LayersModel,
  maxSimulations: number,
  deadline?: number
): Promise<{ root: MctsNode; visitCounts: Map<number, number> }> {
  const root = createNode(rootBoard, rootPlayer);
  await expand(root, model);

  for (let sim = 0; sim < maxSimulations; sim++) {
    if (deadline !== undefined && Date.now() >= deadline) break;
    const path: { node: MctsNode; idx: number; child: ReturnType<typeof selectChild>[1] }[] = [];
    let current = root;

    while (current.expanded && !current.isTerminal && current.children.size > 0) {
      const [idx, child] = selectChild(current);
      path.push({ node: current, idx, child });
      if (!child.node) {
        const nextBoard = applySequence(current.board, child.seq);
        const nextPlayer = otherPlayer(current.player);
        child.node = createNode(nextBoard, nextPlayer);
        break;
      }
      current = child.node;
    }

    const leaf = path.length > 0 ? path[path.length - 1].child.node! : root;
    let value: number;
    if (leaf.isTerminal) {
      value = leaf.terminalValue;
    } else {
      value = await expand(leaf, model);
    }

    // Retropropagar: el valor se invierte en cada nivel porque los jugadores alternan.
    let v = value;
    for (let i = path.length - 1; i >= 0; i--) {
      const { child } = path[i];
      child.visits += 1;
      child.totalValue += v;
      v = -v;
    }
  }

  const visitCounts = new Map<number, number>();
  for (const [idx, child] of root.children) visitCounts.set(idx, child.visits);
  return { root, visitCounts };
}
