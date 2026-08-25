import type { Player, Sequence, Board } from '@dama144/engine';
import type { Difficulty as ClassicDifficulty } from '@dama144/engine';

/** Las 3 dificultades clasicas (minimax) mas el nuevo modo neuronal (estilo AlphaZero). */
type AnyDifficulty = ClassicDifficulty | 'neuronal';
import { GameController, type Mode } from './game';
import { renderBoard } from './render';
import { NetworkClient, type RoomStateMsg, type LobbyRoom } from './network';
import { formatClock } from './clock';
import { initTheme, updateTheme, resetTheme, type ThemeColors } from './theme';
import {
  signUp,
  signIn,
  signOut,
  getSession,
  onAuthStateChange,
  getMyProfile,
  getLeaderboard,
  getMyMatchHistory,
  updateUsername,
  uploadAvatar,
  type Profile,
} from './auth';

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
const connStatus = document.getElementById('connStatus')!;
const vsLabel = document.getElementById('vsLabel')!;

// ===== Cuenta / autenticacion =====
const authLoggedOut = document.getElementById('authLoggedOut')!;
const authLoggedIn = document.getElementById('authLoggedIn')!;
const authFormTitle = document.getElementById('authFormTitle')!;
const authEmailInput = document.getElementById('authEmailInput') as HTMLInputElement;
const authPasswordInput = document.getElementById('authPasswordInput') as HTMLInputElement;
const authUsernameInput = document.getElementById('authUsernameInput') as HTMLInputElement;
const authSubmitBtn = document.getElementById('authSubmitBtn') as HTMLButtonElement;
const authToggleModeBtn = document.getElementById('authToggleModeBtn')!;
const authStatus = document.getElementById('authStatus')!;
const profileLine = document.getElementById('profileLine')!;
const profileAvatar = document.getElementById('profileAvatar') as HTMLImageElement;
const profileAvatarPlaceholder = document.getElementById('profileAvatarPlaceholder')!;
const signOutBtn = document.getElementById('signOutBtn')!;
const leaderboardBtn = document.getElementById('leaderboardBtn')!;
const leaderboardOverlay = document.getElementById('leaderboardOverlay')!;
const leaderboardList = document.getElementById('leaderboardList')!;
const closeLeaderboardBtn = document.getElementById('closeLeaderboardBtn')!;
const historyBtn = document.getElementById('historyBtn')!;
const historyOverlay = document.getElementById('historyOverlay')!;
const historyList = document.getElementById('historyList')!;
const closeHistoryBtn = document.getElementById('closeHistoryBtn')!;
const editProfileBtn = document.getElementById('editProfileBtn')!;
const editProfileOverlay = document.getElementById('editProfileOverlay')!;
const editAvatarPreview = document.getElementById('editAvatarPreview') as HTMLImageElement;
const editAvatarPlaceholder = document.getElementById('editAvatarPlaceholder')!;
const avatarFileInput = document.getElementById('avatarFileInput') as HTMLInputElement;
const chooseAvatarBtn = document.getElementById('chooseAvatarBtn')!;
const editUsernameInput = document.getElementById('editUsernameInput') as HTMLInputElement;
const editProfileStatus = document.getElementById('editProfileStatus')!;
const cancelEditProfileBtn = document.getElementById('cancelEditProfileBtn')!;
const saveProfileBtn = document.getElementById('saveProfileBtn') as HTMLButtonElement;

/** Actualiza una pareja img/placeholder para mostrar la foto de perfil o un circulo vacio si no hay. */
function applyAvatar(img: HTMLImageElement, placeholder: HTMLElement, url: string | null | undefined) {
  if (url) {
    img.src = url;
    img.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    img.style.display = 'none';
    placeholder.style.display = 'block';
  }
}

let pendingAvatarFile: File | null = null;

let isRegisterMode = false;
let myProfile: Profile | null = null;
let myAccessToken: string | null = null;

function setAuthMode(register: boolean) {
  isRegisterMode = register;
  authFormTitle.textContent = register ? 'Crear cuenta' : 'Iniciar sesión';
  authSubmitBtn.textContent = register ? 'Registrarse' : 'Iniciar sesión';
  authUsernameInput.style.display = register ? 'block' : 'none';
  authToggleModeBtn.textContent = register ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate';
  authStatus.textContent = '';
}

authToggleModeBtn.addEventListener('click', () => setAuthMode(!isRegisterMode));

