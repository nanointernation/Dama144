import {
  Board,
  Player,
  Sequence,
  SIZE,
  createInitialBoard,
  cloneBoard,
  legalMovesForPlayer,
  applySequence,
  isDark,
  checkGameStatus,
} from '@dama144/engine';
import { ChessClock } from './clock';

export type Mode = 'local' | 'ai' | 'online';
export type RoomStatus = 'waiting' | 'pending' | 'playing' | 'finished';

export interface LastMoveInfo {
  r: number;
  c: number;
  fromR: number;
  fromC: number;
  captured: { r: number; c: number }[];
}

interface Selected {
  startR: number;
  startC: number;
  stepIndex: number;
}

export interface GameCallbacks {
  onRender: () => void;
  onStatus: (text: string, warn: boolean) => void;
  onLog: (text: string) => void;
  onGameOver: (winner: Player, reason: string) => void;
  /** Solo se usa en modo 'online': se llama cuando el jugador local completa una secuencia, para enviarla al servidor. */
  onLocalMoveChosen?: (seq: Sequence) => void;
  /** Solo se usa en modo 'ai': se llama cuando le toca mover a la IA. */
  onRequestAiMove?: (board: Board, player: Player) => void;
}

const DEFAULT_TIME_CONTROL_MINUTES = 15;

export class GameController {
  board: Board = createInitialBoard();
  turn: Player = 'B';
  selected: Selected | null = null;
  activeSequences: Sequence[] = [];
  mandatory = false;
  gameOver = false;
  lastMove: LastMoveInfo | null = null;
  /** Se incrementa cada vez que hay un movimiento real (no en re-renders cosmeticos). render.ts lo usa para saber cuando animar. */
  moveSeq = 0;

  mode: Mode = 'local';
  /** En modo online: el color que controla ESTE cliente. En local/ai: null (ambos lados clicables). */
  myColor: Player | null = null;
  /** En modo ai: el color que juega la maquina. */
  aiColor: Player | null = null;
  /** En modo online: apodo del rival, para mostrarlo en vez de solo "Blancas"/"Negras". */
  opponentName: string | null = null;

  clock: ChessClock = new ChessClock(DEFAULT_TIME_CONTROL_MINUTES * 60000);
  timeControlMinutes: number = DEFAULT_TIME_CONTROL_MINUTES;

  constructor(private cb: GameCallbacks) {}

  reset(
    mode: Mode,
    opts: { myColor?: Player; aiColor?: Player; timeControlMinutes?: number; opponentName?: string } = {}
  ) {
    this.mode = mode;
    this.myColor = opts.myColor ?? null;
    this.aiColor = opts.aiColor ?? null;
    this.opponentName = opts.opponentName ?? null;
    this.timeControlMinutes = opts.timeControlMinutes ?? DEFAULT_TIME_CONTROL_MINUTES;
    this.board = createInitialBoard();
    this.turn = 'B';
    this.selected = null;
    this.gameOver = false;
    this.lastMove = null;
    this.clock = new ChessClock(this.timeControlMinutes * 60000);
    // El reloj NO arranca todavia: el tiempo empieza a correr recien despues
    // de la primera jugada (la primera jugada es "gratis", sin descuento).
    this.refreshLegal();
    this.render();
    this.maybeTriggerAi();
  }

  /** Reemplaza el estado completo (usado en modo online al recibir la version autoritativa del servidor). */
  applyRemoteState(
    board: Board,
    turn: Player,
    lastMove: LastMoveInfo | null,
    clocks: { B: number; N: number },
    status: RoomStatus
  ) {
    this.board = board;
    this.turn = turn;
    this.selected = null;
    this.lastMove = lastMove;
    if (lastMove) this.moveSeq++;
    this.clock.setRemaining(clocks);
    // El reloj solo corre si la partida esta en curso Y ya se jugo al menos
    // una jugada (lastMove !== null). Antes de la primera jugada, se muestra
    // el tiempo completo sin descontar.
    if (status === 'playing' && lastMove !== null && !this.gameOver) {
      this.clock.start(turn);
    } else {
      this.clock.stop();
    }
    this.refreshLegal();
    this.checkGameOver();
    this.render();
  }

