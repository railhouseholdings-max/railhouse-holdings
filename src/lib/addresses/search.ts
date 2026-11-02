import type { AddressSuggestion } from "../../domain/address.ts";

export const MIN_ADDRESS_QUERY_LENGTH = 4;
export const MAX_ADDRESS_QUERY_LENGTH = 240;
const DEFAULT_ENDPOINT = "https://photon.komoot.io/api/";

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Keep provider-specific fields outside both the form and the domain model.
export function parseAddressSuggestions(payload: unknown): AddressSuggestion[] {
  const features = record(payload).features;
  if (!Array.isArray(features)) throw new Error("Invalid address search response.");
  const seen = new Set<string>();
  return features.flatMap((feature): AddressSuggestion[] => {
    const properties = record(record(feature).properties);
    if (text(properties.countrycode).toUpperCase() !== "US") return [];
    const street = [text(properties.housenumber), text(properties.street)].filter(Boolean).join(" ");
    // Allow street-level results during typing, but never invent a house number.
    if (!street) return [];
    const city = text(properties.city) || text(properties.town) || text(properties.village) || text(properties.county);
    const state = text(properties.state);
    const postalCode = text(properties.postcode);
    const label = [street, city, [state, postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const normalized = label.toLowerCase();
    if (seen.has(normalized)) return [];
    seen.add(normalized);
    return [{ id: label, label, street, city, state, postalCode }];
  }).slice(0, 5);
}

export async function searchAddresses(query: string, options: {
  endpoint?: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<AddressSuggestion[]> {
  const cleaned = query.trim();
  if (cleaned.length < MIN_ADDRESS_QUERY_LENGTH) return [];
  if (cleaned.length > MAX_ADDRESS_QUERY_LENGTH) throw new RangeError("Address search is too long.");
  const url = new URL(options.endpoint || DEFAULT_ENDPOINT);
  url.searchParams.set("q", cleaned);
  url.searchParams.set("countrycode", "US");
  url.searchParams.set("lang", "en");
  url.searchParams.set("limit", "8");
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(6000)])
    : AbortSignal.timeout(6000);
  const response = await (options.fetcher ?? fetch)(url, {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Address search is temporarily unavailable.");
  return parseAddressSuggestions(await response.json());
}
