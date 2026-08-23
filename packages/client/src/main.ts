import type { Difficulty, Player, Sequence, Board } from '@dama144/engine';
import { GameController } from './game';
import { renderBoard } from './render';
import { NetworkClient, type RoomStateMsg } from './network';

const menuScreen = document.getElementById('menuScreen')!;
const gameScreen = document.getElementById('gameScreen')!;
const boardEl = document.getElementById('board')!;
const turnLabel = document.getElementById('turnLabel')!;
const turnDot = document.getElementById('turnDot')!;
const statusLine = document.getElementById('statusLine')!;
const countB = document.getElementById('countB')!;
const countN = document.getElementById('countN')!;
const logEl = document.getElementById('log')!;
const overlay = document.getElementById('overlay')!;
const overlayTitle = document.getElementById('overlayTitle')!;
const overlayText = document.getElementById('overlayText')!;
const roomCodeCard = document.getElementById('roomCodeCard')!;
const roomCodeLabel = document.getElementById('roomCodeLabel')!;
const roomStatus = document.getElementById('roomStatus')!;
const onlineStatus = document.getElementById('onlineStatus')!;

let aiWorker: Worker | null = null;
let network: NetworkClient | null = null;
let roomCode: string | null = null;
let pendingDifficulty: Difficulty = 'media';

function playerName(p: Player) {
  return p === 'B' ? 'Blancas' : 'Negras';
}

function logMsg(msg: string) {
  const div = document.createElement('div');
  div.textContent = msg;
  logEl.prepend(div);
}

const game = new GameController({
  onRender: () => {
    renderBoard(game, boardEl, (r, c) => game.handleSquareClick(r, c));
    let cB = 0;
    let cN = 0;
    const b = game.board;
    for (let r = 0; r < b.length; r++)
      for (let c = 0; c < b.length; c++) {
        const p = b[r][c];
        if (p) {
          if (p.player === 'B') cB++;
          else cN++;
        }
      }
    countB.textContent = String(cB);
    countN.textContent = String(cN);
    turnLabel.textContent = 'Turno: ' + playerName(game.turn);
    turnDot.className = 'turn-dot ' + game.turn;
  },
  onStatus: (text, warn) => {
    statusLine.textContent = text;
    statusLine.className = 'status-line' + (warn ? ' warn' : '');
  },
  onLog: (text) => logMsg(text),
  onGameOver: (winner) => {
    overlayTitle.textContent = playerName(winner) + ' gana';
    overlayText.textContent = 'No hay movimientos legales disponibles para el otro jugador.';
    overlay.classList.add('show');
  },
  onLocalMoveChosen: (seq: Sequence) => {
    if (roomCode) network?.sendMove(roomCode, seq);
  },
  onRequestAiMove: (board: Board, player: Player) => {
    if (!aiWorker) aiWorker = new Worker(new URL('./ai-worker.ts', import.meta.url), { type: 'module' });
    const handler = (ev: MessageEvent<{ move: Sequence | null }>) => {
      aiWorker?.removeEventListener('message', handler);
      if (ev.data.move) game.applyLocally(ev.data.move);
    };
    aiWorker.addEventListener('message', handler);
    aiWorker.postMessage({ board, player, difficulty: pendingDifficulty });
  },
});

function showScreen(which: 'menu' | 'game') {
  menuScreen.style.display = which === 'menu' ? 'flex' : 'none';
  (gameScreen as HTMLElement).style.display = which === 'game' ? 'flex' : 'none';
}

function startLocal() {
  roomCode = null;
  showScreen('game');
  overlay.classList.remove('show');
  logEl.innerHTML = '';
  roomCodeCard.style.display = 'none';
  game.reset('local');
}

function startAi(difficulty: Difficulty) {
  roomCode = null;
  pendingDifficulty = difficulty;
  showScreen('game');
  overlay.classList.remove('show');
  logEl.innerHTML = '';
  roomCodeCard.style.display = 'none';
  game.reset('ai', { aiColor: 'N' }); // el humano siempre juega Blancas, la IA juega Negras
}

function ensureNetwork() {
  if (network) return network;
  network = new NetworkClient({
    onRoomCreated: (code, color) => {
      roomCode = code;
      showScreen('game');
      overlay.classList.remove('show');
      logEl.innerHTML = '';
      roomCodeCard.style.display = 'block';
      roomCodeLabel.textContent = code;
      roomStatus.textContent = 'Esperando a que se una tu oponente…';
      game.reset('online', { myColor: color });
    },
    onRoomJoined: (code, color) => {
      roomCode = code;
      showScreen('game');
      overlay.classList.remove('show');
      logEl.innerHTML = '';
      roomCodeCard.style.display = 'block';
      roomCodeLabel.textContent = code;
      roomStatus.textContent = 'Conectado. ¡Comienza la partida!';
      game.reset('online', { myColor: color });
    },
    onOpponentJoined: () => {
      roomStatus.textContent = '¡Tu oponente se conectó! Comienza la partida.';
    },
    onState: (state: RoomStateMsg) => {
      game.applyRemoteState(state.board, state.turn, state.lastMove);
    },
    onOpponentLeft: () => {
      roomStatus.textContent = 'Tu oponente se desconectó.';
    },
    onError: (message: string) => {
      onlineStatus.textContent = message;
      onlineStatus.className = 'status-line warn';
    },
  });
  return network;
}

document.getElementById('modeLocalBtn')!.addEventListener('click', startLocal);

document.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((btn) => {
  btn.addEventListener('click', () => startAi(btn.dataset.diff as Difficulty));
});

document.getElementById('createRoomBtn')!.addEventListener('click', () => {
  onlineStatus.textContent = 'Creando sala…';
  onlineStatus.className = 'status-line';
  ensureNetwork().createRoom();
});

document.getElementById('joinRoomBtn')!.addEventListener('click', () => {
  const input = document.getElementById('joinCodeInput') as HTMLInputElement;
  if (!input.value.trim()) return;
  onlineStatus.textContent = 'Uniéndose…';
  onlineStatus.className = 'status-line';
  ensureNetwork().joinRoom(input.value);
});

document.getElementById('restartBtn')!.addEventListener('click', () => {
  if (game.mode === 'local') startLocal();
  else if (game.mode === 'ai') startAi(pendingDifficulty);
  // en modo online el reinicio deberia negociarse con el servidor (no implementado en este MVP)
});

document.getElementById('overlayRestart')!.addEventListener('click', () => {
  overlay.classList.remove('show');
  if (game.mode === 'local') startLocal();
  else if (game.mode === 'ai') startAi(pendingDifficulty);
});

document.getElementById('backToMenuBtn')!.addEventListener('click', () => {
  network?.disconnect();
  network = null;
  roomCode = null;
  showScreen('menu');
});
