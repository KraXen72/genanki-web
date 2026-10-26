import { type JSX } from 'solid-js';

interface FileButtonProps {
  label: string;
  accept: string;
  icon: string;
  compact?: boolean;
  disabled?: boolean;
  class?: string;
  onSelect: (file: File) => void;
}

/** Accessible file picker styled as a DaisyUI button; the same file can be selected repeatedly. */
export function FileButton(props: FileButtonProps) {
  const selectFile: JSX.EventHandler<HTMLInputElement, Event> = (event) => {
    const file = event.currentTarget.files?.[0];
    if (file) props.onSelect(file);
    event.currentTarget.value = '';
  };

  return (
    <label
      class={`btn justify-start rounded-md text-[17px] font-bold shadow-none ${props.class ?? 'btn-outline border-base-content/25 bg-base-100'}`}
      classList={{ 'btn-disabled': props.disabled }}
      title={props.compact ? props.label : undefined}
    >
      <span class={`iconify ${props.icon} size-5 shrink-0`} aria-hidden="true" />
      <span classList={{ 'sr-only md:not-sr-only': props.compact }}>{props.label}</span>
      <input
        class="sr-only"
        type="file"
        aria-label={props.label}
        accept={props.accept}
        disabled={props.disabled}
        onChange={selectFile}
      />
    </label>
  );
}
