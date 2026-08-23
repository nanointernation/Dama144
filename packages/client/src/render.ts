import { SIZE, isDark } from '@dama144/engine';
import type { GameController } from './game';

/**
 * Dibuja el tablero. En modo online, si este cliente juega con Negras, el
 * tablero se voltea 180° para que sus propias fichas queden siempre abajo
 * (la posicion en pantalla es "screenR/screenC"; la casilla logica real que
 * se muestra ahi es "dispR/dispC").
 */
export function renderBoard(game: GameController, boardEl: HTMLElement, onSquareClick: (r: number, c: number) => void) {
  boardEl.innerHTML = '';
  const board = game.getDisplayBoard();
  const highlightTargets = new Set(game.getHighlightTargets().map((t) => `${t.r},${t.c}`));
  const clickableStarts = game.getClickableStarts();
  const selectedPos = game.getSelectedCurrentPos();
  const lastMove = game.lastMove;
  const mandatory = game.mandatory;

  const flip = game.mode === 'online' && game.myColor === 'N';

  for (let screenR = 0; screenR < SIZE; screenR++) {
    for (let screenC = 0; screenC < SIZE; screenC++) {
      const dispR = flip ? SIZE - 1 - screenR : screenR;
      const dispC = flip ? SIZE - 1 - screenC : screenC;

      const sq = document.createElement('div');
      sq.className = 'sq ' + (isDark(dispR, dispC) ? 'dark' : 'light');

      if (
        lastMove &&
        ((lastMove.r === dispR && lastMove.c === dispC) || (lastMove.fromR === dispR && lastMove.fromC === dispC))
      ) {
        sq.classList.add('last-move');
      }

      if (highlightTargets.has(`${dispR},${dispC}`)) {
        sq.classList.add('selectable');
        if (mandatory) sq.classList.add('forced');
      }

      const piece = board[dispR][dispC];
      if (piece) {
        const pd = document.createElement('div');
        pd.className = 'piece p-' + piece.player + (piece.king ? ' king' : '');
        if (clickableStarts.has(`${dispR},${dispC}`)) pd.style.cursor = 'pointer';
        if (selectedPos && selectedPos.r === dispR && selectedPos.c === dispC) pd.classList.add('selected-piece');
        sq.appendChild(pd);
      }

      sq.addEventListener('click', () => onSquareClick(dispR, dispC));
      boardEl.appendChild(sq);
    }
  }
}
