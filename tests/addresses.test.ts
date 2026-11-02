import test from "node:test";
import assert from "node:assert/strict";
import { parseAddressSuggestions, searchAddresses } from "../src/lib/addresses/search.ts";

const feature = (properties: Record<string, unknown>) => ({ type: "Feature", properties });
const address = { countrycode: "US", housenumber: "1600", street: "Pennsylvania Avenue Northwest", city: "Washington", state: "District of Columbia", postcode: "20500" };

test("normalizes actual address components and removes duplicates and non-US results", () => {
  const results = parseAddressSuggestions({ features: [feature(address), feature(address), feature({ ...address, countrycode: "CA" }), feature({ countrycode: "US", name: "Washington" }), null] });
  assert.equal(results.length, 1);
  assert.equal(results[0].label, "1600 Pennsylvania Avenue Northwest, Washington, District of Columbia 20500");
  assert.equal(results[0].postalCode, "20500");
});

test("street-level suggestions do not fabricate house numbers or ZIP codes", () => {
  const results = parseAddressSuggestions({ features: [feature({ countrycode: "us", street: "Main Street", town: "Example Town", state: "Virginia" })] });
  assert.equal(results[0].label, "Main Street, Example Town, Virginia");
  assert.equal(results[0].postalCode, "");
});

test("search limits results, ignores unrelated places, and rejects malformed responses", () => {
  const features = Array.from({ length: 8 }, (_, index) => feature({ ...address, housenumber: String(index) }));
  assert.equal(parseAddressSuggestions({ features }).length, 5);
  assert.deepEqual(parseAddressSuggestions({ features: [] }), []);
  assert.throws(() => parseAddressSuggestions({ error: "service failure" }));
});

test("short or oversized searches never call the provider", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json({ features: [] }); };
  assert.deepEqual(await searchAddresses("abc", { fetcher }), []);
  await assert.rejects(searchAddresses("a".repeat(241), { fetcher }), RangeError);
  assert.equal(calls, 0);
});

test("search safely encodes text, restricts US results, and disables caching", async () => {
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("q"), "1600 Pennsylvania & NW");
    assert.equal(url.searchParams.get("countrycode"), "US");
    assert.equal(url.searchParams.get("lang"), "en");
    assert.equal(init?.cache, "no-store");
    return Response.json({ features: [feature(address)] });
  };
  const results = await searchAddresses(" 1600 Pennsylvania & NW ", { fetcher });
  assert.equal(results.length, 1);
});

test("upstream errors and cancelled searches fail without pretending to have results", async () => {
  await assert.rejects(searchAddresses("1600 Pennsylvania", { fetcher: async () => new Response(null, { status: 429 }) }));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(searchAddresses("1600 Pennsylvania", {
    signal: controller.signal,
    fetcher: async (_url, init) => { init?.signal?.throwIfAborted(); return Response.json({ features: [] }); },
  }));
});
