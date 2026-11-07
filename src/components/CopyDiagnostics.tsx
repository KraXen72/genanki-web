import { createSignal, Show } from 'solid-js';

/** Copies complete diagnostics, retaining a manual fallback when clipboard access fails. */
export function CopyDiagnostics(props: { text: string }) {
  const [status, setStatus] = createSignal<'ready' | 'copied' | 'failed'>('ready');

  async function copy() {
    try {
      await navigator.clipboard.writeText(props.text);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <div class="min-w-0">
      <div class="flex items-center justify-end gap-2">
        <span class="text-sm" role="status">
          {status() === 'copied' ? 'Copied' : ''}
        </span>
        <button
          type="button"
          class="btn btn-ghost btn-square btn-sm shrink-0"
          aria-label="Copy all errors and warnings"
          title="Copy all errors and warnings"
          onClick={copy}
        >
          <span class="iconify lucide--copy size-5" aria-hidden="true" />
        </button>
      </div>
      <Show when={status() === 'failed'}>
        <label class="mt-2 block text-sm">
          Clipboard unavailable; select and copy the diagnostics.
          <textarea
            class="textarea mt-2 w-full font-mono text-sm"
            aria-label="Errors and warnings to copy"
            readonly
            value={props.text}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      </Show>
    </div>
  );
}
