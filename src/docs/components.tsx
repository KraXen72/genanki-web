import { createSignal, type JSX } from 'solid-js';
import { starterZip } from './starter';

/** Keeps a guide section and its heading linked to the sidebar anchor. */
export function Section(props: { id: string; title: string; children: JSX.Element }) {
  return (
    <section id={props.id} aria-labelledby={`${props.id}-title`}>
      <h2 id={`${props.id}-title`}>
        <a href={`#${props.id}`}>{props.title}</a>
      </h2>
      {props.children}
    </section>
  );
}

/** Displays source text with clipboard copying and a manual selection fallback. */
export function Code(props: { name: string; children: string }) {
  const [status, setStatus] = createSignal('');
  let code!: HTMLElement;

  async function copy() {
    try {
      await navigator.clipboard.writeText(props.children);
      setStatus('Copied');
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      setStatus('Select and copy the code');
    }
  }

  return (
    <figure class="docs-code">
      <figcaption>
        <span class="min-w-0 break-words font-mono text-sm">{props.name}</span>
        <button
          class="btn btn-ghost btn-sm shrink-0"
          onClick={copy}
          aria-label={`Copy ${props.name}`}
        >
          <span class="iconify lucide--copy size-4" aria-hidden="true" />
          Copy
        </button>
      </figcaption>
      <pre tabIndex={0} aria-label={props.name}>
        <code ref={code}>{props.children.trimEnd()}</code>
      </pre>
      <span class="sr-only" role="status">
        {status()}
      </span>
    </figure>
  );
}

/** Gives a Markdown table a named, keyboard-scrollable region. */
export function Table(props: { label: string; children: JSX.Element }) {
  return (
    <div class="docs-table" tabIndex={0} role="region" aria-label={props.label}>
      {props.children}
    </div>
  );
}

/** Downloads the starter ZIP assembled from the guide's example files. */
export function DownloadStarter() {
  const [error, setError] = createSignal('');

  function download() {
    try {
      const url = URL.createObjectURL(new Blob([starterZip()], { type: 'application/zip' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'vocabulary-starter.zip';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      // allow the browser to begin reading the download before releasing its URL
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError('');
    } catch {
      setError('Could not download the starter. Copy the files below instead.');
    }
  }

  return (
    <>
      <button class="btn btn-primary my-4" onClick={download}>
        <span class="iconify lucide--download size-5" aria-hidden="true" />
        Download starter ZIP
      </button>
      <p role="status" class="text-error">
        {error()}
      </p>
    </>
  );
}
