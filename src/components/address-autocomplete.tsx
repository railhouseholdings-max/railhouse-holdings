"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { AddressSuggestion } from "@/domain/address";

const MIN_QUERY_LENGTH = 4;
type SearchState = { query: string; status: "loading" | "ready" | "error"; suggestions: AddressSuggestion[] };

export function AddressAutocomplete({ value, onChange, onCommit }: { value: string; onChange: (address: string) => void; onCommit?: (address: string) => void }) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const interactingWithSuggestions = useRef(false);
  const listId = `${id}-suggestions`;
  const [focused, setFocused] = useState(false);
  const [dismissedValue, setDismissedValue] = useState<string | null>(value);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [search, setSearch] = useState<SearchState | null>(null);
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      interactingWithSuggestions.current = Boolean(container.current?.querySelector('.address-dropdown')?.contains(target));
      if (!container.current?.contains(target)) {
        setFocused(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, []);
  const query = value.trim();
  const enabled = focused && query.length >= MIN_QUERY_LENGTH && dismissedValue !== value;
  const current = search?.query === query ? search : null;
  const suggestions = current?.suggestions ?? [];
  const expanded = enabled && current !== null;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearch({ query, status: "loading", suggestions: [] });
      try {
        const response = await fetch(`/api/addresses?q=${encodeURIComponent(query)}`, {
          signal: controller.signal, cache: "no-store",
        });
        if (!response.ok) throw new Error("Search unavailable");
        const data = await response.json() as { suggestions: AddressSuggestion[] };
        if (!Array.isArray(data.suggestions)) throw new Error("Invalid search result");
        if (!controller.signal.aborted) setSearch({ query, status: "ready", suggestions: data.suggestions });
      } catch {
        if (!controller.signal.aborted) setSearch({ query, status: "error", suggestions: [] });
      }
    }, 500);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, enabled]);

  const select = (suggestion: AddressSuggestion) => {
    setDismissedValue(suggestion.label);
    setActiveIndex(-1);
    onChange(suggestion.label);
    onCommit?.(suggestion.label);
  };
  const status = !expanded ? "" : current?.status === "loading" ? "Searching addresses…"
    : current?.status === "error" ? "Address search is unavailable. Enter the full address manually."
    : suggestions.length === 0 ? "No matching addresses. Add a city or ZIP, or enter the address manually."
    : `${suggestions.length} suggestions available. Use the arrow keys and Enter to choose.`;

  return <div ref={container} className="field full address-field address-autocomplete" onBlur={event => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    if (!event.relatedTarget && interactingWithSuggestions.current) return;
    setFocused(false); setActiveIndex(-1); onCommit?.(value);
  }}>
    <label htmlFor={id}>Property address <small>(for tax lookup)</small></label>
    <input id={id} value={value} role="combobox" aria-autocomplete="list"
      aria-expanded={expanded && suggestions.length > 0} aria-controls={expanded && suggestions.length > 0 ? listId : undefined}
      aria-activedescendant={expanded && activeIndex >= 0 && suggestions[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
      aria-describedby={`${id}-hint`} autoComplete="off" spellCheck={false} maxLength={240}
      placeholder="Start typing a street address…"
      onFocus={() => setFocused(true)}
      onChange={event => { setDismissedValue(null); setActiveIndex(-1); onChange(event.target.value); }}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); setDismissedValue(value); setActiveIndex(-1); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          if (!expanded) { setDismissedValue(null); return; }
          if (suggestions.length > 0) setActiveIndex(previous => event.key === "ArrowDown"
            ? (previous + 1) % suggestions.length
            : previous <= 0 ? suggestions.length - 1 : previous - 1);
        }
        if (event.key === "Enter" && enabled) {
          event.preventDefault();
          if (activeIndex >= 0 && suggestions[activeIndex]) select(suggestions[activeIndex]);
        }
      }} />
    {expanded && <div className="address-dropdown">
      {suggestions.length > 0 ? <ul id={listId} role="listbox" aria-label="Suggested property addresses">
        {suggestions.map((suggestion, index) => <li id={`${id}-option-${index}`} key={suggestion.id}
          role="option" aria-selected={index === activeIndex} className={index === activeIndex ? "highlighted" : ""}
          onPointerDown={event => { if (event.pointerType === "mouse") event.preventDefault(); }}>
          <button type="button" tabIndex={-1} onClick={() => select(suggestion)}>
          <strong>{suggestion.street}</strong><span>{[suggestion.city, suggestion.state, suggestion.postalCode].filter(Boolean).join(", ")}</span>
          </button>
        </li>)}
      </ul> : <p className="address-message">{status}</p>}
      <div className="address-attribution">Search by <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></div>
    </div>}
    <small id={`${id}-hint`} className="field-hint">Type at least 4 characters. Include a city or ZIP for better matches. You can always enter an address manually.</small>
    <span className="sr-only" role="status" aria-live="polite">{status}</span>
  </div>;
}
