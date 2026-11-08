/// <reference lib="webworker" />
import type { PyodideInterface } from 'pyodide';
import adapter from './adapter.py?raw';
import bootstrap from './bootstrap.py?raw';
import lock from '../../runtime.lock.json';
import { errorMessage } from '../core/errors';
import type { ExportStage, WorkerReply, WorkerRequest } from './protocol';

let runtime: Promise<PyodideInterface> | undefined;
let busy = false;

function send(message: WorkerReply, transfer: Transferable[] = []) {
  self.postMessage(message, transfer);
}

function status(stage: ExportStage) {
  send({ type: 'status', stage });
}

function reportError(error: unknown) {
  send({ type: 'error', message: errorMessage(error) });
}

// Pyodide can reject an internal asset promise while its main initialization stays pending.
// Forward that failure so the client can terminate this worker and offer a clean retry.
self.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  reportError(event.reason);
});

async function initialize(runtimeUrl: string): Promise<PyodideInterface> {
  status('initializing');
  const { loadPyodide } = await import(/* @vite-ignore */ `${runtimeUrl}pyodide.mjs`);
  const pyodide: PyodideInterface = await loadPyodide({
    indexURL: runtimeUrl,
    packageBaseUrl: runtimeUrl,
  });
  await pyodide.loadPackage(['micropip', 'pyyaml']);
  pyodide.globals.set(
    '_wheel_urls',
    lock.wheels.map((wheel) => `${runtimeUrl}${wheel.file}`),
  );
  try {
    await pyodide.runPythonAsync(bootstrap);
    await pyodide.runPythonAsync(adapter);
  } finally {
    pyodide.globals.delete('_wheel_urls');
  }
  return pyodide;
}

/** Copies package bytes out of Python-owned memory before releasing the proxy. */
function buildPackage(pyodide: PyodideInterface, payload: WorkerRequest['payload']): ArrayBuffer {
  try {
    pyodide.globals.set('_payload_json', JSON.stringify(payload));
    pyodide.globals.set('_report', status);
    const result = pyodide.runPython('build_package(_payload_json, _report)');
    try {
      const bytes: Uint8Array<ArrayBuffer> = result.toJs().slice();
      return bytes.buffer;
    } finally {
      result.destroy();
    }
  } finally {
    pyodide.globals.delete('_payload_json');
    pyodide.globals.delete('_report');
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (busy) {
    send({ type: 'error', message: 'An export is already running.' });
    return;
  }
  busy = true;
  const start = performance.now();

  try {
    runtime ??= initialize(event.data.runtimeUrl).catch((error) => {
      runtime = undefined;
      throw error;
    });
    const pyodide = await runtime;
    const buffer = buildPackage(pyodide, event.data.payload);
    send({ type: 'complete', bytes: buffer, elapsedMs: performance.now() - start }, [buffer]);
  } catch (error) {
    reportError(error);
  } finally {
    busy = false;
  }
};
