import { SIZE, isDark } from '@dama144/engine';
import type { GameController } from './game';

export function renderBoard(game: GameController, boardEl: HTMLElement, onSquareClick: (r: number, c: number) => void) {
  boardEl.innerHTML = '';
  const board = game.getDisplayBoard();
  const highlightTargets = new Set(game.getHighlightTargets().map((t) => `${t.r},${t.c}`));
  const clickableStarts = game.getClickableStarts();
  const selectedPos = game.getSelectedCurrentPos();
  const lastMove = game.lastMove;
  const mandatory = game.mandatory;

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const sq = document.createElement('div');
      sq.className = 'sq ' + (isDark(r, c) ? 'dark' : 'light');

      if (lastMove && ((lastMove.r === r && lastMove.c === c) || (lastMove.fromR === r && lastMove.fromC === c))) {
        sq.classList.add('last-move');
      }

      if (highlightTargets.has(`${r},${c}`)) {
        sq.classList.add('selectable');
        if (mandatory) sq.classList.add('forced');
      }

      const piece = board[r][c];
      if (piece) {
        const pd = document.createElement('div');
        pd.className = 'piece p-' + piece.player + (piece.king ? ' king' : '');
        if (clickableStarts.has(`${r},${c}`)) pd.style.cursor = 'pointer';
        if (selectedPos && selectedPos.r === r && selectedPos.c === c) pd.classList.add('selected-piece');
        sq.appendChild(pd);
      }

      sq.addEventListener('click', () => onSquareClick(r, c));
      boardEl.appendChild(sq);
    }
  }
}
