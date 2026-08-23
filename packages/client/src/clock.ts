import type { Player } from '@dama144/engine';

export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Reloj de dos jugadores. En modo local/IA es autoritativo (decide el timeout).
 * En modo online se resincroniza con cada 'state' del servidor y solo se usa
 * para interpolar visualmente entre actualizaciones.
 */
export class ChessClock {
  private remaining: { B: number; N: number };
  private running: Player | null = null;
  private lastTickAt = Date.now();

  constructor(initialMsPerPlayer: number) {
    this.remaining = { B: initialMsPerPlayer, N: initialMsPerPlayer };
  }

  setRemaining(clocks: { B: number; N: number }) {
    this.remaining = { ...clocks };
    this.lastTickAt = Date.now();
  }

  start(player: Player) {
    this.sync();
    this.running = player;
    this.lastTickAt = Date.now();
  }

  stop() {
    this.sync();
    this.running = null;
  }

  /** Aplica el tiempo transcurrido desde el último sync y devuelve los remanentes actuales. */
  sync(): { B: number; N: number } {
    if (this.running) {
      const now = Date.now();
      const elapsed = now - this.lastTickAt;
      this.remaining[this.running] = Math.max(0, this.remaining[this.running] - elapsed);
      this.lastTickAt = now;
    }
    return { ...this.remaining };
  }

  /** Devuelve el jugador cuyo reloj llegó a 0 tras sincronizar, si aplica. */
  checkExpired(): Player | null {
    const r = this.sync();
    if (this.running && r[this.running] <= 0) return this.running;
    return null;
  }
}