authSubmitBtn.addEventListener('click', async () => {
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;
  if (!email || !password) {
    authStatus.textContent = 'Completa correo y contraseña.';
    authStatus.className = 'status-line warn';
    return;
  }
  authSubmitBtn.disabled = true;
  if (isRegisterMode) {
    const username = authUsernameInput.value.trim();
    if (!username) {
      authStatus.textContent = 'Elige un nombre de usuario.';
      authStatus.className = 'status-line warn';
      authSubmitBtn.disabled = false;
      return;
    }
    const { error } = await signUp(email, password, username);
    if (error) {
      authStatus.textContent = error.message;
      authStatus.className = 'status-line warn';
    } else {
      authStatus.textContent = 'Cuenta creada. Revisa tu correo para confirmar antes de iniciar sesión.';
      authStatus.className = 'status-line';
      setAuthMode(false);
    }
  } else {
    const { error } = await signIn(email, password);
    if (error) {
      authStatus.textContent = error.message;
      authStatus.className = 'status-line warn';
    }
  }
  authSubmitBtn.disabled = false;
});

signOutBtn.addEventListener('click', async () => {
  await signOut();
});

async function refreshAuthUI() {
  const session = await getSession();
  if (session) {
    myAccessToken = session.access_token;
    myProfile = await getMyProfile(session.user.id);
    network.setToken(myAccessToken);
    authLoggedOut.style.display = 'none';
    authLoggedIn.style.display = 'block';
    if (myProfile) {
      profileLine.textContent = `${myProfile.username} · Elo ${myProfile.elo} · ${myProfile.wins}V-${myProfile.losses}D`;
      applyAvatar(profileAvatar, profileAvatarPlaceholder, myProfile.avatar_url);
    }
  } else {
    myAccessToken = null;
    myProfile = null;
    network.setToken(null);
    authLoggedOut.style.display = 'block';
    authLoggedIn.style.display = 'none';
  }
}

onAuthStateChange(() => {
  refreshAuthUI();
});

leaderboardBtn.addEventListener('click', async () => {
  const top = await getLeaderboard(20);
  leaderboardList.innerHTML = '';
  if (top.length === 0) {
    leaderboardList.innerHTML = '<div class="status-line">Aún no hay jugadores registrados.</div>';
  }
  top.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    const avatarHtml = p.avatar_url
      ? `<img class="avatar avatar-sm" src="${p.avatar_url}" alt="" />`
      : `<div class="avatar avatar-sm avatar-placeholder"></div>`;
    row.innerHTML = `${avatarHtml}<div class="info"><span>#${i + 1} ${p.username}</span><span>Elo ${p.elo} · ${p.wins}V-${p.losses}D</span></div>`;
    leaderboardList.appendChild(row);
  });
  leaderboardOverlay.classList.add('show');
});

closeLeaderboardBtn.addEventListener('click', () => {
  leaderboardOverlay.classList.remove('show');
});

function formatMatchDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function reasonLabel(reason: string): string {
  if (reason === 'timeout') return 'por tiempo';
  if (reason === 'forfeit') return 'por abandono';
  return '';
}

historyBtn.addEventListener('click', async () => {
  if (!myAccessToken) return;
  const session = await getSession();
  if (!session) return;
  const matches = await getMyMatchHistory(session.user.id, 30);
  historyList.innerHTML = '';
  if (matches.length === 0) {
    historyList.innerHTML = '<div class="status-line">Aún no has jugado ninguna partida en línea.</div>';
  }
  matches.forEach((m) => {
    const row = document.createElement('div');
    row.className = 'history-row ' + (m.won ? 'win' : 'loss');
    const sign = m.myEloChange >= 0 ? '+' : '';
    row.innerHTML = `<div class="info">
      <span>${m.won ? '✅ Ganaste' : '❌ Perdiste'} vs ${m.opponentUsername} ${reasonLabel(m.reason)}</span>
      <span style="color:var(--ink-dim); font-size:12px;">${formatMatchDate(m.played_at)} · ${m.time_control_minutes} min</span>
    </div><span style="color:${m.myEloChange >= 0 ? 'var(--ok, #6c8a52)' : 'var(--danger)'};">${sign}${m.myEloChange}</span>`;
    historyList.appendChild(row);
  });
  historyOverlay.classList.add('show');
});

closeHistoryBtn.addEventListener('click', () => {
  historyOverlay.classList.remove('show');
});

