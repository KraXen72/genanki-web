import type { ExportPayload } from '../core/export.generated';
import type { ExportStage, WorkerReply } from './protocol';

/** Single package-writer boundary. Cancellation terminates the worker and releases its runtime. */
export class Exporter {
  private worker?: Worker;
  private reject?: (reason: Error) => void;

  /** Builds one verified package and reports worker stages. Rejects overlapping requests. */
  export(
    payload: ExportPayload,
    onStage: (stage: ExportStage) => void,
  ): Promise<{ bytes: ArrayBuffer; elapsedMs: number }> {
    if (this.reject) return Promise.reject(new Error('An export is already running.'));
    this.worker ??= new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
    const worker = this.worker;
    return new Promise((resolve, reject) => {
      this.reject = reject;
      worker.onmessage = (event: MessageEvent<WorkerReply>) => {
        const message = event.data;
        if (message.type === 'status') onStage(message.stage);
        else if (message.type === 'complete') {
          this.reject = undefined;
          resolve(message);
        } else {
          this.cancel(new Error(message.message));
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        this.cancel(
          new Error(event.message || 'Export worker failed. Retry to reload the runtime.'),
        );
      };
      worker.postMessage({
        payload,
        runtimeUrl: new URL(`${import.meta.env.BASE_URL}runtime/`, location.origin).href,
      });
    });
  }

  /** Releases the runtime and rejects any pending export; the next export starts a fresh worker. */
  cancel(reason = new Error('Export cancelled. Your TOML is still available.')): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.reject?.(reason);
    this.reject = undefined;
  }
}
