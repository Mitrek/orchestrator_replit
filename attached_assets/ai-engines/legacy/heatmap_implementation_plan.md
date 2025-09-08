Master Plan — Reliable Heatmap Feature (Modular, Testable)
Phase 0 — Grounding & Guardrails

Objective: Put the project in a known-good, reproducible state.

Tasks:

Start from the working preview baseline (your (9) state).

Set environment variables (OpenAI key) and a single “feature flag” to toggle the heatmap feature on/off.

Decide on one canvas library (@napi-rs/canvas) and one browser strategy (puppeteer) and document this choice.

Create a “/health” route that reports version, feature flags, and environment readiness (e.g., “OPENAI set: yes/no”).

DoD:

Health route returns 200 with JSON including feature flags and “ready: true/false”.

Toggling the feature flag changes the health payload accordingly.

Phase 1 — Server Skeleton (No Puppeteer, No Canvas, No OpenAI)

Objective: Stable API surface before any heavy dependencies.

Tasks:

Define two routes: /api/v1/heatmap (AI-assisted) and /api/v1/heatmap/data (data-driven).

Validate inputs and return stubbed JSON (no processing yet).

Add rate limiting and request timeouts.

DoD:

Routes return 200 with stubbed payloads and robust 4xx for bad inputs.

Logs show structured entries for every request.

Phase 2 — Filesystem & Public Assets

Objective: Ensure deterministic file paths and static serving.

Tasks:

Create a single directory for outputs (e.g., public/heatmaps).

Ensure it’s created on startup and is exposed by a static route.

Define a file-naming convention (timestamp + hash).

DoD:

A test file placed there is publicly readable at /heatmaps/<filename>.

Phase 3 — Screenshot Service (Puppeteer Only)

Objective: Produce a clean screenshot deterministically.

Tasks:

Implement a small service that launches puppeteer with safe flags, sets viewport by device (desktop/tablet/mobile), navigates, and screenshots.

Strip noisy overlays (e.g., cookie banners if possible) with a short DOM script (optional for now).

Add explicit timeouts and targeted error messages (navigation timeout vs. launch failure).

DoD:

Calling the internal screenshot function returns a valid image buffer in < N seconds for at least 3 known URLs.

Errors are categorized and logged clearly.

Phase 4 — Minimal Renderer (Canvas Only, No Heatmap Yet)

Objective: Prove we can composite something on top of the screenshot.

Tasks:

Load the screenshot and draw a simple transparent overlay rectangle at a fixed position.

Export the composited image to public/heatmaps.

DoD:

Output file exists and visually shows the overlay.

Route returns the URL or base64 of that exact file.

Phase 5 — Data-Driven Heatmap (Clicks/Movements → Overlay)

Objective: Turn normalized points into a heat overlay (no AI).

Tasks:

Define a minimal input schema for dataPoints[] with normalized 0..1 coordinates.

Convert normalized coordinates to pixel space for the current viewport.

Render a heat layer (kernel density / Gaussian blur) and composite onto the screenshot.

Add basic color ramp and alpha controls.

DoD:

Given a set of 10–100 test points, output shows visible hot regions where expected.

Edge cases handled: coordinates near borders, empty arrays, malformed points.

Phase 6 — Return Modes & API Contract Finalization

Objective: Make the return path predictable and developer-friendly.

Tasks:

Support returnMode: "base64" | "url" consistently in both endpoints.

Ensure consistent response shape ({ meta, url? , base64? }).

Document input parameters with defaults (device, opacity, radius, etc.).

DoD:

Both endpoints return identical envelope shapes; switching returnMode flips output type only.

Phase 7 — AI-Assisted Hotspot Detection (Without Canvas)

Objective: Isolate the AI call and format only.

Tasks:

Capture a DOM summary (titles, hero sections, headings, prominent CTAs) or simple cropped thumbnails.

Call OpenAI to get a JSON list of proposed hotspots (normalized coordinates, confidence).

Validate and sanitize the AI output (schema, ranges, count limits).

DoD:

Endpoint returns clean JSON hotspots for 2–3 test URLs, with no image rendering yet.

