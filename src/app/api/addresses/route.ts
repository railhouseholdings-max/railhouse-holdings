import { lookupAccessDenied } from "@/lib/cloud/api-access";
import { MAX_ADDRESS_QUERY_LENGTH, searchAddresses } from "../../../lib/addresses/search";

export async function GET(request: Request) {
  const denied = await lookupAccessDenied(); if (denied) return denied;
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const headers = { "Cache-Control": "no-store" };
  if (query.length > MAX_ADDRESS_QUERY_LENGTH) {
    return Response.json({ error: "Address search is too long." }, { status: 400, headers });
  }
  try {
    const suggestions = await searchAddresses(query, {
      endpoint: process.env.ADDRESS_SEARCH_URL,
      signal: request.signal,
    });
    return Response.json({ suggestions }, { headers });
  } catch {
    // Do not expose upstream URLs, credentials, or errors to the browser/logs.
    return Response.json({ error: "Address search is unavailable. You can still enter the full address manually." }, { status: 503, headers });
  }
}
