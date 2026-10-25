import { Chess } from 'chess.js';

export const ENGINE_PROFILES = {
  lite: { id: 'stockfish-19-lite', label: 'Stockfish 19 Lite', file: 'stockfish-19-lite-single.js', description: 'Mở nhanh · NNUE nhỏ, khoảng 1,9 MB' },
  full: { id: 'stockfish-19-full', label: 'Stockfish 19 NNUE', file: 'stockfish-19-single.js', description: 'Mạnh hơn · tải khoảng 99 MB lần đầu' },
} as const;
export type EngineProfile = keyof typeof ENGINE_PROFILES;
let engineProfile: EngineProfile = 'lite';
export const getEngineProfile = () => engineProfile;
export function setEngineProfile(profile: EngineProfile) {
  if (!(profile in ENGINE_PROFILES) || profile === engineProfile) return;
  engineProfile = profile;
  evaluations.clear();
}

export interface EngineEval {
  fen: string;
  cp?: number;
  mate?: number;
  mateWinner?: 'w' | 'b';
  bestMove?: string;
  pvLine?: string[];
  depth: number;
  finished: boolean;
  error?: string;
  engineId?: string;
  engineName?: string;
  analyzedAt?: number;
  elapsedMs?: number;
  targetDepth?: number;
  searchMoves?: string[];
  comparisonMoves?: string[];
  strengthLimited?: boolean;
  selectedMove?: string;
  variations?: EngineEval[];
  previous?: { cp?: number; mate?: number; bestMove?: string; depth: number };
}

export interface SearchOptions {
  signal?: AbortSignal;
  depth?: number;
  movetime?: number;
  skill?: number;
  elo?: number;
  multiPv?: number;
  onInfo?: (evaluation: EngineEval) => void;
  searchMoves?: string[];
}

export const abortError = () => new DOMException('Analysis cancelled', 'AbortError');
export const isAbortError = (error: unknown) => error instanceof Error && error.name === 'AbortError';
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export function evaluationScore(evaluation: Pick<EngineEval, 'cp' | 'mate' | 'mateWinner'>): number {
  if (evaluation.mate !== undefined) {
    const whiteWins = evaluation.mateWinner ? evaluation.mateWinner === 'w' : evaluation.mate > 0;
    return (whiteWins ? 1 : -1) * (30000 - Math.min(1000, Math.abs(evaluation.mate)) * 10);
  }
  return evaluation.cp ?? 0;
}

// UCI has no request IDs. Drain a cancelled search through bestmove before
// sending another position, so old output cannot be attributed to a new FEN.
export class UciEngine {
  private worker: Worker;
  private listeners = new Set<(line: string) => void>();
  private failures = new Set<(error: Error) => void>();
  private failure?: Error;
  private ready: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private engineId: string;
  private engineName = 'Stockfish 19';
  private startupTimeout: number;

  constructor(url: string, engineId: string = ENGINE_PROFILES[getEngineProfile()].id, startupTimeout = 30000) {
    this.engineId = engineId;
    this.startupTimeout = startupTimeout;
    this.worker = new Worker(url);
    this.worker.addEventListener('message', event => {
      if (typeof event.data === 'string') {
        for (const line of event.data.split(/\r?\n/)) {
          if (line.startsWith('id name ')) this.engineName = line.slice(8).trim();
          if (line.includes('CRITICAL ERROR')) this.dispose(new Error(line));
          this.listeners.forEach(listener => listener(line.trim()));
        }
      }
    });
    this.worker.addEventListener('error', () => this.dispose(new Error('Không tải được Stockfish. Hãy thử lại.')));
    this.worker.addEventListener('messageerror', () => this.dispose(new Error('Dữ liệu Stockfish không hợp lệ.')));
    this.ready = this.handshake();
    void this.ready.catch(() => {});
  }

