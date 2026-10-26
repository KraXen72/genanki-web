import { createSignal, Show } from 'solid-js';
import { queuePrompt } from '../core/prompt';

/** Shows the shared queue instructions used by the prompt assembler. */
export function QueuePrompt() {
  let dialog!: HTMLDialogElement;
  let codeBlock!: HTMLPreElement;
  const [copyStatus, setCopyStatus] = createSignal<'ready' | 'copied' | 'failed'>('ready');

  function openPrompt() {
    setCopyStatus('ready');
    dialog.showModal();
  }

  async function copyQueuePrompt() {
    try {
      await navigator.clipboard.writeText(queuePrompt.trim());
      setCopyStatus('copied');
    } catch {
      // select the text for manual copying when clipboard permission is unavailable
      const range = document.createRange();
      range.selectNodeContents(codeBlock);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      setCopyStatus('failed');
    }
  }

  return (
    <>
      <button
        class="btn btn-ghost mt-3 w-full justify-start rounded-md text-[17px] font-bold"
        onClick={openPrompt}
      >
        <span class="iconify lucide--list-ordered size-5" aria-hidden="true" />
        Queue prompt
      </button>
      <dialog
        ref={dialog}
        class="modal"
        aria-labelledby="queue-title"
        aria-describedby="queue-summary"
      >
        <div class="modal-box flex max-h-[85dvh] max-w-3xl flex-col gap-4 rounded-lg border border-base-content/15 bg-base-100 p-5 sm:p-7">
          <div class="flex items-center justify-between gap-4">
            <h2 id="queue-title" class="text-xl font-normal">
              Queue prompt
            </h2>
            <button
              class="btn btn-outline ml-auto justify-start text-[17px] font-bold"
              onClick={copyQueuePrompt}
            >
              <span class="iconify lucide--copy size-5" aria-hidden="true" />
              {copyStatus() === 'copied' ? 'Copied' : 'Copy'}
            </button>
            <form method="dialog">
              <button
                class="btn btn-square btn-outline h-11 min-h-11 w-11 shrink-0 justify-center p-0"
                aria-label="Close queue prompt"
              >
                <span class="iconify lucide--x size-5" aria-hidden="true" />
              </button>
            </form>
          </div>
          <p id="queue-summary" class="text-[15px] text-base-content/75">
            Included in every copied prompt.{' '}
            <a
              class="link link-primary"
              href="https://github.com/KraXen72/genanki-web/edit/main/prompts/queue.md"
              target="_blank"
              rel="noreferrer"
            >
              Edit on GitHub.
            </a>
          </p>
          <Show when={copyStatus() === 'failed'}>
            <p class="text-[15px] text-warning" role="status">
              Clipboard unavailable; copy the selected text.
            </p>
          </Show>
          <pre
            ref={codeBlock}
            class="overflow-auto rounded-md border border-base-content/15 bg-base-200 p-4 font-mono text-[15px] leading-relaxed whitespace-pre-wrap"
          >
            {queuePrompt.trim()}
          </pre>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button aria-label="Dismiss queue prompt">Close</button>
        </form>
      </dialog>
    </>
  );
}
