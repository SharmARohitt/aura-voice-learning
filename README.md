# Voice Bingo — Aura-PW

**Voice is the interface. Learning intelligence is the product.**

Voice Bingo is a voice-first AI classroom for Bharat. A student asks a doubt out loud — in English, Hindi or natural Hinglish — and the system transcribes it in realtime, retrieves the exact lecture moment that answers it, reasons over that grounded evidence, detects the underlying misconception, generates graded practice, and speaks the answer back.

---

## Highlights

| Capability | What it does |
| --- | --- |
| Realtime voice pipeline | Streaming speech-to-text → intent → hybrid retrieval → LLM reasoning → streaming text-to-speech, with barge-in support |
| Source-grounded answers | Every course answer cites lecture, teacher, timestamp and relevance; ungrounded answers are labelled general knowledge, never blurred |
| Misconception engine | Infers the likely wrong mental model, its prerequisite root and a repair intervention |
| Learning intelligence | Confusion graph, weak-concept tracking, mastery context, teacher console |
| Practice generation | Three graded levels — easy, similar, transfer — with explanations |
| Personalised onboarding | Class, exam goal, subjects and language preference drive retrieval and teaching style |
| Multilingual | English, Hindi, Hinglish and adaptive language matching |
| Observability | Per-stage latency (intent, retrieval, rerank, LLM, total), pipeline event stream, graceful failure and escalation paths |

---

## Product surfaces

| Route | Purpose |
| --- | --- |
| `/` | Classroom cockpit — mic, transcript, teacher avatar, grounded answer, practice, diagnostics |
| `/learning` | Searchable index of every approved lecture moment by subject, chapter and concept |
| `/practice` | Live-generated graded practice arena with session accuracy |
| `/confusion-graph` | Concept ↔ prerequisite map with per-node risk and one-click repair |
| `/teacher` | Batch console: confusion hotspots, coverage, escalated doubts |

---

## Architecture

```text
 Mic ──► STT provider ──► partial + final transcript
                              │
                              ▼
                    askTutor (server function)
                              │
        ┌─────────────────────┼───────────────────────┐
        ▼                     ▼                       ▼
  intent + language     hybrid retrieval          learner context
                        (BM25 + concept,          (class, goal,
                         RRF fusion, rerank,       subjects, language,
                         prerequisite level)       weak concepts)
                              │
                    grounding threshold 0.45
                              │
                              ▼
                  LLM reasoning (strict JSON)
                              │
        ┌─────────────┬───────┴────────┬──────────────┐
        ▼             ▼                ▼              ▼
   explanation   misconception     practice x3     evidence
                              │
                              ▼
                    TTS provider ──► audio out
```

### Layers

- `src/lib/knowledge/corpus.ts` — approved knowledge repository, shaped exactly like the ingestion pipeline output (parse → clean → chapter detection → concept extraction → chunking → metadata enrichment). Adding knowledge means adding records, never touching application code.
- `src/lib/rag/retriever.server.ts` — metadata-filtered hybrid retrieval: lexical BM25-style scoring, concept scoring, reciprocal-rank fusion, reranking, multi-level results (direct / concept / prerequisite / example), widening cascade and a hard grounding threshold.
- `src/lib/tutor.functions.ts` — typed server functions (`askTutor`, `transcribeSpeech`) with Zod-validated input, strict structured model output, misconception inference, clamped confidence and per-stage latency.
- `src/lib/ai-gateway.server.ts` — server-only model access (chat JSON, transcription, speech synthesis).
- `src/lib/voice/stt.ts`, `src/lib/voice/tts.ts` — provider interfaces for speech. Streaming-first, with browser fallbacks so the classroom never goes silent. Designed for Gnani Prisma v2.5 (STT) and Gnani Timbre v2.5 (TTS) as production providers, without vendor lock-in.
- `src/hooks/useVoiceSession.ts` — the pipeline state machine: `IDLE → LISTENING → TRANSCRIBING → UNDERSTANDING → RETRIEVING → REASONING → RESPONDING → CHECKING/PRACTICE`, with run cancellation so a newer question always wins and audio never blocks the UI.
- `src/lib/types.ts` — shared contracts for evidence, answers, misconceptions, practice, learner context and learning events.

---

## Tech stack

- **TanStack Start v1** (React 19, file-based routing, server functions)
- **Vite 7**, **TypeScript**, **Tailwind CSS v4** design tokens
- **Zod** for every boundary
- Edge-runtime compatible server layer

---

## Getting started

```sh
npm install
npm run dev      # http://localhost:8080
```

Other scripts:

```sh
npm run build    # production build
npx tsgo --noEmit  # typecheck
```

### Environment

Model access is provided by the server runtime and read only inside server handlers — never in browser code. Voice provider credentials (Gnani Prisma / Timbre or an alternative) are read the same way, behind the provider interfaces in `src/lib/voice/`.

---

## Design system

"Sunset Glass Classroom" — a dark golden-hour palette of amber, rose, cream and mint over deep canvas, glass surfaces and soft ambient light. Typography: Space Grotesk (display), Inter (body), JetBrains Mono (telemetry). All colours are `oklch` tokens in `src/styles.css`; components never hardcode colour values.

---

## Reliability and safety

- Grounding threshold prevents confident answers on thin evidence; the tutor refuses, offers to rephrase, or answers as clearly-labelled general knowledge.
- Every failure path is visible and actionable: retry, ask differently, browse the lecture, escalate to a human teacher.
- Speech falls back to browser providers when the network provider is unavailable.
- Superseded pipeline runs are cancelled so stale answers can never overwrite fresh ones.
- Reduced-motion support, keyboard-reachable controls, ARIA state on every interactive element.

---

## Roadmap

- pgvector / Qdrant backed retrieval repository behind the existing interface
- Persisted learner memory and cross-session mastery
- Live teacher mode with realtime batch confusion streaming
- Bulk ingestion console for lecture video, notes and question banks
