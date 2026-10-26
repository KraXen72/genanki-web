import { For } from 'solid-js';
import { setThemePreference, themePreference, type ThemePreference } from '../theme';

const choices = [
  { value: 'system', label: 'System theme', icon: 'lucide--monitor' },
  { value: 'light', label: 'Light theme', icon: 'lucide--sun' },
  { value: 'dark', label: 'Dark theme', icon: 'lucide--moon' },
] satisfies { value: ThemePreference; label: string; icon: string }[];

/** Compact, keyboard-accessible appearance controls, including a return to the system setting. */
export function ThemePicker() {
  return (
    <div
      class="join shrink-0 rounded-none border border-base-content/15 bg-base-100"
      role="group"
      aria-label="Appearance"
    >
      <For each={choices}>
        {(choice) => (
          <button
            class="btn btn-square btn-ghost join-item h-11 min-h-11 w-11 shrink-0 justify-center rounded-none border-0 p-0"
            classList={{ 'bg-primary/15 text-primary': themePreference() === choice.value }}
            aria-label={choice.label}
            aria-pressed={themePreference() === choice.value}
            title={choice.label}
            onClick={() => setThemePreference(choice.value)}
          >
            <span class={`iconify ${choice.icon} size-5`} aria-hidden="true" />
          </button>
        )}
      </For>
    </div>
  );
}
