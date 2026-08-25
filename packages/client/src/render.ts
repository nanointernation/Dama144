import { SIZE, isDark } from '@dama144/engine';
import type { GameController } from './game';

// Recuerda el ultimo movimiento ya animado, para no repetir la animacion en
// re-renders cosmeticos (por ejemplo, al solo seleccionar una ficha).
let lastAnimatedSeq = -1;

function screenIndexFor(r: number, c: number, flip: boolean): number {
  const screenR = flip ? SIZE - 1 - r : r;
  const screenC = flip ? SIZE - 1 - c : c;
  return screenR * SIZE + screenC;
}

/**
 * Dibuja el tablero. En modo online, si este cliente juega con Negras, el
 * tablero se voltea 180° para que sus propias fichas queden siempre abajo
 * (la posicion en pantalla es "screenR/screenC"; la casilla logica real que
 * se muestra ahi es "dispR/dispC").
 *
 * Ademas anima la ficha que se movio (deslizamiento) y las fichas
 * capturadas (desvanecimiento), usando la tecnica FLIP: se mide la posicion
 * ANTES de reconstruir el tablero, y se anima desde ahi hacia la posicion
 * final ya reconstruida.
 */
export function renderBoard(game: GameController, boardEl: HTMLElement, onSquareClick: (r: number, c: number) => void) {
  const board = game.getDisplayBoard();
  const highlightTargets = new Set(game.getHighlightTargets().map((t) => `${t.r},${t.c}`));
  const clickableStarts = game.getClickableStarts();
  const selectedPos = game.getSelectedCurrentPos();
  const lastMove = game.lastMove;
  const mandatory = game.mandatory;
  const flip = game.mode === 'online' && game.myColor === 'N';

  const shouldAnimate = lastMove !== null && game.moveSeq !== lastAnimatedSeq;

  // Paso 1 (FLIP - "First"): medir la posicion actual de la ficha que se
  // movio, ANTES de borrar el tablero. Si no existe (primer render), no pasa nada.
  let oldMoverRect: DOMRect | null = null;
  if (shouldAnimate && lastMove) {
    const idx = screenIndexFor(lastMove.fromR, lastMove.fromC, flip);
    const oldSquare = boardEl.children[idx] as HTMLElement | undefined;
    const oldPiece = oldSquare?.querySelector('.piece') as HTMLElement | null;
    if (oldPiece) oldMoverRect = oldPiece.getBoundingClientRect();
  }

  boardEl.innerHTML = '';

  for (let screenR = 0; screenR < SIZE; screenR++) {
    for (let screenC = 0; screenC < SIZE; screenC++) {
      const dispR = flip ? SIZE - 1 - screenR : screenR;
      const dispC = flip ? SIZE - 1 - screenC : screenC;

      const sq = document.createElement('div');
      sq.className = 'sq ' + (isDark(dispR, dispC) ? 'dark' : 'light');
      sq.dataset.r = String(dispR);
      sq.dataset.c = String(dispC);

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
        const interactive = clickableStarts.has(`${dispR},${dispC}`) || (selectedPos && selectedPos.r === dispR && selectedPos.c === dispC);
        if (interactive) {
          pd.style.cursor = 'grab';
          attachDragBehavior(pd, dispR, dispC, game, boardEl, flip, onSquareClick);
        }
        if (selectedPos && selectedPos.r === dispR && selectedPos.c === dispC) pd.classList.add('selected-piece');
        sq.appendChild(pd);
      }

      sq.addEventListener('click', () => onSquareClick(dispR, dispC));
      boardEl.appendChild(sq);
    }
  }

  if (!shouldAnimate || !lastMove) return;

  // Paso 2 (FLIP - "Last" + "Invert" + "Play"): la ficha movida ya esta en su
  // posicion final del DOM. Si tenemos su posicion anterior, la desplazamos
  // de vuelta alli instantaneamente y luego la animamos de regreso a (0,0).
  const newIdx = screenIndexFor(lastMove.r, lastMove.c, flip);
  const newSquare = boardEl.children[newIdx] as HTMLElement | undefined;
  const newPiece = newSquare?.querySelector('.piece') as HTMLElement | null;

  if (newPiece && oldMoverRect) {
    const newRect = newPiece.getBoundingClientRect();
    const dx = oldMoverRect.left - newRect.left;
    const dy = oldMoverRect.top - newRect.top;
    newPiece.style.transition = 'none';
    newPiece.style.transform = `translate(${dx}px, ${dy}px)`;
    // forzar reflow para que el navegador registre la posicion inicial antes de animar
    void newPiece.offsetHeight;
    requestAnimationFrame(() => {
      newPiece.style.transition = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)';
      newPiece.style.transform = 'translate(0, 0)';
    });
    // al terminar, se limpian los estilos inline para no bloquear el hover/seleccion via CSS
    newPiece.addEventListener(
      'transitionend',
      () => {
        newPiece.style.transition = '';
        newPiece.style.transform = '';
      },
      { once: true }
    );
  }

  // Fichas capturadas: se muestran brevemente con un efecto de desvanecimiento
  // en la casilla donde fueron capturadas (que ya quedo vacia tras el redibujado).
  for (const cap of lastMove.captured) {
    const idx = screenIndexFor(cap.r, cap.c, flip);
    const sq = boardEl.children[idx] as HTMLElement | undefined;
    if (!sq) continue;
    const ghost = document.createElement('div');
    ghost.className = 'piece p-' + game.turn + ' capture-fade';
    sq.appendChild(ghost);
    requestAnimationFrame(() => {
      ghost.classList.add('fade-out');
    });
    setTimeout(() => ghost.remove(), 360);
  }

  lastAnimatedSeq = game.moveSeq;
}