Fallback path in case AI fails returns a deterministic empty hotspot list (or a trivial rule-based guess).

Phase 8 — AI-Assisted Overlay (Canvas + AI)

Objective: Combine the AI hotspots with the renderer built in Phase 5.

Tasks:

Translate AI hotspots into the same internal “points” structure used by data-driven renderer.

Apply scaling by device viewport.

Composite onto screenshot with the existing renderer pipeline.

DoD:

Given AI hotspots, output image shows overlays at plausible, stable positions.

If AI fails, fallback image still renders (screenshot only, or rule-based heat).

Phase 9 — Client Harness (Thin UI to Trigger Calls)

Objective: Basic UI to exercise endpoints without deep integration.

Tasks:

Add a developer page with two forms: “Generate AI Heatmap” and “Generate Data Heatmap”.

Display metadata and the resulting image (if any).

Show request/response JSON for debugging.

DoD:

You can test all permutations (device, returnMode) and visually verify outcomes in the browser.

Phase 10 — Observability & Resilience

Objective: Capture enough context to debug issues and avoid regressions.

Tasks:

Structured logging (start/end, timings, error types, URL, device, counts).

Feature flag to disable AI quickly and switch to deterministic fallback.

Simple metrics (counters for success/failure/timeouts).

DoD:

Log lines are readable, JSON formatted, and differentiate between navigation vs. rendering vs. AI errors.

You can flip the feature flag and observe behavior change immediately.

Phase 11 — Performance & Limits

Objective: Reasonable throughput and predictable latency.

Tasks:

Constrain simultaneous Puppeteer instances and queue requests.

Cap AI hotspots count and image dimensions for speed.

Cache screenshots briefly for repeat URLs within a short time window (optional).

DoD:

Under a small burst (e.g., 5 rapid calls), system remains responsive and within memory/CPU limits.

No unbounded growth of temp files; output directory size is controlled.

Phase 12 — API Hardening & Input Hygiene

Objective: Avoid bad inputs from taking down the service.

Tasks:

Strict schema validation for URLs, device, returnMode, and dataPoints.

Sanitize any text used in prompts.

Enforce max request size and deny oversized data payloads.

DoD:

Invalid inputs return 4xx with human-readable messages; server stays healthy.

Phase 13 — Documentation & Playbooks

Objective: Make this operable by anyone (including “future you”).

Tasks:

One-page README: feature flags, env vars, routes, inputs/outputs, test checklist.

“Runbook” for common failures (Puppeteer launch fail, AI timeout, canvas import error).

Version the API contract and note breaking changes.

DoD:

A new contributor can bring the service up and generate a heatmap within minutes using the README.

Phase 14 — Integration Back into the App (Minimal)

Objective: Wire into your actual UI safely.

Tasks:

Replace the developer harness with a thin UX surface (button, loading state, result).

Show a small thumbnail and a “View full” link to the static file (when using URL mode).

Do not block the main UX on AI; show progress and allow cancel.

DoD:

From the real app, you can generate and view a heatmap without jank or page lock-ups.

Phase 15 — Stretch (Optional Enhancements)

Objective: Future-proofing once the basics are rock-solid.

Ideas:

Multi-viewport batch generation (desktop/tablet/mobile in one request).

Masking non-visible areas (scroll fold) based on known above-the-fold height.

Session-based blending for multiple data uploads (rolling heatmaps).

Export settings presets.

Testing Cadence (How you’ll know you’re on track)

After each phase, confirm the DoD with a short checklist and capture a screenshot of the result (or JSON output).

Keep the feature flag off in production-like environments until Phase 11 completes.

If a phase fails its DoD, fix it before moving on—no stacking broken layers.

Common Pitfalls We’re Avoiding

Mixing canvas and @napi-rs/canvas.

Letting OpenAI schema drift break rendering (we validate AI output first).

Overloading Puppeteer (we’ll queue and cap).

Returning different payload shapes from each route.

UI integration before the service is testable via the developer harness.

If this works for you, copy it into your project as “MasterPlan.md”. Then paste back Phase 1 (or any phase you want to start with), and I’ll break it down into tiny sub-steps with exact acceptance checks.