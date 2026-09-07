# Voice Bingo — Aura-PW

**Voice is the interface. Learning intelligence is the product.**

A voice-first AI classroom for Bharat. A student asks a doubt out loud — in English, Hindi or natural Hinglish — and the system transcribes it in realtime, retrieves the exact lecture moment that answers it, reasons over that grounded evidence, detects the underlying misconception, generates graded practice, and speaks the answer back.

---

## 1. What problem are we solving?

India has more recorded lecture content than any country on earth — and students still stay stuck.

- **The doubt gap.** A student watching a 2-hour lecture gets stuck at minute 77. There is nobody to ask at 11 PM. Doubt-solving apps reply in hours; by then the momentum is gone.
- **Typing is a barrier, not a feature.** Most learners in Tier-2/3 India think in Hindi or Hinglish and type slowly in English. Asking "sir, potential aur field ka relation kya hota hai?" out loud takes 3 seconds. Typing that same doubt in textbook English takes a minute and loses the actual confusion.
- **Generic chatbots hallucinate syllabus.** A general LLM answers confidently from the open internet — not from *your* teacher's lecture, *your* board, *your* exam pattern. Students cannot tell a real answer from a plausible one.
- **Symptoms get treated, not causes.** A student asks the same question in five forms. Nobody detects that the real gap is a missing prerequisite two chapters back.
- **Teachers fly blind.** A teacher with 400 students has no idea which concept broke this week, or for whom.

**In one line:** learners cannot get an instant, spoken, syllabus-grounded answer in their own language — and nobody is diagnosing *why* they are confused.

---

## 2. What are we building?

**Voice Bingo (Aura-PW)** — a production-oriented, voice-native AI learning platform, not a chat window with a mic icon.

The student presses talk, speaks a doubt in any mix of Hindi and English, and within seconds hears a spoken answer that cites the exact lecture, teacher and timestamp it came from — along with the misconception behind the doubt and three graded practice questions.

Five working surfaces:

| Route | Purpose |
| --- | --- |
| `/` | Classroom cockpit — mic, live transcript, teacher avatar, grounded answer, practice, diagnostics |
| `/learning` | Searchable index of every approved lecture moment by subject, chapter and concept |
| `/practice` | Live-generated graded practice arena with session accuracy |
| `/confusion-graph` | Concept ↔ prerequisite map with per-node risk and one-click repair |
| `/teacher` | Batch console — confusion hotspots, coverage gaps, escalated doubts |

Onboarding first, always: class, exam goal, subjects and preferred language (English / हिंदी / Hinglish / Adaptive). Those four answers change retrieval filters, teaching tone and the spoken voice for every later answer.

---

## 3. Our solution and AI use cases

### The pipeline

```text
 Mic ──► Streaming STT ──► partial + final transcript
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
                       Streaming TTS ──► audio out
```

### AI use cases

1. **Speech-to-text (multilingual, streaming).** Realtime partial transcript so the student sees words appear as they speak. Designed for **Gnani Prisma v2.5** as the production Indic STT provider, with **`google/gemini-3.5-transcribe`** via the Lovable AI Gateway and the browser Web Speech API as fallbacks — the classroom never goes deaf.
2. **Language + intent detection.** Classifies the utterance as English, Hindi or Hinglish, detects natural-language switches ("hindi mein samjhao"), and routes teaching tone accordingly.
3. **Metadata-aware hybrid RAG.** BM25-style lexical scoring + concept-space semantic scoring, fused with Reciprocal Rank Fusion, reranked, filtered by class/exam/subject/chapter, with a widening cascade so a student is never blocked by their own onboarding answers.
4. **Source grounding with a hard threshold (0.45).** Above it, the answer cites lecture, teacher, timestamp and relevance. Below it, the system refuses to fake syllabus grounding and answers as clearly-labelled general knowledge — never blurred.
5. **Prerequisite-aware multi-level retrieval.** Pulls not just the answer chunk but the prerequisite chunk behind it, so a Class 12 doubt can be repaired with Class 11 evidence.
6. **LLM reasoning with strict structured output.** **`google/gemini-3.7-flash`** via the Lovable AI Gateway returns validated JSON: explanation, confidence, misconception, evidence use, suggested next topics.
7. **Misconception engine.** Infers the *wrong mental model* behind the question, its prerequisite root cause, and a concrete repair intervention — the difference between answering and teaching.
8. **Adaptive practice generation.** Three graded items per doubt — easy, similar, transfer — with explanations, generated against the same grounded evidence.
9. **Learning intelligence.** Confusion graph, weak-concept tracking, mastery context and a teacher console built from real session events.
10. **Text-to-speech (streaming, Indian-accented).** Sentence-queued streaming playback with barge-in — a new question instantly cancels the old audio. Designed for **Gnani Timbre v2.5** in production, with **`openai/gpt-4o-mini-tts`** via the gateway and browser speech synthesis as fallbacks.

