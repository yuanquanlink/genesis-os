# Genesis OS Phase 2 Research Engine

## Status

The Tavily Research Provider and Research Engine are implemented as an additive, server-only layer. Implementation review and real connectivity verification are complete; the Phase 2 closing checkpoint is ready. Phase 3 has not started.

## Architecture

`POST /api/research` and `POST /api/research/search` validate a command, call `ResearchEngine`, and route through the `ResearchProvider` interface to `TavilyProvider`. `GET /api/research` and `GET /api/research/history` are read-only snapshots. `research_runs` stores operation/provider/status metadata and `research_sources` stores normalized source provenance.

## Safety boundary

Tavily responses are untrusted reference material. They are never automatically promoted to Knowledge, Memory, Evidence, Ability, Mastery or Mission data. Downstream consumers receive `reference_only` packets and must use their existing validation and user-approval flows. Missing configuration, timeout, rate-limit, authentication and malformed responses are returned as explicit errors and persisted as failed runs without fabricated sources.

## Configuration

Set `TAVILY_API_KEY` server-side (never commit a real key). Optional `TAVILY_BASE_URL`, `RESEARCH_REQUEST_TIMEOUT_MS`, `RESEARCH_MAX_RETRIES`, `RESEARCH_POLL_INTERVAL_MS`, `RESEARCH_MAX_POLLS` and `TAVILY_RESEARCH_MODEL` tune the adapter. Asynchronous Research defaults to Tavily `mini` with bounded polling; `pro` remains an explicit configuration choice for deeper, slower jobs. When the key is missing, the server emits one redacted startup warning and remains usable; research requests return `not_configured`. Unit and integration tests inject a fetch/provider and do not contact Tavily.

## Supported operations

`search(query)`, `extract(url)`, `crawl(url)` and asynchronous `research(topic)` are normalized to title, URL, source type, summary, relevance score, provider and timestamp. The research operation polls a Tavily request ID within a bounded limit.

## Real connectivity verification

On 2026-08-10, the owner-provided server-side configuration was verified through the local API without reading, logging or returning the key. Tavily reported configured and all four real operations completed: Search returned 5 sources, Extract returned 1 source, Crawl returned 3 sources, and Research `mini` returned a report with 6 traceable sources. The first `pro` verification attempts exceeded the bounded polling window and were honestly persisted as failed/timeout runs with zero fabricated sources; this led to configurable polling and a lower-latency `mini` default. All successful packets remained `reference_only` and no formal Genesis data was modified.
