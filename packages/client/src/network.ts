import { io, Socket } from 'socket.io-client';
import type { Board, Player, Sequence, BoardVariant } from '@dama144/engine';

const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:4000';

export interface LobbyRoom {
  code: string;
  hostName: string;
  timeControlMinutes: number;
  boardVariant: BoardVariant;
  createdAt: number;
}

export interface RoomStateMsg {
  board: Board;
  turn: Player;
  lastMove: { r: number; c: number; fromR: number; fromC: number; captured: { r: number; c: number }[] } | null;
  clocks: { B: number; N: number };
  timeControlMinutes: number;
  status: 'waiting' | 'pending' | 'playing' | 'finished';
  names: { B: string; N: string };
}

export interface NetworkCallbacks {
  onLobbyUpdate: (rooms: LobbyRoom[]) => void;
  onRoomCreated: (code: string, myColor: Player, timeControlMinutes: number, boardVariant: BoardVariant) => void;
  onJoinRequestSent: (code: string) => void;
  onJoinRequestReceived: (code: string, requesterName: string) => void;
  onJoinRejected: () => void;
  onMatchStarted: (
    code: string,
    myColor: Player,
    timeControlMinutes: number,
    opponentName: string,
    boardVariant: BoardVariant
  ) => void;
  onState: (state: RoomStateMsg) => void;
  onGameOver: (winner: Player, reason: string) => void;
  onOpponentLeft: () => void;
  onError: (message: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export class NetworkClient {
  private socket: Socket;
  private currentToken: string | null = null;

  constructor(private cb: NetworkCallbacks) {
    console.info('[Dama144] Conectando al servidor:', SERVER_URL);
    this.socket = io(SERVER_URL, {
      autoConnect: true,
      reconnectionAttempts: Infinity,
      auth: (callback) => callback({ token: this.currentToken }),
    });

    this.socket.on('connect', () => {
      console.info('[Dama144] Conectado al servidor. socket id:', this.socket.id);
      cb.onConnected?.();
      this.socket.emit('join-lobby');
    });
    this.socket.on('disconnect', (reason) => {
      console.warn('[Dama144] Desconectado del servidor:', reason);
      cb.onDisconnected?.();
    });
    this.socket.on('connect_error', (err) => {
      console.error('[Dama144] Error de conexion a', SERVER_URL, '->', err.message);
      cb.onError(`No se pudo conectar a ${SERVER_URL} (${err.message}).`);
    });

    this.socket.on('lobby-update', (rooms: LobbyRoom[]) => cb.onLobbyUpdate(rooms));
    this.socket.on(
      'room-created',
      (data: { code: string; color: Player; timeControlMinutes: number; boardVariant: BoardVariant }) => {
        cb.onRoomCreated(data.code, data.color, data.timeControlMinutes, data.boardVariant);
      }
    );
    this.socket.on('join-request-sent', (data: { code: string }) => cb.onJoinRequestSent(data.code));
    this.socket.on('join-request', (data: { code: string; name: string }) => cb.onJoinRequestReceived(data.code, data.name));
    this.socket.on('join-rejected', () => cb.onJoinRejected());
    this.socket.on(
      'joined-match',
      (data: {
        code: string;
        color: Player;
        timeControlMinutes: number;
        opponentName: string;
        boardVariant: BoardVariant;
      }) => {
        cb.onMatchStarted(data.code, data.color, data.timeControlMinutes, data.opponentName, data.boardVariant);
      }
    );
    this.socket.on('state', (data: RoomStateMsg) => cb.onState(data));
    this.socket.on('game-over', (data: { winner: Player; reason: string }) => cb.onGameOver(data.winner, data.reason));
    this.socket.on('opponent-left', () => cb.onOpponentLeft());
    this.socket.on('room-error', (data: { message: string }) => cb.onError(data.message));
    this.socket.on('auth-error', (data: { message: string }) => cb.onError(data.message));
  }

  /** Actualiza el token de sesion y fuerza una reconexion para que el servidor lo verifique. */
  setToken(token: string | null) {
    this.currentToken = token;
    this.socket.disconnect();
    this.socket.connect();
  }

  joinLobby() {
    this.socket.emit('join-lobby');
  }

  leaveLobby() {
    this.socket.emit('leave-lobby');
  }

  createRoom(timeControlMinutes: number, boardVariant: BoardVariant) {
    this.socket.emit('create-room', { timeControlMinutes, boardVariant });
  }

  cancelRoom(code: string) {
    this.socket.emit('cancel-room', { code });
  }

  requestJoin(code: string) {
    this.socket.emit('request-join', { code });
  }

  cancelJoinRequest(code: string) {
    this.socket.emit('cancel-join-request', { code });
  }

  acceptJoin(code: string) {
    this.socket.emit('accept-join', { code });
  }

  rejectJoin(code: string) {
    this.socket.emit('reject-join', { code });
  }

  sendMove(code: string, seq: Sequence) {
    this.socket.emit('move', { code, seq });
  }

  leaveMatch(code: string) {
    this.socket.emit('leave-match', { code });
  }

  disconnect() {
    this.socket.disconnect();
  }
}
