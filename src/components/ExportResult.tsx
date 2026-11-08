import { For, Show } from 'solid-js';
import type { Compilation } from '../core/compiler';
import { CopyDiagnostics } from './CopyDiagnostics';

/** Browser-owned download URL and display metadata; the app releases replaced URLs. */
export interface Download {
  url: string;
  name: string;
  size: number;
  seconds: string;
}

interface ExportResultProps {
  compilation: Compilation;
  download?: Download;
  busy: boolean;
  onExportAnyway: () => void;
  diagnostics: string;
}

/** Displays compiler totals and the download offered only after package verification. */
export function ExportResult(props: ExportResultProps) {
  const noteCount = () => props.compilation.payload.notes.length;
  const cardCount = () => props.compilation.cardCount;
  const reviewWarnings = () => props.compilation.reviewWarnings;
  const needsReview = () => reviewWarnings().length > 0;
  const heading = () => {
    if (props.download) return 'Package verified';
    return needsReview() ? 'Batch valid, with warnings' : 'Batch valid';
  };

  return (
    <div class="mt-6 border-t border-base-300 pt-5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="font-semibold text-primary text-base">{heading()}</span>
        <span class="text-[15px]">
          <span class="font-mono">{noteCount()}</span> {noteCount() === 1 ? 'note' : 'notes'} · <span class="font-mono">{cardCount()}</span>{' '}
          {cardCount() === 1 ? 'card' : 'cards'}
        </span>
      </div>
      <dl class="mt-3 flex flex-wrap gap-x-3 text-[15px]">
        <dt class="text-base-content/75 grow">Destination</dt>
        <dd class="break-all font-medium">{props.compilation.payload.deck.name}</dd>
      </dl>
      <Show when={props.compilation.duplicates}>
        <p class="mt-3 text-[15px]">
          {props.compilation.duplicates} identical duplicate(s) removed.
        </p>
      </Show>
      <For each={props.compilation.warnings}>
        {(warning) => <p class="mt-3 text-[15px] text-warning">{warning}</p>}
      </For>
      <Show when={needsReview()}>
        <div class="alert alert-warning alert-soft mt-5 block" role="status">
          <div class="flex items-center justify-between gap-3 w-full text-warning">
            <strong class="font-semibold text-base">Check before exporting</strong>
            <CopyDiagnostics text={props.diagnostics} />
          </div>
          <ul class="mt-2 space-y-1 text-[15px] text-base-content wrap-anywhere">
            <For each={reviewWarnings()}>{(warning) => <li>{warning}</li>}</For>
          </ul>
          <Show when={!props.download && !props.busy}>
            <button class="btn btn-warning btn-outline mt-4" onClick={props.onExportAnyway}>
              Export anyway
            </button>
          </Show>
        </div>
      </Show>
      <Show when={props.download}>
        {(file) => (
          <div class="mt-5 flex flex-wrap items-center gap-4">
            <a
              class="btn btn-primary text-[17px] font-bold"
              href={file().url}
              download={file().name}
            >
              <span class="iconify lucide--download size-5" aria-hidden="true" />
              Download .apkg
            </a>
            <span class="text-[15px] text-base-content/75">
              {(file().size / 1024).toFixed(0)} KB · built in {file().seconds}s
            </span>
          </div>
        )}
      </Show>
    </div>
  );
}