---

## Tech stack and APIs

**Frontend / framework**

| Tech | Use |
| --- | --- |
| **TanStack Start v1** | Full-stack React framework, file-based routing, typed server functions |
| **TanStack Router** | Type-safe routing across all five surfaces |
| **React 19** | UI runtime |
| **Vite 7** | Build tool and dev server |
| **TypeScript** | End-to-end type safety |
| **Tailwind CSS v4** | `oklch` design tokens in `src/styles.css`, zero hardcoded colours |
| **Zod** | Runtime validation on every server boundary |
| **Lucide React** | Iconography |
| **Web Speech API** | Browser STT/TTS fallback layer |
| **Web Audio API** | PCM stream scheduling for low-latency playback |

**AI / voice APIs**

| API | Endpoint / model | Use |
| --- | --- | --- |
| **Gnani Prisma v2.5** | Streaming Indic ASR | Primary speech-to-text (provider interface, production target) |
| **Gnani Timbre v2.5** | Streaming Indic TTS | Primary text-to-speech (provider interface, production target) |
| **Lovable AI Gateway** | `https://ai.gateway.lovable.dev/v1` | Server-only, OpenAI-compatible model access |
| **Chat / reasoning** | `google/gemini-3.7-flash` | Grounded explanation, misconception, practice — strict JSON |
| **Transcription** | `google/gemini-3.5-transcribe` | STT fallback for recorded audio |
| **Speech** | `openai/gpt-4o-mini-tts` | TTS fallback, SSE + PCM streaming |

**Architecture layers**

- `src/lib/knowledge/corpus.ts` — approved knowledge repository, shaped exactly like ingestion output (parse → clean → chapter detection → concept extraction → chunking → metadata enrichment). Adding knowledge means adding records, never touching application code.
- `src/lib/rag/retriever.server.ts` — hybrid retrieval, RRF fusion, reranking, widening cascade, grounding threshold. This is the swap point for **pgvector / Qdrant / Chroma**.
- `src/lib/tutor.functions.ts` — typed server functions (`askTutor`, `transcribeSpeech`) with Zod-validated input and per-stage latency.
- `src/lib/ai-gateway.server.ts` — server-only model access; the API key never reaches the browser.
- `src/lib/voice/stt.ts`, `src/lib/voice/tts.ts` — vendor-neutral provider interfaces for speech.
- `src/hooks/useVoiceSession.ts` — pipeline state machine: `IDLE → LISTENING → TRANSCRIBING → UNDERSTANDING → RETRIEVING → REASONING → RESPONDING → CHECKING/PRACTICE`, with run cancellation so a newer question always wins.
- `src/lib/types.ts` — shared contracts for evidence, answers, misconceptions, practice, learner context and events.

---

## 3-minute demo voice-over script

> Timing cues in brackets. Speak naturally — Hinglish is the point, not an accident.

**[0:00 – 0:20] Hook — the problem**

