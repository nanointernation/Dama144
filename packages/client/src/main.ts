import type { Difficulty, Player, Sequence, Board } from '@dama144/engine';
import { GameController, type Mode } from './game';
import { renderBoard } from './render';
import { NetworkClient, type RoomStateMsg, type LobbyRoom } from './network';
import { formatClock } from './clock';
import { initTheme, updateTheme, resetTheme, type ThemeColors } from './theme';

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
const onlineStatus = document.getElementById('onlineStatus')!;

const timeControlSlider = document.getElementById('timeControlSlider') as HTMLInputElement;
const timeControlValue = document.getElementById('timeControlValue')!;
const createRoomBtn = document.getElementById('createRoomBtn') as HTMLButtonElement;
const hostWaitingCard = document.getElementById('hostWaitingCard')!;
const cancelHostBtn = document.getElementById('cancelHostBtn')!;
const joinRequestCard = document.getElementById('joinRequestCard')!;
const acceptJoinBtn = document.getElementById('acceptJoinBtn')!;
const rejectJoinBtn = document.getElementById('rejectJoinBtn')!;
const joinPendingCard = document.getElementById('joinPendingCard')!;
const cancelJoinBtn = document.getElementById('cancelJoinBtn')!;
const roomsList = document.getElementById('roomsList')!;
const roomsEmptyMsg = document.getElementById('roomsEmptyMsg')!;

const clockRowB = document.getElementById('clockRowB')!;
const clockRowN = document.getElementById('clockRowN')!;
const clockBEl = document.getElementById('clockB')!;
const clockNEl = document.getElementById('clockN')!;

let aiWorker: Worker | null = null;
let pendingDifficulty: Difficulty = 'media';
let pendingTimeControlMinutes = 15;
let currentRoomCode: string | null = null;
let clockIntervalId: number | null = null;

function playerName(p: Player) {
  return p === 'B' ? 'Blancas' : 'Negras';
}

function logMsg(msg: string) {
  const div = document.createElement('div');
  div.textContent = msg;
  logEl.prepend(div);
}

// ===== Reloj =====
function renderClockDisplay() {
  game.pollClock();
  const clocks = game.getClockValues();
  clockBEl.textContent = formatClock(clocks.B);
  clockNEl.textContent = formatClock(clocks.N);

  clockRowB.classList.toggle('active', game.turn === 'B' && !game.gameOver);
  clockRowN.classList.toggle('active', game.turn === 'N' && !game.gameOver);
  clockRowB.classList.toggle('low-time', clocks.B <= 60000);
  clockRowN.classList.toggle('low-time', clocks.N <= 60000);
}

function startClockInterval() {
  stopClockInterval();
  clockIntervalId = window.setInterval(renderClockDisplay, 500);
}

function stopClockInterval() {
  if (clockIntervalId !== null) {
    window.clearInterval(clockIntervalId);
    clockIntervalId = null;
  }
}

