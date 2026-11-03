"use client";

import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";

export type DropdownOption = { value: string; label: ReactNode; text: string; highlighted?: boolean };
export type DropdownProps = Omit<ComponentProps<"button">, "onChange" | "children" | "value"> & {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
};

export function Dropdown({ value, options, onChange, className = "", ref, ...props }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const container = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const search = useRef({ text: "", time: 0 });
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[Math.max(0, options.findIndex((option) => option.value === value))]?.focus();
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open, options, value]);

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    button.current?.focus();
  };

  return <span ref={container} className="relative block min-w-0"
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
    <button {...props} ref={(element) => {
      button.current = element;
      if (typeof ref === "function") ref(element);
      else if (ref) ref.current = element;
    }} type="button" value={value} role="combobox" aria-haspopup="listbox"
      aria-expanded={open} aria-controls={listId}
      className={`flex w-full items-center justify-between gap-2 text-left ${className}`}
      onClick={() => setOpen((current) => !current)}
      onKeyDown={(event) => {
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          setOpen(true);
        } else if (event.key === "Escape") setOpen(false);
      }}>
      <span className="flex min-w-0 items-center gap-2">{selected?.label}</span>
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor"
        className={`size-4 shrink-0 text-stone-500 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}>
        <path fillRule="evenodd" d="M5.22 7.47a.75.75 0 0 1 1.06 0L10 11.19l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
      </svg>
    </button>
    <ul id={listId} hidden={!open} role="listbox" aria-label={props["aria-label"]}
      className="absolute right-0 z-40 mt-1 max-h-64 min-w-full overflow-y-auto rounded-lg border border-stone-200 bg-white p-1 text-sm shadow-lg"
      onKeyDown={(event) => {
        const index = optionRefs.current.findIndex((option) => option === document.activeElement);
        const move = (next: number) => optionRefs.current[(next + options.length) % options.length]?.focus();
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          move(index + (event.key === "ArrowDown" ? 1 : -1));
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          move(event.key === "Home" ? 0 : options.length - 1);
        } else if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
          button.current?.focus();
        } else if (event.key === "Tab") setOpen(false);
        else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey && event.key !== " ") {
          event.preventDefault();
          const now = Date.now();
          const text = (now - search.current.time < 700 ? search.current.text : "") + event.key.toLocaleLowerCase();
          search.current = { text, time: now };
          const match = options.findIndex((option) => option.text.toLocaleLowerCase().startsWith(text));
          if (match >= 0) move(match);
        }
      }}>
      {options.map((option, index) => <li key={option.value} role="none">
        <button ref={(element) => { optionRefs.current[index] = element; }} type="button" role="option"
          aria-selected={option.value === value} tabIndex={-1}
          onClick={() => choose(option.value)}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left whitespace-nowrap focus-visible:outline-none ${
            option.highlighted
              ? "mt-1 border-t border-amber-200 bg-amber-50 font-semibold text-amber-900 hover:bg-amber-100 focus-visible:bg-amber-100"
              : `hover:bg-stone-100 focus-visible:bg-stone-100 ${option.value === value ? "font-semibold text-stone-900" : "text-stone-700"}`
          }`}>
          {option.label}
        </button>
      </li>)}
    </ul>
  </span>;
}
