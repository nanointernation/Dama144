import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import {
  Board,
  Player,
  Sequence,
  createInitialBoard,
  legalMovesForPlayer,
  applySequence,
  checkGameStatus,
  otherPlayer,
} from '@dama144/engine';
import { verifyToken, recordMatchResult, type AuthUser } from './supabase.js';

const PORT = Number(process.env.PORT) || 4000;
const ORIGIN = process.env.CLIENT_ORIGIN || '*';

const app = express();
app.use(cors({ origin: ORIGIN }));
app.get('/health', (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
// Se permite polling + websocket (no forzar solo websocket) para máxima compatibilidad
// con redes/proxies que bloquean el upgrade directo a WebSocket.
const io = new Server(httpServer, { cors: { origin: ORIGIN } });

const LOBBY_ROOM = '__lobby__';
const MIN_MINUTES = 10;
const MAX_MINUTES = 60;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface LastMove {
  r: number;
  c: number;
  fromR: number;
  fromC: number;
}

type RoomStatus = 'waiting' | 'pending' | 'playing' | 'finished';

interface Room {
  code: string;
  hostId: string;
  hostUser: AuthUser;
  guestId: string | null;
  guestUser: AuthUser | null;
  pendingRequesterId: string | null;
  pendingRequesterUser: AuthUser | null;
  status: RoomStatus;
  timeControlMs: number;
  board: Board;
  turn: Player;
  lastMove: LastMove | null;
  clocks: { B: number; N: number };
  lastTickAt: number;
  hasMoved: boolean;
  createdAt: number;
  resultRecorded: boolean;
}

const rooms = new Map<string, Room>();

function getUserPromise(socket: Socket): Promise<AuthUser | null> {
  return (socket.data as { userPromise?: Promise<AuthUser | null> }).userPromise ?? Promise.resolve(null);
}

function generateCode(): string {
  let code: string;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function sequencesEqual(a: Sequence, b: Sequence): boolean {
  if (a.startR !== b.startR || a.startC !== b.startC) return false;
  if (a.steps.length !== b.steps.length) return false;
  return a.steps.every((s, i) => s.toR === b.steps[i].toR && s.toC === b.steps[i].toC);
}

function publicRoomsList() {
  return Array.from(rooms.values())
    .filter((r) => r.status === 'waiting')
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((r) => ({
      code: r.code,
      hostName: r.hostUser.username,
      timeControlMinutes: Math.round(r.timeControlMs / 60000),
      createdAt: r.createdAt,
    }));
}

function broadcastLobby() {
  io.to(LOBBY_ROOM).emit('lobby-update', publicRoomsList());
}

function roomStatePayload(room: Room) {
  return {
    board: room.board,
    turn: room.turn,
    lastMove: room.lastMove,
    clocks: { B: room.clocks.B, N: room.clocks.N },
    timeControlMinutes: Math.round(room.timeControlMs / 60000),
    status: room.status,
    names: { B: room.hostUser.username, N: room.guestUser?.username ?? 'Jugador' },
  };
}

function colorOf(room: Room, socketId: string): Player | null {
  if (room.hostId === socketId) return 'B';
  if (room.guestId === socketId) return 'N';
  return null;
}

async function finishGame(room: Room, winner: Player, reason: string) {
  if (room.resultRecorded) return;
  room.resultRecorded = true;
  room.status = 'finished';
  if (room.guestUser) {
    await recordMatchResult({
      hostUser: room.hostUser,
      guestUser: room.guestUser,
      winnerColor: winner,
      reason,
      timeControlMinutes: Math.round(room.timeControlMs / 60000),
    });
  }
}

async function endRoomByTimeout(room: Room) {
  const winner = otherPlayer(room.turn);
  await finishGame(room, winner, 'timeout');
  io.to(room.code).emit('state', roomStatePayload(room));
  io.to(room.code).emit('game-over', { winner, reason: 'timeout' });
}

function cleanupRoom(code: string) {
  rooms.delete(code);
  broadcastLobby();
}

// Revisa cada segundo si algún jugador se quedó sin tiempo, incluso si no mueve.
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.status !== 'playing' || !room.hasMoved) continue;
    const elapsed = now - room.lastTickAt;
    const remaining = room.clocks[room.turn] - elapsed;
    if (remaining <= 0) {
      room.clocks[room.turn] = 0;
      endRoomByTimeout(room);
    }
  }
}, 1000);