// ===== Controlador de juego =====
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
    renderClockDisplay();
  },
  onStatus: (text, warn) => {
    statusLine.textContent = text;
    statusLine.className = 'status-line' + (warn ? ' warn' : '');
  },
  onLog: (text) => logMsg(text),
  onGameOver: (winner, reason) => {
    stopClockInterval();
    overlayTitle.textContent = playerName(winner) + ' gana';
    if (reason === 'timeout') {
      const loser = winner === 'B' ? 'N' : 'B';
      overlayText.textContent = `${playerName(loser)} se quedó sin tiempo.`;
    } else {
      overlayText.textContent = 'No hay movimientos legales disponibles para el otro jugador.';
    }
    overlay.classList.add('show');
  },
  onLocalMoveChosen: (seq: Sequence) => {
    if (currentRoomCode) network.sendMove(currentRoomCode, seq);
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

function resetOnlineSubcards() {
  hostWaitingCard.style.display = 'none';
  joinRequestCard.style.display = 'none';
  joinPendingCard.style.display = 'none';
  createRoomBtn.disabled = false;
}

// ===== Modos locales =====
function startLocal() {
  currentRoomCode = null;
  showScreen('game');
  overlay.classList.remove('show');
  logEl.innerHTML = '';
  game.reset('local', { timeControlMinutes: pendingTimeControlMinutes });
  startClockInterval();
}

function startAi(difficulty: Difficulty) {
  currentRoomCode = null;
  pendingDifficulty = difficulty;
  showScreen('game');
  overlay.classList.remove('show');
  logEl.innerHTML = '';
  game.reset('ai', { aiColor: 'N', timeControlMinutes: pendingTimeControlMinutes });
  startClockInterval();
}

// ===== Selector de tiempo =====
timeControlSlider.addEventListener('input', () => {
  pendingTimeControlMinutes = Number(timeControlSlider.value);
  timeControlValue.textContent = `${pendingTimeControlMinutes} min`;
});

document.getElementById('modeLocalBtn')!.addEventListener('click', startLocal);
document.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((btn) => {
  btn.addEventListener('click', () => startAi(btn.dataset.diff as Difficulty));
});

// ===== Red / lobby en línea =====
function renderRoomsList(rooms: LobbyRoom[]) {
  roomsList.querySelectorAll('.room-row').forEach((el) => el.remove());
  roomsEmptyMsg.style.display = rooms.length === 0 ? 'block' : 'none';
  for (const room of rooms) {
    const row = document.createElement('div');
    row.className = 'room-row';
    const label = document.createElement('span');
    label.textContent = `Sala · ${room.timeControlMinutes} min`;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Pedir unirse';
    btn.addEventListener('click', () => {
      currentRoomCode = room.code;
      network.requestJoin(room.code);
      resetOnlineSubcards();
      joinPendingCard.style.display = 'flex';
    });
    row.appendChild(label);
    row.appendChild(btn);
    roomsList.appendChild(row);
  }
}

const network = new NetworkClient({
  onLobbyUpdate: (rooms) => renderRoomsList(rooms),
  onRoomCreated: (code) => {
    currentRoomCode = code;
    resetOnlineSubcards();
    createRoomBtn.disabled = true;
    hostWaitingCard.style.display = 'flex';
  },
  onJoinRequestSent: () => {
    // el estado visual ya se mostró al hacer clic en "Pedir unirse"
  },
  onJoinRequestReceived: () => {
    resetOnlineSubcards();
    createRoomBtn.disabled = true;
    joinRequestCard.style.display = 'flex';
  },
  onJoinRejected: () => {
    resetOnlineSubcards();
    onlineStatus.textContent = 'El anfitrión rechazó tu solicitud.';
    onlineStatus.className = 'status-line warn';
    currentRoomCode = null;
  },
  onMatchStarted: (code, color, timeControlMinutes) => {
    currentRoomCode = code;
    resetOnlineSubcards();
    onlineStatus.textContent = '';
    showScreen('game');
    overlay.classList.remove('show');
    logEl.innerHTML = '';
    game.reset('online', { myColor: color, timeControlMinutes });
    startClockInterval();
  },
  onState: (state: RoomStateMsg) => {
    game.applyRemoteState(state.board, state.turn, state.lastMove, state.clocks, state.status);
  },
  onGameOver: () => {
    // el evento 'state' ya trae el estado final; onGameOver del GameController maneja el overlay
    // via applyRemoteState -> checkGameOver, no se requiere accion adicional aqui.
  },
  onOpponentLeft: () => {
    stopClockInterval();
    overlayTitle.textContent = 'Partida interrumpida';
    overlayText.textContent = 'Tu oponente se desconectó.';
    overlay.classList.add('show');
    currentRoomCode = null;
  },
  onError: (message) => {
    onlineStatus.textContent = message;
    onlineStatus.className = 'status-line warn';
  },
});

network.joinLobby();

createRoomBtn.addEventListener('click', () => {
  network.createRoom(pendingTimeControlMinutes);
});

cancelHostBtn.addEventListener('click', () => {
  if (currentRoomCode) network.cancelRoom(currentRoomCode);
  currentRoomCode = null;
  resetOnlineSubcards();
});

acceptJoinBtn.addEventListener('click', () => {
  if (currentRoomCode) network.acceptJoin(currentRoomCode);
});

rejectJoinBtn.addEventListener('click', () => {
  if (currentRoomCode) network.rejectJoin(currentRoomCode);
  resetOnlineSubcards();
  hostWaitingCard.style.display = 'flex';
});

cancelJoinBtn.addEventListener('click', () => {
  if (currentRoomCode) network.cancelJoinRequest(currentRoomCode);
  currentRoomCode = null;
  resetOnlineSubcards();
});

// ===== Controles generales de partida =====
document.getElementById('restartBtn')!.addEventListener('click', () => {
  if (game.mode === 'local') startLocal();
  else if (game.mode === 'ai') startAi(pendingDifficulty);
  else {
    if (currentRoomCode) network.leaveMatch(currentRoomCode);
    goToMenu();
  }
});

document.getElementById('overlayRestart')!.addEventListener('click', () => {
  overlay.classList.remove('show');
  if (game.mode === 'local') startLocal();
  else if (game.mode === 'ai') startAi(pendingDifficulty);
  else goToMenu();
});

function goToMenu() {
  stopClockInterval();
  currentRoomCode = null;
  resetOnlineSubcards();
  network.joinLobby();
  showScreen('menu');
}

document.getElementById('backToMenuBtn')!.addEventListener('click', () => {
  if (game.mode === 'online' && currentRoomCode) network.leaveMatch(currentRoomCode);
  goToMenu();
});

// ===== Personalización de colores =====
const settingsOverlay = document.getElementById('settingsOverlay')!;
const colorLightSquare = document.getElementById('colorLightSquare') as HTMLInputElement;
const colorDarkSquare = document.getElementById('colorDarkSquare') as HTMLInputElement;
const colorPieceB = document.getElementById('colorPieceB') as HTMLInputElement;
const colorPieceN = document.getElementById('colorPieceN') as HTMLInputElement;
const colorAccent = document.getElementById('colorAccent') as HTMLInputElement;

function syncColorInputs(theme: ThemeColors) {
  colorLightSquare.value = theme.lightSquare;
  colorDarkSquare.value = theme.darkSquare;
  colorPieceB.value = theme.pieceB;
  colorPieceN.value = theme.pieceN;
  colorAccent.value = theme.accent;
}

function currentColorsFromInputs(): ThemeColors {
  return {
    lightSquare: colorLightSquare.value,
    darkSquare: colorDarkSquare.value,
    pieceB: colorPieceB.value,
    pieceN: colorPieceN.value,
    accent: colorAccent.value,
  };
}

syncColorInputs(initTheme());

[colorLightSquare, colorDarkSquare, colorPieceB, colorPieceN, colorAccent].forEach((input) => {
  input.addEventListener('input', () => updateTheme(currentColorsFromInputs()));
});

document.getElementById('settingsBtn')!.addEventListener('click', () => {
  settingsOverlay.classList.add('show');
});

document.getElementById('closeSettingsBtn')!.addEventListener('click', () => {
  settingsOverlay.classList.remove('show');
});

document.getElementById('resetColorsBtn')!.addEventListener('click', () => {
  syncColorInputs(resetTheme());
});
