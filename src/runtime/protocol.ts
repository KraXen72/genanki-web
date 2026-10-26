import type { ExportPayload } from '../core/export.generated';

export type ExportStage = 'initializing' | 'packaging' | 'verifying';
export type WorkerRequest = { payload: ExportPayload; runtimeUrl: string };
export type WorkerReply =
  | { type: 'status'; stage: ExportStage }
  | { type: 'complete'; bytes: ArrayBuffer; elapsedMs: number }
  | { type: 'error'; message: string };
