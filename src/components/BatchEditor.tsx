import { createSignal, Show } from 'solid-js';
import type { Compilation } from '../core/compiler';
import type { ExportStage } from '../runtime/protocol';
import { ExportResult, type Download } from './ExportResult';
import { CopyDiagnostics } from './CopyDiagnostics';
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
  onExportAnyway: () => void;
  onCancel: () => void;
}

/** TOML editor and export progress; input remains in memory through recoverable failures. */
export function BatchEditor(props: BatchEditorProps) {
  const busy = () => !!props.stage;
  const [pasteError, setPasteError] = createSignal('');
  const [pasting, setPasting] = createSignal(false);
  const diagnostics = () =>
    [
      props.error,
      ...(props.compilation?.warnings ?? []),
      ...(props.compilation?.reviewWarnings ?? []),
    ]
      .filter(Boolean)
      .join('\n');

  async function pasteClipboard() {
    setPasteError('');
    setPasting(true);
    try {
      const text = await navigator.clipboard.readText();
      if (!busy()) props.onEdit(text);
    } catch {
      setPasteError('Clipboard unavailable. Paste directly into the TOML editor.');
    } finally {
      setPasting(false);
    }
  }

  return (
    <section class="min-w-0">
      <div>
        <div class="mb-4 flex h-11 items-center justify-between gap-3">
          <h2 class="text-lg font-normal">TOML</h2>
          <div class="flex items-center gap-2">
            <FileButton
              label="Open TOML"
              icon="lucide--folder-open"
              iconOnly
              class="btn-square justify-center btn-secondary btn-soft border-secondary/30"
              accept=".toml,text/plain"
              disabled={busy() || pasting()}
              onSelect={props.onOpen}
            />
            <button
              type="button"
              class="btn btn-square btn-secondary btn-soft border-secondary/30"
              aria-label="Paste TOML from clipboard"
              title="Paste TOML from clipboard"
              disabled={busy() || pasting()}
              onClick={pasteClipboard}
            >
              <span class="iconify lucide--clipboard-paste size-5 shrink-0" aria-hidden="true" />
            </button>
          </div>
        </div>
        <Show when={pasteError()}>
          <p class="mb-3 text-[15px] text-warning" role="status">
            {pasteError()}
          </p>
        </Show>
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
            class="btn btn-outline shrink-0 whitespace-nowrap rounded-md border-base-content/20 text-[17px] font-bold shadow-none"
            disabled={busy() || !props.input.trim()}
            onClick={props.onValidate}
          >
            <span class="iconify lucide--check size-5" aria-hidden="true" />
            Validate
          </button>
          <button
            class="btn btn-primary shrink-0 whitespace-nowrap rounded-md text-[17px] font-bold shadow-none"
            disabled={busy() || !props.input.trim()}
            onClick={props.onGenerate}
          >
            <span class="iconify lucide--package size-5 shrink-0" aria-hidden="true" />
            Generate .apkg
          </button>
          <Show when={busy()}>
            <button
              class="btn btn-ghost shrink-0 whitespace-nowrap text-[17px] font-bold"
              onClick={props.onCancel}
            >
              Cancel
            </button>
          </Show>
        </div>
        <div aria-live="polite" aria-atomic="true">
          <Show when={props.stage}>
            {(stage) => (
              <p class="mt-5 flex items-center gap-3 text-[15px] text-base-content/80">
                <span class="loading loading-spinner loading-sm shrink-0 text-primary" />
                <span class="min-w-0">{stageLabels[stage()]}</span>
              </p>
            )}
          </Show>
          <Show when={props.error}>
            <div class="alert alert-error alert-soft mt-5 block" role="alert">
              <div class="flex items-start justify-between gap-3">
                <strong class="font-medium">Could not complete the batch</strong>
                <CopyDiagnostics text={diagnostics()} />
              </div>
              <pre class="mt-2 font-sans text-[15px] whitespace-pre-wrap wrap-anywhere">
                {props.error}
              </pre>
            </div>
          </Show>
          <Show when={props.compilation}>
            {(compilation) => (
              <ExportResult
                compilation={compilation()}
                download={props.download}
                busy={busy()}
                onExportAnyway={props.onExportAnyway}
                diagnostics={diagnostics()}
              />
            )}
          </Show>
        </div>
      </div>
    </section>
  );
}
