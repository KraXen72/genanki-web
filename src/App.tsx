import { createSignal, onCleanup, Show } from 'solid-js';
import { BatchEditor, type ProcessingStage } from './components/BatchEditor';
import type { Download } from './components/ExportResult';
import { TemplatePicker } from './components/TemplatePicker';
import { ThemePicker } from './components/ThemePicker';
import { compileBatch, type Compilation } from './core/compiler';
import { bundledPacks, importPack, type Pack } from './core/packs';
import { assemblePrompt } from './core/prompt';
import { LIMITS } from './core/validation';
import { Exporter } from './runtime/exporter';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function App() {
  const [packs, setPacks] = createSignal(bundledPacks());
  const [selectedKey, setSelectedKey] = createSignal('russian-vocabulary');
  const [input, setInput] = createSignal('');
  const [isFileInput, setIsFileInput] = createSignal(false);
  const [error, setError] = createSignal('');
  const [notice, setNotice] = createSignal('');
  const [promptFallback, setPromptFallback] = createSignal('');
  const [compilation, setCompilation] = createSignal<Compilation>();
  const [stage, setStage] = createSignal<ProcessingStage>('');
  const [download, setDownload] = createSignal<Download>();

  const exporter = new Exporter();
  const selectedPack = () => packs().find((pack) => pack.manifest.key === selectedKey())!;
  let operation = 0;

  function releaseDownload() {
    const previous = download();
    if (previous) URL.revokeObjectURL(previous.url);
    setDownload(undefined);
  }

  function clearResult() {
    releaseDownload();
    setCompilation(undefined);
    setError('');
  }

  function editInput(text: string, fromFile = false) {
    clearResult();
    setInput(text);
    setIsFileInput(fromFile);
  }

  function selectPack(key: string) {
    setSelectedKey(key);
    setPromptFallback('');
    setNotice('');
  }

  async function copyPrompt() {
    const text = assemblePrompt(selectedPack());

    try {
      await navigator.clipboard.writeText(text);
      setNotice('LLM prompt copied. Paste it into your conversation.');
      setPromptFallback('');
    } catch {
      setPromptFallback(text);
      setNotice('Clipboard access is unavailable. Select and copy the prompt below.');
    }
  }

  async function openToml(file: File) {
    try {
      if (file.size > LIMITS.inputBytes) throw new Error('TOML file exceeds 4 MiB.');
      const buffer = await file.arrayBuffer();
      const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      editInput(text, true);
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  function addPack(imported: Pack) {
    const { key, model } = imported.manifest;
    if (packs().some((pack) => pack.manifest.key === key)) {
      throw new Error(`Template key "${key}" is already loaded. Reload to reset imported packs.`);
    }
    if (packs().some((pack) => pack.manifest.model.id === model.id)) {
      throw new Error(
        'This pack reuses the model ID of another loaded pack. Use a unique model ID.',
      );
    }

    setPacks([...packs(), imported]);
    selectPack(key);
    clearResult();
  }

  async function openPack(file: File) {
    try {
      if (file.size > LIMITS.packBytes) throw new Error('Pack ZIP exceeds 2 MiB.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const imported = importPack(bytes);
      addPack(imported);
      setNotice(`Imported ${imported.manifest.name} for this session.`);
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  async function processBatch(generate: boolean) {
    const currentOperation = ++operation;
    clearResult();
    setStage('compiling');

    try {
      const result = await compileBatch(input(), packs(), !isFileInput());
      if (currentOperation !== operation) return;
      setCompilation(result);
      selectPack(result.payload.packKey);
      if (!generate) return;

      const output = await exporter.export(result.payload, setStage);
      if (currentOperation !== operation) return;
      const blob = new Blob([output.bytes], { type: 'application/octet-stream' });
      setDownload({
        url: URL.createObjectURL(blob),
        name: result.filename,
        size: output.bytes.byteLength,
        seconds: (output.elapsedMs / 1000).toFixed(1),
      });
    } catch (error) {
      if (currentOperation === operation) setError(errorMessage(error));
    } finally {
      if (currentOperation === operation) setStage('');
    }
  }

  function cancelExport() {
    // ignore any compilation/export completion that arrives after cancellation
    operation++;
    exporter.cancel();
    setStage('');
    setError('Export cancelled. Your TOML is still available; you can retry.');
  }

  onCleanup(() => {
    exporter.cancel();
    releaseDownload();
  });

  return (
    <>
      <main class="mx-auto max-w-6xl px-4 py-7 sm:px-8 sm:py-14">
        <div class="mb-9">
          <div class="flex items-start justify-between gap-4">
            <h1 class="mb-4 text-4xl font-medium tracking-[-0.055em] sm:text-5xl">
              <span class="text-primary">genanki</span>{' '}
              <span class="text-base-content dark:text-[#fffcf0]">web</span>
            </h1>
            <ThemePicker />
          </div>
          <p class="max-w-3xl text-base leading-relaxed text-base-content/80">
            Create Anki flashcards with ease! Have your LLM make the cards (e.g. auto translations & example sentences) in TOML, then use this to generate a consistent Anki deck{' '}
            <code class="rounded bg-base-300/60 px-1.5 py-0.5 text-primary">.apkg</code>
          </p>
        </div>
        <div class="grid items-start gap-7 md:grid-cols-[260px_minmax(0,1fr)] md:gap-x-10 md:gap-y-6 lg:gap-x-14">
          <TemplatePicker
            packs={packs()}
            selected={selectedPack()}
            busy={!!stage()}
            onSelect={selectPack}
            onCopy={copyPrompt}
            onImport={openPack}
          />
          <BatchEditor
            input={input()}
            stage={stage()}
            error={error()}
            compilation={compilation()}
            download={download()}
            onEdit={editInput}
            onOpen={openToml}
            onValidate={() => processBatch(false)}
            onGenerate={() => processBatch(true)}
            onCancel={cancelExport}
          />
          <Show when={notice()}>
            <p class="text-[15px] text-primary md:col-start-2" role="status">
              {notice()}
            </p>
          </Show>
          <Show when={promptFallback()}>
            <section class="min-w-0 md:col-start-2">
              <label class="mb-3" for="prompt">
                LLM instructions
              </label>
              <textarea
                id="prompt"
                class="textarea min-h-80 w-full bg-base-100 font-mono"
                readonly
                value={promptFallback()}
                onFocus={(event) => event.currentTarget.select()}
              />
            </section>
          </Show>
          <footer class="footer md:col-start-2 gap-5 border-t border-base-content/15 pt-6 text-[15px] leading-relaxed text-base-content/75">
            <aside class="max-w-4xl gap-2">
              <p>
                Import the downloaded package in Anki or AnkiDroid. Russian TTS requires AnkiDroid{' '}
                <code>2.17+</code> and a Russian voice.
              </p>
              <p>
                Stable IDs support updates; Anki import options and local edits affect reimports.
              </p>
            </aside>
            <aside>
              <p class="font-mono text-base-content/65" data-testid="build-info">
                build {__BUILD_INFO__.commit} · genanki {__BUILD_INFO__.genanki} ·{' '}
                {__BUILD_INFO__.timestamp}
              </p>
            </aside>
          </footer>
        </div>
      </main>
    </>
  );
}

export default App;
