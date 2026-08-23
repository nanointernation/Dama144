import { getBestMove, type Board, type Player, type Difficulty } from '@dama144/engine';

export interface AiRequest {
  board: Board;
  player: Player;
  difficulty: Difficulty;
}

self.onmessage = (ev: MessageEvent<AiRequest>) => {
  const { board, player, difficulty } = ev.data;
  const move = getBestMove(board, player, difficulty);
  (self as unknown as Worker).postMessage({ move });
};
