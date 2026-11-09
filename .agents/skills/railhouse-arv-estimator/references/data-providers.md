# Providers and evidence

The inspected app already uses server-side RentCast, Photon address suggestions, Allen County tax/snapshot records, Supabase and Next.js routes. It has no ATTOM, RealAI, MLS, Zillow or Realtor application API integration. ChatGPT plugin access does not grant application credentials.

Extend the existing `/api/property-lookup` route; do not build a second property lookup service. GET remains property/rent enrichment; POST operation `estimate-arv` accepts supplied records or explicit live discovery. Share `rentCastRequest` with existing RentCast lookup. Live sales discovery uses documented `GET /v1/properties` with coordinates, radius, propertyType, saleDateRange, limit and offset. `lastSalePrice` and `lastSaleDate` are recorded-sale evidence; rental/sale listing prices and AVM comparable asking prices are not closed transactions.

Documentation reviewed: https://developers.rentcast.io/reference/property-records and https://developers.rentcast.io/reference/property-data-schema. The listing documentation distinguishes listed prices from completed sale evidence: https://developers.rentcast.io/reference/property-listings. No value AVM is substituted for sales comparison.

Local `RENTCAST_API_KEY` was absent during implementation. Provider normalization, errors and staged discovery are tested with mock responses; live account permissions/coverage remain unverified. The user's production Vercel key must be available server-side. No new API subscription is necessary to run offline supplied records.

Allen County's assessor links COMPS at https://acimap.us/viewers/comps/ and property record cards: https://www.allencounty.in.gov/164/Assessor. No approved production API was established. Obtain permitted sales exports and import the documented CSV; do not scrape the viewer or reverse-engineer its private requests. ATTOM is optional (https://api.developer.attomdata.com/docs) and not implemented because credentials and a need beyond existing sources were not established.

Live request budget is six actual calls including retries, 45-second orchestration deadline and 15-second request timeout; retry transient failures once with bounded backoff and no long Retry-After wait. Only redacted request count/status is logged. Instance result caching is disabled unless `RENTCAST_ARV_CACHE_SECONDS` is explicitly set after confirming retention terms; maximum one hour/50 results. Offline math uses an explicit valuation date; live date filtering is relative to today and cannot reconstruct a historical search. Provider failures never mean no sales exist.
