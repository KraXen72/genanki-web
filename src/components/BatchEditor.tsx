import { Show } from 'solid-js';
import type { Compilation } from '../core/compiler';
import type { ExportStage } from '../runtime/protocol';
import { ExportResult, type Download } from './ExportResult';
import { FileButton } from './FileButton';

export type ProcessingStage = '' | 'compiling' | ExportStage;
const stageLabels: Record<ProcessingStage, string> = {
  '': '',
  compiling: 'Compiling fields…',
  initializing: 'Loading local Python runtime…',
  packaging: 'Building Anki package…',
  verifying: 'Verifying ZIP and SQLite…',
};

interface BatchEditorProps {
  input: string;
  stage: ProcessingStage;
  error: string;
  compilation?: Compilation;
  download?: Download;
  onEdit: (text: string) => void;
  onOpen: (file: File) => void;
  onValidate: () => void;
  onGenerate: () => void;
  onCancel: () => void;
}

/** TOML editor and export progress; input remains in memory through recoverable failures. */
export function BatchEditor(props: BatchEditorProps) {
  const busy = () => !!props.stage;

  return (
    <section class="min-w-0">
      <div>
        <div class="mb-4 flex h-11 items-center justify-between gap-3">
          <h2 class="text-lg font-normal">TOML</h2>
          <FileButton
            label="Open TOML"
            icon="lucide--folder-open"
            class="btn-secondary btn-soft border-secondary/30"
            accept=".toml,text/plain"
            disabled={busy()}
            onSelect={props.onOpen}
          />
        </div>
        <label class="sr-only" for="toml">
          Paste the completed TOML batch
        </label>
        <textarea
          id="toml"
          class="textarea min-h-88 w-full resize-y rounded-md border-base-content/20 bg-base-100 p-3.5 sm:p-5 font-mono text-[15px] leading-relaxed focus:border-primary/60 focus:outline-primary/30"
          spellcheck={false}
          disabled={busy()}
          value={props.input}
          onInput={(event) => props.onEdit(event.currentTarget.value)}
          placeholder={
            'format_version = 1\ntemplate = "russian-vocabulary"\ntemplate_version = 1\n\n[[notes]]\n…'
          }
        />
        <div class="mt-5 flex flex-wrap items-center gap-3">
          <button
            class="btn btn-outline rounded-md border-base-content/20 text-[17px] font-bold shadow-none"
            disabled={busy() || !props.input.trim()}
            onClick={props.onValidate}
          >
            <span class="iconify lucide--check size-5" aria-hidden="true" />
            Validate
          </button>
          <button
            class="btn btn-primary flex-1 sm:flex-none rounded-md text-[17px] font-bold shadow-none"
            disabled={busy() || !props.input.trim()}
            onClick={props.onGenerate}
          >
            <span class="iconify lucide--package size-5" aria-hidden="true" />
            Generate .apkg
          </button>
          <Show when={busy()}>
            <button class="btn btn-ghost text-[17px] font-bold" onClick={props.onCancel}>
              Cancel
            </button>
          </Show>
        </div>
        <div aria-live="polite" aria-atomic="true">
          <Show when={props.stage}>
            {(stage) => (
              <p class="mt-5 flex items-center gap-3 text-[15px] text-base-content/80">
                <span class="loading loading-spinner loading-sm text-primary" />
                {stageLabels[stage()]}
              </p>
            )}
          </Show>
          <Show when={props.error}>
            <div class="alert alert-error alert-soft mt-5 block" role="alert">
              <strong class="font-medium">Could not complete the batch</strong>
              <pre class="mt-2 font-sans text-[15px] whitespace-pre-wrap wrap-anywhere">
                {props.error}
              </pre>
            </div>
          </Show>
          <Show when={props.compilation}>
            {(compilation) => (
              <ExportResult compilation={compilation()} download={props.download} />
            )}
          </Show>
        </div>
      </div>
    </section>
  );
}
