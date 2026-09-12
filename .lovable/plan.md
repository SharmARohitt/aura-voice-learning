# Visual explanations + spoken-text follow

Two upgrades on top of the existing classroom, orb, RAG and voice pipeline. Nothing existing is rebuilt.

## 1. Mini diagrams beside the answer

- A lightweight rule check (question wording + subject + concepts) decides whether a visual helps. "What is 2 + 2?" gets none; "how does X work", "process of", "difference between", "structure of", "steps in" do.
- When it qualifies, a separate background request builds a small structured description of the picture — a list of boxes and arrows with short labels, a title and a type (flow, process, comparison, hierarchy, concept map, cycle). The AI never returns drawing code, only this structured data, which is validated before anything is drawn.
- The picture is grounded in the same retrieved course material as the answer. Weak grounding or a bad response means no picture at all — never an invented one, never an error message.
- Drawn by a diagram renderer (React Flow, loaded only when a picture is actually needed) styled to match the app: dark glass, thin borders, amber accents, soft glow, nodes fading in and arrows drawing themselves once.
- Placement: compact panel (about 320px) on the right of the answer on desktop, below the explanation on mobile. Tap to expand to a larger view, collapse to hide.
- Repeated concepts reuse a cached picture, so popular topics appear instantly.
- The picture never delays speech or text — it arrives after the answer has already started.

## 2. Voice-following text

- Each spoken sentence reports when it starts, so the matching sentence in the answer is highlighted while it is being said.
- The answer area scrolls smoothly to keep the active sentence in a comfortable reading zone — gentle movement, never a jump.
- If the student scrolls up themselves, following stops immediately and a small "Follow AI" button appears; pressing it resumes.
- When a spoken sentence mentions a concept that exists in the picture, that box glows briefly.
- If timing information is unavailable, it falls back to sentence-level tracking, which is what the speech queue already provides.

## 3. Speed of the first reply

Keeps the existing two-stage design (fast short answer first, full explanation after) and tightens it:
- The short answer, retrieval and the full answer start together rather than in sequence where possible.
- Speech begins on the first available sentence rather than waiting for the full structure.
- Picture generation and practice questions stay strictly off the critical path.
- Timings for transcription, retrieval, first text, first audio, picture and total are recorded and shown in the existing diagnostics column.

## Technical notes

- New: `src/lib/diagram/spec.ts` (types + validation + heuristics), `src/lib/diagram.functions.ts` (`generateDiagram` server fn, cached, returns `null` on any failure), `src/components/classroom/DiagramPanel.tsx` (lazy React Flow renderer + custom node styles).
- `TutorAnswer` gains optional `visual` and `sync` fields plus `diagram_ms`/`llm_ttft_ms` latency keys — additive only, existing consumers unaffected.
- `ResilientTTS.speak` gains an optional `onSentence(index)` callback; existing call signature stays valid.
- `useVoiceSession` exposes `activeSentence`, `visual`, and keeps all current returns.
- `AnswerPanel` gets highlighting, auto-scroll, the Follow AI control and the right-side visual slot; answer content, strategy chips, source card and practice stay as they are.
- Dependency added: `@xyflow/react` (MIT), dynamically imported so it is not in the initial load.
