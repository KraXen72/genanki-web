import { For } from 'solid-js';
import { ThemePicker } from '../components/ThemePicker';
import TemplateGuide from './template-guide.mdx';

const sections = [
  ['quick-start', 'Quick start'],
  ['manifest', 'Template settings'],
  ['schema', 'Input schema'],
  ['fields', 'Field mappings'],
  ['cards', 'Cards & styling'],
  ['prompt', 'LLM instructions'],
  ['identity', 'IDs & versions'],
  ['limits', 'Limits'],
];

/** One-page authoring guide for the supported v1 pack contract. */
export function TemplateDocs() {
  return (
    <>
      <a class="docs-skip" href="#quick-start">
        Skip to documentation
      </a>
      <main class="mx-auto max-w-6xl px-4 py-7 sm:px-8 sm:py-14">
        <header class="mb-10">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <a
              class="text-2xl font-medium tracking-[-0.055em] sm:text-3xl"
              href={import.meta.env.BASE_URL}
            >
              <span class="text-primary">genanki</span> web
            </a>
            <ThemePicker />
          </div>
          <p class="mt-8 font-mono text-sm text-primary">Template pack format v1</p>
          <h1 class="mt-3 text-4xl font-medium tracking-tight sm:text-5xl">
            Make your own template
          </h1>
          <p class="mt-4 max-w-2xl text-base leading-relaxed text-base-content/80">
            A template pack tells the LLM what to write and Anki how to show it. Start with the
            example below.
          </p>
        </header>
        <div class="grid items-start gap-9 md:grid-cols-[180px_minmax(0,1fr)] md:gap-12">
          <nav class="md:sticky md:top-6" aria-label="On this page">
            <p class="mb-3 text-sm font-medium text-base-content/65">On this page</p>
            <ul class="flex flex-wrap gap-x-5 gap-y-2 md:flex-col">
              <For each={sections}>
                {([id, title]) => (
                  <li>
                    <a class="link link-hover text-sm" href={`#${id}`}>
                      {title}
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </nav>
          <article class="docs-content min-w-0">
            <TemplateGuide />
            <footer class="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-base-content/15 pt-6 text-sm text-base-content/65">
              <a
                class="btn btn-outline border-base-content/20 bg-base-100 text-base-content"
                href={import.meta.env.BASE_URL}
              >
                <span class="iconify lucide--arrow-left size-4" aria-hidden="true" />
                Back to generator
              </a>
              <span class="font-mono">format v1 · build {__BUILD_INFO__.commit}</span>
            </footer>
          </article>
        </div>
      </main>
    </>
  );
}