  private commandResponse(command: string, target: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.failure) { reject(this.failure); return; }
      const cleanup = () => {
        clearTimeout(timer);
        this.listeners.delete(onLine);
        this.failures.delete(onError);
      };
      const onError = (error: Error) => { cleanup(); reject(error); };
      const onLine = (line: string) => { if (line === target) { cleanup(); resolve(); } };
      const timer = setTimeout(() => this.dispose(new Error('Stockfish khởi động quá lâu. Hãy thử lại hoặc chọn bản Lite.')), this.startupTimeout);
      this.listeners.add(onLine);
      this.failures.add(onError);
      this.worker.postMessage(command);
    });
  }

  private async handshake() {
    await this.commandResponse('uci', 'uciok');
    this.worker.postMessage('setoption name Hash value 16');
    this.worker.postMessage('setoption name MultiPV value 1');
    await this.commandResponse('isready', 'readyok');
  }

  async initialize() { await this.ready; }

  analyze(fen: string, options: SearchOptions = {}): Promise<EngineEval> {
    const task = this.queue.catch(() => {}).then(async () => {
      options.signal?.throwIfAborted();
      await this.ready;
      options.signal?.throwIfAborted();
      if (this.failure) throw this.failure;
      const chess = new Chess(fen);
      if (options.searchMoves?.length && options.searchMoves.some(move => !chess.moves({ verbose: true }).some(legal => legal.lan === move))) {
        throw new Error('Nước đi cần kiểm tra không hợp lệ ở thế cờ này.');
      }
      const started = performance.now();
      const limited = options.elo !== undefined || (options.skill !== undefined && options.skill < 20);
      const multiPv = Math.max(1, Math.min(options.multiPv ?? 1, chess.moves().length));
      const metadata = () => ({ engineId: this.engineId, engineName: this.engineName,
        analyzedAt: Date.now(), elapsedMs: Math.round(performance.now() - started), targetDepth: options.depth ?? 20,
        searchMoves: options.searchMoves, strengthLimited: limited });
      if (chess.isCheckmate()) {
        return { fen, depth: 0, finished: true, mate: 0, mateWinner: chess.turn() === 'w' ? 'b' as const : 'w' as const, ...metadata() };
      }
      if (chess.isDraw()) return { fen, cp: 0, depth: 0, finished: true, ...metadata() };

      return new Promise<EngineEval>((resolve, reject) => {
        let latest: EngineEval = { fen, depth: 0, finished: false };
        const ranks = new Map<number, EngineEval>();
        let complete: EngineEval[] | undefined;
        const black = chess.turn() === 'b';
        const cleanup = () => {
          clearTimeout(timer);
          this.listeners.delete(onLine);
          this.failures.delete(onError);
          options.signal?.removeEventListener('abort', onAbort);
        };
        const onError = (error: Error) => { cleanup(); reject(error); };
        const onAbort = () => this.worker.postMessage('stop');
        const onLine = (line: string) => {
          if (line.startsWith('info ') && !options.signal?.aborted) {
            const score = line.match(/\bscore (cp|mate) (-?\d+)/);
            if (!score || /\b(upperbound|lowerbound)\b/.test(line)) return;
            const pv = line.match(/\bpv (.+)$/)?.[1].split(/\s+/);
            const value = Number(score[2]) * (black ? -1 : 1);
            const depth = Number(line.match(/\bdepth (\d+)/)?.[1] ?? latest.depth);
            const rank = Number(line.match(/\bmultipv (\d+)/)?.[1] ?? 1);
            const prior = ranks.get(rank);
            const previous = prior && depth > prior.depth
              ? { cp: prior.cp, mate: prior.mate, bestMove: prior.bestMove, depth: prior.depth } : prior?.previous;
            const evaluation: EngineEval = {
              fen, finished: false, depth, previous, engineId: this.engineId, engineName: this.engineName,
              cp: score[1] === 'cp' ? value : undefined,
              mate: score[1] === 'mate' ? value : undefined,
              mateWinner: score[1] === 'mate' ? (value > 0 ? 'w' : 'b') : undefined,
              bestMove: pv?.[0], pvLine: pv,
            };
            ranks.set(rank, evaluation);
            // Never mix candidate scores from different iterations. A timeout
            // can interrupt MultiPV halfway through its next depth.
            const iteration = Array.from({ length: multiPv }, (_, index) => ranks.get(index + 1));
            if (iteration.every((entry): entry is EngineEval => !!entry && entry.depth === depth)) complete = iteration;
            if (rank === 1) {
              latest = evaluation;
              options.onInfo?.(latest);
            }
          } else if (line.startsWith('bestmove ')) {
            cleanup();
            if (options.signal?.aborted) { reject(abortError()); return; }
            const bestMove = line.match(/^bestmove ([a-h][1-8][a-h][1-8][qrbn]?)(?:\s|$)/)?.[1];
            if (latest.cp === undefined && latest.mate === undefined) {
              reject(new Error('Stockfish không trả về đánh giá. Hãy thử lại.'));
              return;
            }
            // Keep the score tied to its exact PV. A timed search may finish a
            // partial iteration with a different bestmove but no exact score.
            const result = multiPv > 1 && complete ? complete[0] : latest;
            resolve({ ...result, bestMove: result.bestMove ?? bestMove, selectedMove: bestMove,
              variations: multiPv > 1 ? complete?.map(entry => ({ ...entry, finished: true, ...metadata() })) : undefined,
              finished: true, ...metadata() });
          }
        };
        const timer = setTimeout(() => this.dispose(new Error('Stockfish không phản hồi. Hãy thử lại.')), (options.movetime ?? 900) + 10000);
        this.listeners.add(onLine);
        this.failures.add(onError);
        options.signal?.addEventListener('abort', onAbort, { once: true });
        this.worker.postMessage(`setoption name UCI_LimitStrength value ${options.elo !== undefined}`);
        if (options.elo !== undefined) this.worker.postMessage(`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, Math.round(options.elo)))}`);
        this.worker.postMessage(`setoption name Skill Level value ${options.skill ?? 20}`);
        this.worker.postMessage(`setoption name MultiPV value ${multiPv}`);
        this.worker.postMessage(`position fen ${fen}`);
        this.worker.postMessage(`go depth ${options.depth ?? 20} movetime ${options.movetime ?? 900}${options.searchMoves?.length ? ` searchmoves ${options.searchMoves.join(' ')}` : ''}`);
      });
    });
    this.queue = task;
    return task;
  }

  dispose(error: Error = abortError()) {
    if (this.failure) return;
    this.failure = error;
    this.worker.terminate();
    [...this.failures].forEach(listener => listener(error));
    this.failures.clear();
    this.listeners.clear();
  }
}