// ===== Editar perfil =====
editProfileBtn.addEventListener('click', () => {
  if (!myProfile) return;
  editUsernameInput.value = myProfile.username;
  applyAvatar(editAvatarPreview, editAvatarPlaceholder, myProfile.avatar_url);
  pendingAvatarFile = null;
  editProfileStatus.textContent = '';
  editProfileOverlay.classList.add('show');
});

cancelEditProfileBtn.addEventListener('click', () => {
  editProfileOverlay.classList.remove('show');
});

chooseAvatarBtn.addEventListener('click', () => {
  avatarFileInput.click();
});

avatarFileInput.addEventListener('change', () => {
  const file = avatarFileInput.files?.[0];
  if (!file) return;
  pendingAvatarFile = file;
  const previewUrl = URL.createObjectURL(file);
  applyAvatar(editAvatarPreview, editAvatarPlaceholder, previewUrl);
});

saveProfileBtn.addEventListener('click', async () => {
  const session = await getSession();
  if (!session || !myProfile) return;
  saveProfileBtn.disabled = true;
  editProfileStatus.textContent = 'Guardando…';
  editProfileStatus.className = 'status-line';

  const newUsername = editUsernameInput.value.trim();
  if (newUsername && newUsername !== myProfile.username) {
    const err = await updateUsername(session.user.id, newUsername);
    if (err) {
      editProfileStatus.textContent = err.includes('duplicate') ? 'Ese nombre de usuario ya está en uso.' : err;
      editProfileStatus.className = 'status-line warn';
      saveProfileBtn.disabled = false;
      return;
    }
  }

  if (pendingAvatarFile) {
    const { error } = await uploadAvatar(session.user.id, pendingAvatarFile);
    if (error) {
      editProfileStatus.textContent = 'No se pudo subir la foto: ' + error;
      editProfileStatus.className = 'status-line warn';
      saveProfileBtn.disabled = false;
      return;
    }
  }

  await refreshAuthUI();
  saveProfileBtn.disabled = false;
  editProfileOverlay.classList.remove('show');
});

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
const clockLabelB = document.getElementById('clockLabelB')!;
const clockLabelN = document.getElementById('clockLabelN')!;
const clockBEl = document.getElementById('clockB')!;
const clockNEl = document.getElementById('clockN')!;

let aiWorker: Worker | null = null;
let neuralAiWorker: Worker | null = null;
let pendingDifficulty: AnyDifficulty = 'media';
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
function clockLabelFor(color: Player): string {
  if (game.mode === 'online' && myProfile) {
    if (color === game.myColor) return `⏱ Tú (${myProfile.username})`;
    return `⏱ ${game.opponentName ?? 'Rival'}`;
  }
  if (game.mode === 'ai') return color === game.aiColor ? '⏱ IA' : '⏱ Tú';
  return color === 'B' ? '⏱ Blancas' : '⏱ Negras';
}

/**
 * Determina que color va arriba en el panel, para que coincida siempre con la
 * posicion real de las fichas en el tablero: Negras siempre ocupan las filas
 * de arriba salvo en modo online cuando yo juego con Negras (ahi el tablero
 * se voltea para que mis fichas queden abajo, y el reloj debe seguir esa
 * misma logica).
 */
function topColor(): Player {
  if (game.mode === 'online' && game.myColor) {
    return game.myColor === 'B' ? 'N' : 'B';
  }
  return 'N';
}