io.on('connection', (socket: Socket) => {
  const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
  (socket.data as { userPromise: Promise<AuthUser | null> }).userPromise = verifyToken(token);

  socket.on('join-lobby', () => {
    socket.join(LOBBY_ROOM);
    socket.emit('lobby-update', publicRoomsList());
  });

  socket.on('leave-lobby', () => {
    socket.leave(LOBBY_ROOM);
  });

  socket.on('create-room', async ({ timeControlMinutes }: { timeControlMinutes: number }) => {
    const user = await getUserPromise(socket);
    if (!user) {
      socket.emit('auth-error', { message: 'Debes iniciar sesión para crear una sala en línea.' });
      return;
    }
    const minutes = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(timeControlMinutes) || 15));
    const code = generateCode();
    const timeControlMs = minutes * 60000;
    const room: Room = {
      code,
      hostId: socket.id,
      hostUser: user,
      guestId: null,
      guestUser: null,
      pendingRequesterId: null,
      pendingRequesterUser: null,
      status: 'waiting',
      timeControlMs,
      board: createInitialBoard(),
      turn: 'B',
      lastMove: null,
      clocks: { B: timeControlMs, N: timeControlMs },
      lastTickAt: Date.now(),
      hasMoved: false,
      createdAt: Date.now(),
      resultRecorded: false,
    };
    rooms.set(code, room);
    socket.join(code);
    socket.emit('room-created', { code, color: 'B' as Player, timeControlMinutes: minutes });
    broadcastLobby();
  });

  socket.on('request-join', async ({ code }: { code: string }) => {
    const user = await getUserPromise(socket);
    if (!user) {
      socket.emit('auth-error', { message: 'Debes iniciar sesión para unirte a una sala.' });
      return;
    }
    const room = rooms.get(code);
    if (!room || room.status !== 'waiting') {
      socket.emit('room-error', { message: 'Esa sala ya no está disponible.' });
      return;
    }
    room.status = 'pending';
    room.pendingRequesterId = socket.id;
    room.pendingRequesterUser = user;
    socket.join(code);
    io.to(room.hostId).emit('join-request', { code, name: user.username });
    socket.emit('join-request-sent', { code });
    broadcastLobby();
  });

  socket.on('cancel-join-request', ({ code }: { code: string }) => {
    const room = rooms.get(code);
    if (!room || room.pendingRequesterId !== socket.id) return;
    room.pendingRequesterId = null;
    room.pendingRequesterUser = null;
    room.status = 'waiting';
    socket.leave(code);
    broadcastLobby();
  });

  socket.on('accept-join', ({ code }: { code: string }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || !room.pendingRequesterId || !room.pendingRequesterUser) return;
    room.guestId = room.pendingRequesterId;
    room.guestUser = room.pendingRequesterUser;
    room.pendingRequesterId = null;
    room.pendingRequesterUser = null;
    room.status = 'playing';
    room.lastTickAt = Date.now();
    const minutes = Math.round(room.timeControlMs / 60000);
    io.to(room.guestId).emit('joined-match', {
      code,
      color: 'N' as Player,
      timeControlMinutes: minutes,
      opponentName: room.hostUser.username,
    });
    socket.emit('joined-match', {
      code,
      color: 'B' as Player,
      timeControlMinutes: minutes,
      opponentName: room.guestUser.username,
    });
    io.to(code).emit('state', roomStatePayload(room));
  });

  socket.on('reject-join', ({ code }: { code: string }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;
    if (room.pendingRequesterId) {
      const rid = room.pendingRequesterId;
      io.to(rid).emit('join-rejected', { code });
      io.sockets.sockets.get(rid)?.leave(code);
    }
    room.pendingRequesterId = null;
    room.pendingRequesterUser = null;
    room.status = 'waiting';
    broadcastLobby();
  });

  socket.on('cancel-room', ({ code }: { code: string }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || room.status === 'playing') return;
    if (room.pendingRequesterId) {
      io.to(room.pendingRequesterId).emit('join-rejected', { code });
    }
    cleanupRoom(code);
  });

  socket.on('move', async ({ code, seq }: { code: string; seq: Sequence }) => {
    const room = rooms.get(code);
    if (!room || room.status !== 'playing') return;
    const color = colorOf(room, socket.id);
    if (!color || color !== room.turn) return;

    const now = Date.now();

    if (room.hasMoved) {
      // A partir de la segunda jugada, el tiempo transcurrido SI se descuenta.
      const elapsed = now - room.lastTickAt;
      const remaining = room.clocks[color] - elapsed;
      if (remaining <= 0) {
        room.clocks[color] = 0;
        await endRoomByTimeout(room);
        return;
      }
      room.clocks[color] = remaining;
    }
    // La primera jugada de la partida no descuenta tiempo de nadie.

    const legal = legalMovesForPlayer(room.board, room.turn);
    const match = legal.sequences.find((s) => sequencesEqual(s, seq));
    if (!match) {
      socket.emit('state', roomStatePayload(room));
      return;
    }

    const lastStep = match.steps[match.steps.length - 1];
    room.board = applySequence(room.board, match);
    room.lastMove = { r: lastStep.toR, c: lastStep.toC, fromR: match.startR, fromC: match.startC };
    room.turn = otherPlayer(room.turn);
    room.lastTickAt = now;
    room.hasMoved = true;

    io.to(code).emit('state', roomStatePayload(room));

    const status = checkGameStatus(room.board, room.turn);
    if (status.over) {
      await finishGame(room, status.winner, status.reason);
      io.to(code).emit('game-over', { winner: status.winner, reason: status.reason });
    }
  });

  socket.on('leave-match', async ({ code }: { code: string }) => {
    const room = rooms.get(code);
    if (!room) return;
    const color = colorOf(room, socket.id);
    if (color && room.status === 'playing') {
      await finishGame(room, otherPlayer(color), 'forfeit');
      io.to(code).emit('opponent-left');
    }
  });

  socket.on('disconnect', async () => {
    for (const room of rooms.values()) {
      const color = colorOf(room, socket.id);
      if (room.hostId === socket.id || room.guestId === socket.id) {
        if (room.status === 'playing' && color) {
          await finishGame(room, otherPlayer(color), 'forfeit');
          io.to(room.code).emit('opponent-left');
        }
        cleanupRoom(room.code);
      } else if (room.pendingRequesterId === socket.id) {
        room.pendingRequesterId = null;
        room.pendingRequesterUser = null;
        room.status = 'waiting';
        broadcastLobby();
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Servidor Dama 144 escuchando en el puerto ${PORT}`);
});