const DRAG_THRESHOLD_PX = 4;

/**
 * Permite arrastrar una ficha con el mouse (o el dedo, via Pointer Events)
 * en vez de dar dos clics. Al soltar sobre una casilla, dispara exactamente
 * el mismo "onSquareClick" que usaria un clic normal — reutiliza toda la
 * logica de reglas/turnos/capturas en cadena sin duplicar nada.
 */
function attachDragBehavior(
  pieceEl: HTMLElement,
  originR: number,
  originC: number,
  game: GameController,
  boardEl: HTMLElement,
  flip: boolean,
  onSquareClick: (r: number, c: number) => void
) {
  pieceEl.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== undefined && e.button !== 0) return; // solo boton principal / toque
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;

    // Selecciona la ficha (si aun no lo estaba) reutilizando la misma logica
    // que un clic normal. Esto puede disparar un re-render interno, asi que
    // volvemos a ubicar el elemento real de la ficha despues de esta llamada.
    onSquareClick(originR, originC);

    const curPos = game.getSelectedCurrentPos();
    if (!curPos) return; // no se pudo seleccionar (sin jugadas disponibles)

    const screenIdxNow = (function () {
      const sr = flip ? SIZE - 1 - curPos.r : curPos.r;
      const sc = flip ? SIZE - 1 - curPos.c : curPos.c;
      return sr * SIZE + sc;
    })();
    const curSquare = boardEl.children[screenIdxNow] as HTMLElement | undefined;
    const curPiece = curSquare?.querySelector('.piece') as HTMLElement | null;
    if (!curPiece) return;

    let dragging = false;

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        dragging = true;
        curPiece!.classList.add('dragging');
        curPiece!.style.zIndex = '50';
      }
      if (dragging) {
        curPiece!.style.transition = 'none';
        curPiece!.style.transform = `translate(${dx}px, ${dy}px) scale(1.12)`;
      }
    }

    function onUp(ev: PointerEvent) {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      if (!dragging) return;

      curPiece!.classList.remove('dragging');
      curPiece!.style.transform = '';
      curPiece!.style.zIndex = '';
      curPiece!.style.transition = '';

      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const sq = target?.closest('.sq') as HTMLElement | null;
      if (sq && sq.dataset.r !== undefined && sq.dataset.c !== undefined) {
        onSquareClick(Number(sq.dataset.r), Number(sq.dataset.c));
      } else {
        game.render();
      }
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  });
}
