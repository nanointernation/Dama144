import { io, Socket } from 'socket.io-client';
import type { Board, Player, Sequence } from '@dama144/engine';

// En desarrollo el servidor corre en el puerto 4000. En produccion, configurar via variable de entorno de build.
const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:4000';

export interface RoomStateMsg {
  board: Board;
  turn: Player;
  lastMove: { r: number; c: number; fromR: number; fromC: number } | null;
}

export interface NetworkCallbacks {
  onRoomCreated: (code: string, myColor: Player) => void;
  onRoomJoined: (code: string, myColor: Player) => void;
  onOpponentJoined: () => void;
  onState: (state: RoomStateMsg) => void;
  onOpponentLeft: () => void;
  onError: (message: string) => void;
}

export class NetworkClient {
  private socket: Socket;

  constructor(private cb: NetworkCallbacks) {
    this.socket = io(SERVER_URL, { transports: ['websocket'], autoConnect: true });

    this.socket.on('room-created', (data: { code: string; color: Player }) => {
      cb.onRoomCreated(data.code, data.color);
    });
    this.socket.on('room-joined', (data: { code: string; color: Player }) => {
      cb.onRoomJoined(data.code, data.color);
    });
    this.socket.on('opponent-joined', () => cb.onOpponentJoined());
    this.socket.on('state', (data: RoomStateMsg) => cb.onState(data));
    this.socket.on('opponent-left', () => cb.onOpponentLeft());
    this.socket.on('room-error', (data: { message: string }) => cb.onError(data.message));
    this.socket.on('connect_error', () => cb.onError('No se pudo conectar al servidor.'));
  }

  createRoom() {
    this.socket.emit('create-room');
  }

  joinRoom(code: string) {
    this.socket.emit('join-room', { code: code.trim().toUpperCase() });
  }

  sendMove(code: string, seq: Sequence) {
    this.socket.emit('move', { code, seq });
  }

  disconnect() {
    this.socket.disconnect();
  }
}
