# Knowledge Engine, Gnani Panel & Serious Mode

Upgrade the existing app in place. Nothing working today is removed: the voice flow, the BM25 + concept retrieval, the deterministic query understanding, the diagram layer, the four routes and the current visual design all stay. Everything below is added around them.

## What exists today (verified in the code)

- `src/lib/knowledge/corpus.ts` — 18 hand-written lecture chunks, loaded into memory at startup.
- `src/lib/rag/index.server.ts` — builds term-frequency, document-frequency and neighbour links once per server.
- `src/lib/rag/retriever.server.ts` — BM25 + concept overlap, reciprocal-rank fusion, filter cascade, prerequisite expansion, 5-minute cache.
- `src/lib/rag/query.server.ts` — rule-based subject/chapter/intent/language/difficulty detection, no model call.
- `src/lib/tutor.functions.ts` — answer generation; `src/lib/ai-gateway.server.ts` — chat, transcription; `src/routes/api/tts.ts` — speech.
- Backend is connected but currently holds only `profiles`; the knowledge base is not in it yet.

## Phase 1 — Knowledge database

New tables, with access rules so only signed-in staff can edit and everyone can read approved material:

- `sources` — publisher, URL, type, licence/access status, crawl status, last crawled, checksum, document count.
- `documents` — title, source, class, subject, chapter, board, exam, language, processed text reference, metadata.
- `knowledge_chunks` — content, all the metadata fields you listed (subject → chapter → topic → subtopic → concept, difficulty, prerequisites, keywords, formulas, examples, learning objective, page/section, confidence, approval status, content hash, parent document, embedding, embedding version, timestamps).
- `concepts` + `concept_edges` — concept, aliases, Hindi and Hinglish terms, and prerequisite / related / belongs-to-chapter relationships.
- `ingestion_jobs` — queued, running, completed, failed, retry count, error, timings.
- `knowledge_edits` — an audit trail of every manual correction.

Vector search is enabled on the chunk table so similarity search happens in the database, not in memory.

## Phase 2 — Migrate the existing corpus

A one-time import server function copies the 18 existing chunks into the new tables with `source_name: "Seed corpus"` and their real provenance. `corpus.ts` stays on disk as fallback: if the database is empty or unreachable, retrieval silently uses it, so the app never breaks mid-migration.

## Phase 3 — Ingestion pipeline

A modular pipeline, each stage its own small server module so stages can be replaced independently:

```text
source -> fetch (robots.txt + rate limit + access check)
       -> extract -> strip boilerplate -> normalise -> detect language
       -> detect chapters/sections -> extract concepts, definitions, formulas
       -> enrich metadata -> semantic chunking -> embed
       -> quality check -> dedupe by content hash -> store
```

Rules honoured: robots.txt and rate limits are checked before any fetch and a refusal is recorded on the job, not bypassed. For copyrighted material only metadata, structure and short permissible excerpts are stored, flagged as `excerpt_only`, with the source URL and ingestion timestamp always retained. Jobs run in the background through the queue table, never inside a student's request.

Inputs supported: permitted public educational pages, pasted or uploaded documents and PDFs, structured JSON datasets, lecture transcripts.

No fabricated records. The curriculum coverage (Classes 6–12, all subjects) is built by registering real sources and running ingestion against them — the catalogue of sources ships empty of fake rows, and every chunk in the database traces to something actually ingested or manually authored and approved by you.

## Phase 4 — Embeddings

An embedding layer with the provider chosen by configuration, defaulting to the built-in AI gateway. Vectors are produced in batches during ingestion only, never per question. Each row stores its embedding version, so switching model re-embeds progressively instead of corrupting the index.

## Phase 5 — Hybrid retrieval upgrade

The current BM25 and concept channels are kept and joined by three more: database vector similarity, concept-graph lookup (aliases, Hindi/Hinglish terms), and prerequisite-graph expansion. Weighted fusion plus a rerank pass, then a small high-quality evidence set — fewer results, not a bigger top-k. Metadata awareness (class, board, exam, chapter) and conversation context feed the filter cascade that already exists. Nothing is loaded wholesale into memory; queries are indexed and paginated, with caching for repeat questions.

## Phase 6 — Knowledge editor

A new admin area, reachable only when signed in:

- Sources list — add a source, view crawl status, trigger ingestion, watch job progress.
- Document and chunk browser — full-text search, filter by class/subject/chapter/status, paginated.
- Chunk editor — edit content and every metadata field, approve, reject, delete, re-index, re-embed.
- Provenance view — where any piece of knowledge came from.

You never edit `corpus.ts` to add knowledge again.

## Phase 7 — Source transparency in answers

The answer panel gains a clear grounding state — grounded, partially grounded, or general knowledge, never blurred — and an elegant source block:

```text
Knowledge source   NCERT Class 11 Physics · Laws of Motion · Newton's Second Law
Additional context Concept graph · prerequisite: force and acceleration
```

## Phase 8 — Gnani indicator

A premium indicator in the top-right of the learning screen reading **GNANI / Voice Intelligence**, with a soft animated glow reflecting the real pipeline state already tracked by the voice session: listening, understanding, retrieving, thinking, speaking. Clicking opens a compact panel showing the live run — transcription, detected language, detected subject/class, number of knowledge sources retrieved, grounding result, response generated, voice out. Real values from the pipeline only; no keys or secrets ever reach the browser.

## Phase 9 — Serious Mode

A glowing, restrained button beside the Gnani indicator.

- First activation shows a plain-language permission note: the camera is used only to estimate basic study-attention signals, frames are never stored, and this is not facial recognition or identity verification. Allow / Cancel.
- A small floating camera panel, draggable anywhere, resizable, always above the page, with minimise, stop camera and exit controls. It stays alive across UI state changes and only closes when you exit; exiting releases the camera track.
- Attention estimation runs in the browser using the built-in face detection where available, with a lightweight fallback: face present/absent, rough gaze toward screen, prolonged eyes-closed, sustained head-turn. Frames stay on the device, are never uploaded or stored, and no profile is built.
- Temporal smoothing and confidence thresholds — a single bad frame never triggers anything. Thresholds and sensitivity (low/medium/high), voice reminders, camera and auto-intervention are all user settings.
- On sustained distraction, Gnani gives one short supportive nudge that names the current topic ("Let's bring the focus back — we're at the Electric Potential derivation"), then a 30–90 second cooldown. Learner's name used only if onboarding captured one. No shaming language.

## Phase 10 — Session summary and observability

On exiting Serious Mode, an honest summary: study duration, number of focus reminders, longest uninterrupted stretch, topics covered — described as "focus signals", never a fabricated score. Internal metrics recorded for ingestion duration, documents and chunks produced, duplicates, embedding failures, retrieval latency and hit count, grounding score, model/transcription/speech latency, Gnani state transitions, and focus session stats. No camera frames and no unnecessary personal data are ever logged.

## Verification before finishing

Voice in, transcription, answer, speech out; existing retrieval and the new database retrieval; source attribution; ingestion trigger and job status; knowledge editing; embedding generation; Gnani states matching real pipeline activity; camera permission, dragging, release on exit, alert cooldown; no secrets in client code; build and type check clean.

## Sequencing

This is large. I will deliver it in the phase order above, keeping the app working after every phase, and report progress as each lands.