function renderClockDisplay() {
  game.pollClock();
  const clocks = game.getClockValues();
  const top = topColor();
  const bottom: Player = top === 'B' ? 'N' : 'B';

  clockLabelB.textContent = clockLabelFor(top);
  clockLabelN.textContent = clockLabelFor(bottom);
  clockBEl.textContent = formatClock(clocks[top]);
  clockNEl.textContent = formatClock(clocks[bottom]);

  clockRowB.classList.toggle('active', game.turn === top && !game.gameOver);
  clockRowN.classList.toggle('active', game.turn === bottom && !game.gameOver);
  clockRowB.classList.toggle('low-time', clocks[top] <= 60000);
  clockRowN.classList.toggle('low-time', clocks[bottom] <= 60000);
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
    if (game.mode === 'online' && myProfile) {
      const isMyTurn = game.turn === game.myColor;
      turnLabel.textContent = isMyTurn ? 'Tu turno' : `Turno de ${game.opponentName ?? 'tu rival'}`;
    } else {
      turnLabel.textContent = 'Turno: ' + playerName(game.turn);
    }
    turnDot.className = 'turn-dot ' + game.turn;
    if (game.mode === 'online' && game.opponentName && myProfile) {
      const meLabel = playerName(game.myColor!) + ' (' + myProfile.username + ')';
      const rivalLabel = playerName(game.myColor === 'B' ? 'N' : 'B') + ' (' + game.opponentName + ')';
      vsLabel.textContent = `${meLabel} vs ${rivalLabel}`;
      vsLabel.style.display = 'block';
    } else {
      vsLabel.style.display = 'none';
    }
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
    } else if (reason === 'forfeit') {
      overlayText.textContent = 'El otro jugador abandonó la partida.';
    } else {
      overlayText.textContent = 'No hay movimientos legales disponibles para el otro jugador.';
    }
    if (game.mode === 'online') refreshAuthUI(); // refresca el Elo mostrado tras la partida
    overlay.classList.add('show');
  },
  onLocalMoveChosen: (seq: Sequence) => {
    if (currentRoomCode) network.sendMove(currentRoomCode, seq);
  },
  onRequestAiMove: (board: Board, player: Player) => {
    if (pendingDifficulty === 'neuronal') {
      if (!neuralAiWorker) neuralAiWorker = new Worker(new URL('./neural-ai-worker.ts', import.meta.url), { type: 'module' });
      const handler = (ev: MessageEvent<{ move: Sequence | null; error?: string }>) => {
        neuralAiWorker?.removeEventListener('message', handler);
        if (ev.data.error) {
          onlineStatus.textContent = ev.data.error;
          onlineStatus.className = 'status-line warn';
        }
        if (ev.data.move) game.applyLocally(ev.data.move);
      };
      neuralAiWorker.addEventListener('message', handler);
      neuralAiWorker.postMessage({ board, player });
      return;
    }
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

function startAi(difficulty: AnyDifficulty) {
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
  btn.addEventListener('click', () => startAi(btn.dataset.diff as AnyDifficulty));
});

// ===== Red / lobby en línea =====
function renderRoomsList(rooms: LobbyRoom[]) {
  const visibleRooms = rooms.filter((r) => r.code !== currentRoomCode);
  roomsList.querySelectorAll('.room-row').forEach((el) => el.remove());
  roomsEmptyMsg.style.display = visibleRooms.length === 0 ? 'block' : 'none';
  for (const room of visibleRooms) {
    const row = document.createElement('div');
    row.className = 'room-row';
    const label = document.createElement('span');
    label.textContent = `${room.hostName} · ${room.timeControlMinutes} min`;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Pedir unirse';
    btn.addEventListener('click', () => {
      if (!myAccessToken) {
        onlineStatus.textContent = 'Inicia sesión para jugar en línea.';
        onlineStatus.className = 'status-line warn';
        return;
      }
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
  onConnected: () => {
    connStatus.textContent = 'Conectado al servidor.';
    connStatus.className = 'status-line';
  },
  onDisconnected: () => {
    connStatus.textContent = 'Sin conexión al servidor. Reintentando…';
    connStatus.className = 'status-line warn';
  },
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
  onJoinRequestReceived: (code, requesterName) => {
    resetOnlineSubcards();
    createRoomBtn.disabled = true;
    joinRequestCard.style.display = 'flex';
    joinRequestCard.querySelector('.status-line')!.textContent = `${requesterName} quiere unirse a tu sala.`;
  },
  onJoinRejected: () => {
    resetOnlineSubcards();
    onlineStatus.textContent = 'El anfitrión rechazó tu solicitud.';
    onlineStatus.className = 'status-line warn';
    currentRoomCode = null;
  },
  onMatchStarted: (code, color, timeControlMinutes, opponentName) => {
    currentRoomCode = code;
    resetOnlineSubcards();
    onlineStatus.textContent = '';
    showScreen('game');
    overlay.classList.remove('show');
    logEl.innerHTML = '';
    game.reset('online', { myColor: color, timeControlMinutes, opponentName });
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
    refreshAuthUI();
  },
  onError: (message) => {
    onlineStatus.textContent = message;
    onlineStatus.className = 'status-line warn';
    if (message.toLowerCase().includes('conectar')) {
      connStatus.textContent = message;
      connStatus.className = 'status-line warn';
    }
  },
});

network.joinLobby();
refreshAuthUI();

createRoomBtn.addEventListener('click', () => {
  if (!myAccessToken) {
    onlineStatus.textContent = 'Inicia sesión para crear una sala.';
    onlineStatus.className = 'status-line warn';
    return;
  }
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