"Raat ke gyaarah baje, ek student Class 12 ka electrostatics lecture dekh raha hai. Minute seventy-seven pe woh atak jaata hai. There's nobody to ask. Doubt apps take hours. Aur ChatGPT? It answers confidently — but not from *his* teacher's lecture. Yahi problem hum solve kar rahe hain. This is **Voice Bingo**."

**[0:20 – 0:40] Onboarding**

"Pehli baar app kholte hi onboarding aata hai — class, exam goal, subjects, aur language. Main choose kar raha hoon Class 12, JEE, Physics, aur Hinglish. Yeh chaar answers sirf profile nahi hain — inhi se retrieval filter hota hai, teaching tone set hoti hai, aur voice bhi. Aur seedha personalised welcome: *Welcome Aarav — aaj kya padhna hai?*"

**[0:40 – 1:15] The core moment — voice in, voice out**

"Ab main sirf bolunga. Press to talk —"

> *"Sir, potential aur electric field ka relation kya hota hai? Mujhe samajh nahi aa raha."*

"Dekhiye — transcript realtime aa raha hai, jaise main bol raha hoon. Yeh partial streaming hai, record-and-wait nahi. Teacher avatar state change kar raha hai: listening, understanding, retrieving, reasoning, responding. Aur ab answer bol ke aa raha hai — Hinglish mein, uss hi language mein jisme maine poocha."

**[1:15 – 1:45] Grounding — the trust layer**

"Ab yeh sabse important part hai. Answer ke neeche source card hai: **Lecture 42, teacher ka naam, timestamp one-seventeen-thirty-two, relevance score**. Yeh hallucination nahi hai — yeh uss exact lecture moment se aaya hai.

Aur agar evidence weak ho? System jhoot nahi bolta. Grounding threshold ke neeche woh saaf-saaf bolta hai — 'this is general knowledge, not from your course.' Trust isi se banta hai."

**[1:45 – 2:10] Misconception engine — beyond answering**

"Lekin hum sirf answer nahi de rahe. Neeche dekhiye — **misconception detected**: student potential ko force samajh raha hai. Root cause: ek prerequisite concept, do chapter peeche. Aur repair intervention bhi diya gaya hai.

Uske saath teen practice questions — easy, similar, aur transfer level — usi grounded evidence se generate hue. Doubt se diagnosis tak, ek hi breath mein."

**[2:10 – 2:35] The intelligence layer**

"Yeh sirf ek screen nahi hai. **Learning** tab — har approved lecture moment searchable. **Practice** — live graded arena with session accuracy. **Confusion Graph** — concept aur prerequisite ka map, har node pe risk score, aur one-click repair. Aur **Teacher console** — poore batch ke confusion hotspots, coverage gaps, escalated doubts. Teacher ko pata chal jaata hai ki iss hafte kaunsa concept toota hai."

**[2:35 – 3:00] Tech + close**

"Under the hood: **Gnani Prisma v2.5** for Indic speech-to-text, **Gnani Timbre v2.5** for text-to-speech — dono provider interfaces ke peeche, so no vendor lock-in. **Gemini 3.7 Flash** for reasoning with strict JSON output. Hybrid RAG — BM25 plus concept vectors, RRF fusion, reranking, prerequisite-aware retrieval, 0.45 grounding threshold. TanStack Start, React 19, TypeScript, Zod on every boundary. Har stage ki latency measured aur visible.

English mein poochiye, हिंदी में पूछिए, ya Hinglish mein — system aapki language match karega.

**Voice is the interface. Learning intelligence is the product.** Yeh hai Voice Bingo. Thank you."

---

## Getting started

```sh
npm install
npm run dev      # http://localhost:8080
```

```sh
npm run build       # production build
npx tsgo --noEmit   # typecheck
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
- API keys stay server-side; every input is Zod-validated at the boundary.
- Reduced-motion support, keyboard-reachable controls, ARIA state on every interactive element.

---

## Roadmap

- pgvector / Qdrant backed retrieval repository behind the existing interface
- Persisted learner memory and cross-session mastery
- Live teacher mode with realtime batch confusion streaming
- Bulk ingestion console for lecture video, notes and question banks
