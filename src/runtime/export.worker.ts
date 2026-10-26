/// <reference lib="webworker" />
import type { PyodideInterface } from 'pyodide';
import adapter from './adapter.py?raw';
import bootstrap from './bootstrap.py?raw';
import lock from '../../runtime.lock.json';
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
  const message = error instanceof Error ? error.message : String(error);
  send({ type: 'error', message });
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

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (busy) {
    send({ type: 'error', message: 'An export is already running.' });
    return;
  }
  busy = true;
  const start = performance.now();
  let pyodide: PyodideInterface | undefined;
  try {
    runtime ??= initialize(event.data.runtimeUrl).catch((error) => {
      runtime = undefined;
      throw error;
    });
    pyodide = await runtime;
    pyodide.globals.set('_payload_json', JSON.stringify(event.data.payload));
    pyodide.globals.set('_report', status);
    const result = pyodide.runPython('build_package(_payload_json, _report)');
    let bytes: Uint8Array;
    try {
      bytes = result.toJs().slice();
    } finally {
      result.destroy();
    }
    const buffer = bytes.buffer as ArrayBuffer;
    send({ type: 'complete', bytes: buffer, elapsedMs: performance.now() - start }, [buffer]);
  } catch (error) {
    reportError(error);
  } finally {
    pyodide?.globals.delete('_payload_json');
    pyodide?.globals.delete('_report');
    busy = false;
  }
};