  /** Se llama periódicamente desde main.ts para refrescar el reloj y detectar timeout (local/ai). */
  pollClock() {
    if (this.gameOver) return;
    if (this.mode === 'online') {
      this.clock.sync(); // solo refresca el valor mostrado; el servidor decide el timeout
      return;
    }
    const expired = this.clock.checkExpired();
    if (expired) {
      this.gameOver = true;
      this.clock.stop();
      const winner: Player = expired === 'B' ? 'N' : 'B';
      this.cb.onGameOver(winner, 'timeout');
    }
  }

  getClockValues(): { B: number; N: number } {
    return this.clock.sync();
  }

  private refreshLegal() {
    const legal = legalMovesForPlayer(this.board, this.turn);
    this.activeSequences = legal.sequences;
    this.mandatory = legal.mandatory;
  }

  private playerName(p: Player) {
    return p === 'B' ? 'Blancas' : 'Negras';
  }

  private checkGameOver(): boolean {
    const status = checkGameStatus(this.board, this.turn);
    if (status.over) {
      this.gameOver = true;
      this.clock.stop();
      this.cb.onGameOver(status.winner, status.reason);
      return true;
    }
    return false;
  }

  private canClickColor(color: Player): boolean {
    if (this.mode === 'online') return this.myColor === color && this.turn === color;
    if (this.mode === 'ai') return this.aiColor !== color && this.turn === color;
    return this.turn === color; // local: ambos lados humanos
  }

  private optionsForStart(r: number, c: number): Sequence[] {
    return this.activeSequences.filter((s) => s.startR === r && s.startC === c);
  }

  handleSquareClick(r: number, c: number) {
    if (this.gameOver) return;
    if (!this.canClickColor(this.turn)) return; // no es tu turno / no es tu color

    const piece = this.board[r][c];

    if (this.selected) {
      const options = this.optionsForStart(this.selected.startR, this.selected.startC).filter((o) =>
        this.matchesPrefix(o)
      );
      const match = options.find(
        (o) => o.steps[this.selected!.stepIndex].toR === r && o.steps[this.selected!.stepIndex].toC === c
      );
      if (match) {
        this.advanceSelection(match);
        return;
      }
      if (this.selected.stepIndex > 0) return; // no se puede cancelar a mitad de una cadena obligatoria
    }

    if (piece && piece.player === this.turn) {
      const options = this.optionsForStart(r, c);
      if (options.length > 0) {
        this.selected = { startR: r, startC: c, stepIndex: 0 };
        this.render();
        this.updateStatus();
        return;
      }
    }

    if (this.selected) {
      this.selected = null;
      this.render();
      this.updateStatus();
    }
  }

  private matchesPrefix(o: Sequence): boolean {
    if (!this.selected) return true;
    for (let i = 0; i < this.selected.stepIndex; i++) {
      const chosen = this.chosenPrefixSteps[i];
      if (o.steps[i].toR !== chosen.toR || o.steps[i].toC !== chosen.toC) return false;
    }
    return true;
  }

  private chosenPrefixSteps: { toR: number; toC: number }[] = [];

  private advanceSelection(match: Sequence) {
    if (!this.selected) return;
    this.chosenPrefixSteps.push({
      toR: match.steps[this.selected.stepIndex].toR,
      toC: match.steps[this.selected.stepIndex].toC,
    });
    const nextStepIndex = this.selected.stepIndex + 1;

    const remaining = this.optionsForStart(match.startR, match.startC).filter((o) => {
      for (let i = 0; i < nextStepIndex; i++) {
        if (o.steps[i].toR !== this.chosenPrefixSteps[i].toR || o.steps[i].toC !== this.chosenPrefixSteps[i].toC)
          return false;
      }
      return true;
    });

    const fullyChosen = remaining.find((o) => o.steps.length === nextStepIndex);
    if (fullyChosen) {
      this.commitSequence(fullyChosen);
      return;
    }

    this.selected = { startR: match.startR, startC: match.startC, stepIndex: nextStepIndex };
    this.render();
    this.updateStatus();
  }

  private commitSequence(seq: Sequence) {
    this.selected = null;
    this.chosenPrefixSteps = [];

    if (this.mode === 'online') {
      // no aplicamos localmente: esperamos la confirmacion autoritativa del servidor
      this.cb.onLocalMoveChosen?.(seq);
      return;
    }

    this.applyLocally(seq);
  }

