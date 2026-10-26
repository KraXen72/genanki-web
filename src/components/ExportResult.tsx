import { For, Show } from 'solid-js';
import type { Compilation } from '../core/compiler';

export interface Download {
  url: string;
  name: string;
  size: number;
  seconds: string;
}

interface ExportResultProps {
  compilation: Compilation;
  download?: Download;
}

/** Displays compiler totals and the download offered only after package verification. */
export function ExportResult(props: ExportResultProps) {
  const noteCount = () => props.compilation.payload.notes.length;
  const cardCount = () => props.compilation.cardCount;

  return (
    <div class="mt-6 border-t border-base-300 pt-5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="font-medium text-primary">
          {props.download ? 'Package verified' : 'Batch valid'}
        </span>
        <span class="text-[15px]">
          {noteCount()} {noteCount() === 1 ? 'note' : 'notes'} · {cardCount()}{' '}
          {cardCount() === 1 ? 'card' : 'cards'}
        </span>
      </div>
      <dl class="mt-3 flex flex-wrap gap-x-3 text-[15px]">
        <dt class="text-base-content/75">Destination</dt>
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
