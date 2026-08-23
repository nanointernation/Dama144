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
} from '@dama144/engine';

const PORT = Number(process.env.PORT) || 4000;
const ORIGIN = process.env.CLIENT_ORIGIN || '*';

const app = express();
app.use(cors({ origin: ORIGIN }));
app.get('/health', (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: ORIGIN } });

interface LastMove {
  r: number;
  c: number;
  fromR: number;
  fromC: number;
}

interface Room {
  code: string;
  board: Board;
  turn: Player;
  lastMove: LastMove | null;
  sockets: { B: string | null; N: string | null };
}

const rooms = new Map<string, Room>();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos

function generateCode(): string {
  let code: string;
  do {
    code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function roomState(room: Room) {
  return { board: room.board, turn: room.turn, lastMove: room.lastMove };
}

function findRoomBySocket(socketId: string): { room: Room; color: Player } | null {
  for (const room of rooms.values()) {
    if (room.sockets.B === socketId) return { room, color: 'B' };
    if (room.sockets.N === socketId) return { room, color: 'N' };
  }
  return null;
}

function sequencesEqual(a: Sequence, b: Sequence): boolean {
  if (a.startR !== b.startR || a.startC !== b.startC) return false;
  if (a.steps.length !== b.steps.length) return false;
  return a.steps.every((s, i) => s.toR === b.steps[i].toR && s.toC === b.steps[i].toC);
}

io.on('connection', (socket: Socket) => {
  socket.on('create-room', () => {
    const code = generateCode();
    const room: Room = {
      code,
      board: createInitialBoard(),
      turn: 'B',
      lastMove: null,
      sockets: { B: socket.id, N: null },
    };
    rooms.set(code, room);
    socket.join(code);
    socket.emit('room-created', { code, color: 'B' as Player });
  });

  socket.on('join-room', ({ code }: { code: string }) => {
    const room = rooms.get(code);
    if (!room) {
      socket.emit('room-error', { message: 'No existe una sala con ese código.' });
      return;
    }
    if (room.sockets.N) {
      socket.emit('room-error', { message: 'Esa sala ya está completa.' });
      return;
    }
    room.sockets.N = socket.id;
    socket.join(code);
    socket.emit('room-joined', { code, color: 'N' as Player });
    io.to(room.sockets.B!).emit('opponent-joined');
    io.to(code).emit('state', roomState(room));
  });

  socket.on('move', ({ code, seq }: { code: string; seq: Sequence }) => {
    const room = rooms.get(code);
    if (!room) return;
    const color: Player | null = room.sockets.B === socket.id ? 'B' : room.sockets.N === socket.id ? 'N' : null;
    if (!color || color !== room.turn) return; // no autorizado o no es su turno

    const legal = legalMovesForPlayer(room.board, room.turn);
    const match = legal.sequences.find((s) => sequencesEqual(s, seq));
    if (!match) {
      // jugada invalida: reenviar el estado actual para resincronizar al cliente
      socket.emit('state', roomState(room));
      return;
    }

    const lastStep = match.steps[match.steps.length - 1];
    room.board = applySequence(room.board, match);
    room.lastMove = { r: lastStep.toR, c: lastStep.toC, fromR: match.startR, fromC: match.startC };
    room.turn = room.turn === 'B' ? 'N' : 'B';

    io.to(code).emit('state', roomState(room));

    const status = checkGameStatus(room.board, room.turn);
    if (status.over) {
      io.to(code).emit('game-over', { winner: status.winner, reason: status.reason });
    }
  });

  socket.on('disconnect', () => {
    const found = findRoomBySocket(socket.id);
    if (!found) return;
    const { room, color } = found;
    io.to(room.code).emit('opponent-left');
    room.sockets[color] = null;
    if (!room.sockets.B && !room.sockets.N) rooms.delete(room.code);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Servidor Dama 144 escuchando en el puerto ${PORT}`);
});
