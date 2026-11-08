import type { ExportPayload } from '../core/export.generated';

/** Progress stages reported by the package worker, after browser-side compilation. */
export type ExportStage = 'initializing' | 'packaging' | 'verifying';

/** Verified package bytes and the worker's total initialization/build time. */
export interface ExportResult {
  bytes: ArrayBuffer;
  elapsedMs: number;
}

/** One compiled batch and the same-origin directory containing its pinned runtime. */
export type WorkerRequest = { payload: ExportPayload; runtimeUrl: string };

/** Worker progress, a verified package, or a recoverable failure. */
export type WorkerReply =
  | { type: 'status'; stage: ExportStage }
  | ({ type: 'complete' } & ExportResult)
  | { type: 'error'; message: string };
