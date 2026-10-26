import { For } from 'solid-js';
import type { Pack } from '../core/packs';
import { FileButton } from './FileButton';
import { QueuePrompt } from './QueuePrompt';

interface TemplatePickerProps {
  packs: Pack[];
  selected: Pack;
  busy: boolean;
  onSelect: (key: string) => void;
  onCopy: () => void;
  onImport: (file: File) => void;
}

/** Selects a pack and supplies instructions without displaying its card templates. */
export function TemplatePicker(props: TemplatePickerProps) {
  return (
    <aside class="border-b border-base-content/15 pb-7 md:border-0 md:pb-0">
      <div class="mb-4 flex h-11 items-center">
        <h2 class="text-lg font-normal">Template</h2>
      </div>
      <label class="sr-only" for="template">
        Note type
      </label>
      <select
        id="template"
        class="select h-12 w-full appearance-none rounded-md border-base-content/25 bg-base-100 text-[17px]"
        disabled={props.busy}
        value={props.selected.manifest.key}
        onChange={(event) => props.onSelect(event.currentTarget.value)}
      >
        <For each={props.packs}>
          {(pack) => <option value={pack.manifest.key}>{pack.manifest.name}</option>}
        </For>
      </select>
      <div class="mt-4 flex gap-3 md:flex-col">
        <button
          class="btn btn-primary flex-1 justify-start rounded-md text-[17px] font-bold shadow-none"
          disabled={props.busy}
          onClick={props.onCopy}
        >
          <span class="iconify lucide--copy size-5" aria-hidden="true" />
          Copy LLM prompt
        </button>
        <FileButton
          label="Import template ZIP"
          icon="lucide--archive"
          compact
          accept=".zip,application/zip"
          disabled={props.busy}
          onSelect={props.onImport}
        />
      </div>
      <QueuePrompt />
    </aside>
  );
}