export async function createEngine(signal?: AbortSignal, profile: EngineProfile = getEngineProfile()): Promise<UciEngine> {
  const base = `${import.meta.env.BASE_URL}stockfish/`;
  if (profile === 'full' && typeof WebAssembly !== 'object') throw new Error('Bản NNUE đầy đủ cần WebAssembly. Hãy chọn bản Lite.');
  const variants = profile === 'full' ? [ENGINE_PROFILES.full.file] :
    typeof WebAssembly === 'object' ? [ENGINE_PROFILES.lite.file, 'stockfish-19-asm.js'] : ['stockfish-19-asm.js'];
  let lastError: unknown;
  for (const file of variants) {
    signal?.throwIfAborted();
    const engine = new UciEngine(base + file, ENGINE_PROFILES[profile].id, profile === 'full' ? 120000 : 30000);
    const onAbort = () => engine.dispose();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      await engine.initialize();
      signal?.throwIfAborted();
      return engine;
    } catch (error) {
      engine.dispose();
      if (signal?.aborted) throw abortError();
      lastError = error;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }
  throw lastError;
}

// Retain the full FEN: counters also affect draw adjudication.
const evaluations = new Map<string, EngineEval>();
export const getCachedEvaluation = (fen: string) => evaluations.get(fen);
export function clearCachedEvaluations(fens: Iterable<string>) {
  for (const fen of fens) evaluations.delete(fen);
}
export function cacheEvaluation(evaluation: EngineEval) {
  if (!evaluation.finished || evaluation.error || evaluation.searchMoves?.length || evaluation.comparisonMoves?.length || evaluation.strengthLimited) return;
  if (evaluation.engineId && evaluation.engineId !== ENGINE_PROFILES[getEngineProfile()].id) return;
  const existing = evaluations.get(evaluation.fen);
  // Adjacent review tasks share positions. A quick neighbor must not replace
  // a deeper verified result just because it finished publishing later.
  if (existing && existing.depth > evaluation.depth) return existing;
  evaluations.delete(evaluation.fen);
  evaluations.set(evaluation.fen, evaluation);
  if (evaluations.size > 1000) evaluations.delete(evaluations.keys().next().value!);
  return evaluation;
}