  applyLocally(seq: Sequence) {
    const capturedCells = seq.steps
      .filter((s) => s.capR !== undefined)
      .map((s) => ({ r: s.capR as number, c: s.capC as number }));
    const capturedCount = capturedCells.length;
    const lastStep = seq.steps[seq.steps.length - 1];
    this.lastMove = { r: lastStep.toR, c: lastStep.toC, fromR: seq.startR, fromC: seq.startC, captured: capturedCells };
    this.moveSeq++;
    this.board = applySequence(this.board, seq);

    if (capturedCount > 0) {
      this.cb.onLog(`${this.playerName(this.turn)} captura ${capturedCount} ficha(s).`);
    } else {
      this.cb.onLog(`${this.playerName(this.turn)} mueve a (${lastStep.toR + 1},${lastStep.toC + 1}).`);
    }

    this.turn = this.turn === 'B' ? 'N' : 'B';
    this.refreshLegal();
    if (!this.checkGameOver()) {
      // A partir de aqui ya se jugo al menos una jugada: el reloj arranca
      // (o continua) para quien tenga el turno ahora.
      this.clock.start(this.turn);
      this.render();
      this.updateStatus();
      this.maybeTriggerAi();
    } else {
      this.render();
    }
  }

  private maybeTriggerAi() {
    if (this.mode === 'ai' && this.aiColor === this.turn && !this.gameOver) {
      this.cb.onRequestAiMove?.(this.board, this.turn);
    }
  }

  /** Vista del tablero incluyendo el movimiento parcial en curso (para no mutar el estado real). */
  private displayBoard(): Board {
    if (!this.selected || this.selected.stepIndex === 0) return this.board;
    const candidates = this.optionsForStart(this.selected.startR, this.selected.startC).filter((o) =>
      this.matchesPrefix(o)
    );
    const ref = candidates[0];
    if (!ref) return this.board;
    let b = cloneBoard(this.board);
    const piece = b[this.selected.startR][this.selected.startC];
    if (!piece) return this.board;
    b[this.selected.startR][this.selected.startC] = null;
    let r = this.selected.startR;
    let c = this.selected.startC;
    for (let i = 0; i < this.selected.stepIndex; i++) {
      const st = ref.steps[i];
      if (st.capR !== undefined && st.capC !== undefined) b[st.capR][st.capC] = null;
      r = st.toR;
      c = st.toC;
    }
    b[r][c] = piece;
    return b;
  }

  private updateStatus() {
    if (this.gameOver) return;
    if (this.activeSequences.length === 0) {
      this.cb.onStatus(`${this.playerName(this.turn)} no tiene movimientos disponibles.`, true);
      return;
    }
    if (this.mandatory) {
      const n = this.activeSequences[0].steps.length;
      this.cb.onStatus(`Captura obligatoria: debes comer ${n} ficha${n === 1 ? '' : 's'}.`, true);
    } else {
      this.cb.onStatus(this.selected ? 'Elige una casilla de destino.' : 'Selecciona una ficha para mover.', false);
    }
  }

  render() {
    this.cb.onRender();
  }

  getDisplayBoard(): Board {
    return this.displayBoard();
  }

  getHighlightTargets(): { r: number; c: number }[] {
    if (!this.selected) return [];
    const options = this.optionsForStart(this.selected.startR, this.selected.startC).filter((o) =>
      this.matchesPrefix(o)
    );
    return options.map((o) => ({ r: o.steps[this.selected!.stepIndex].toR, c: o.steps[this.selected!.stepIndex].toC }));
  }

  getSelectedCurrentPos(): { r: number; c: number } | null {
    if (!this.selected) return null;
    if (this.selected.stepIndex === 0) return { r: this.selected.startR, c: this.selected.startC };
    const options = this.optionsForStart(this.selected.startR, this.selected.startC).filter((o) =>
      this.matchesPrefix(o)
    );
    const ref = options[0];
    if (!ref) return null;
    const st = ref.steps[this.selected.stepIndex - 1];
    return { r: st.toR, c: st.toC };
  }

  getClickableStarts(): Set<string> {
    const set = new Set<string>();
    if (this.selected) return set;
    for (const s of this.activeSequences) {
      if (this.canClickColor(this.turn)) set.add(`${s.startR},${s.startC}`);
    }
    return set;
  }

  refreshAfterExternalUpdate() {
    this.updateStatus();
  }

  triggerStatusUpdate() {
    this.updateStatus();
  }
}

export { SIZE, isDark };
