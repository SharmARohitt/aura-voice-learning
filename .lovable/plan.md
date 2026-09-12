# Voice Bingo product UI redesign

## Direction
Build the selected **Architectural Studio Minimalist** composition as a warm, light learning canvas—not the prototype’s dark palette.

Locked design choices:
- Palette: `#EFD0CA`, `#C1BCAC`, `#979B8D`, `#5C7457`, `#214E34`, supported by warm off-white surfaces and near-black text.
- Typography: Sora headings, Manrope body, restrained mono only for diagnostics.
- Layout: persistent learning-context sidebar on wide screens, spacious tutor workspace, compact contextual reference area when useful.
- Identity: retain the live orange fire orb as Voice Bingo’s signature voice presence.

## What stays unchanged
- All routes and route links.
- Voice capture, AI state machine, typed fallback, RAG, API calls, TTS/STT, diagrams, source resolution, practice behavior, learner state, and response contracts.
- Spoken-sentence highlighting and user-controlled auto-follow behavior.

## Implementation
1. **Design system foundation**
   - Replace the dark glass theme with centralized warm-neutral, rose, sage, forest, ink, border, state, shadow, radius, typography, and motion tokens.
   - Load Sora and Manrope in the existing document head.
   - Add shared frontend primitives for buttons, surfaces, labels, layout containers, reveal behavior, and focus states.

2. **Navigation and app shell**
   - Rebuild the shared navigation as a restrained warm translucent bar with existing routes, compact voice readiness, and profile access.
   - Add an accessible mobile menu instead of wrapped links.
   - Restyle shared page headers, error screens, and missing-page states.

3. **Classroom learning canvas**
   - Restructure the classroom into the selected composition: contextual sidebar, central voice stage, and contextual answer/reference area.
   - Keep the orb dominant, make listening/thinking/speaking states immediately legible, and treat typing as a clear fallback.
   - Consolidate modes and languages into compact, coherent controls without changing callbacks.
   - Preserve a visible hint of the next learning content within the first viewport.

4. **Tutor reading experience**
   - Turn answers into a spacious editorial reading surface rather than stacked glass cards.
   - Refine spoken-sentence highlighting with a soft rose/sage cue and preserve auto-follow pause/resume.
   - Keep diagrams as a compact right-side margin on desktop and stacked content on mobile.
   - Restyle sources as trustworthy lecture references with clear replay and re-teach actions.

5. **Supporting learning surfaces**
   - Redesign onboarding, welcome actions, transcript, learning context, practice, and diagnostics with purposeful hierarchy.
   - Redesign Learning, Practice, Confusion Graph, and Teacher routes using the same system while preserving all controls and navigation contracts.
   - De-emphasize technical diagnostics relative to learner-facing content.

6. **Motion, performance, and accessibility**
   - Use IntersectionObserver plus CSS transforms/opacity for restrained reveals; avoid a heavy smooth-scroll dependency.
   - Keep native scrolling responsive and add subtle smooth behavior only where it does not fight the user.
   - Make auto-scroll and animations reduced-motion-aware; pause unnecessary orb work when hidden.
   - Verify focus states, contrast, keyboard navigation, readable sizing, touch targets, and no horizontal overflow.

7. **Verification**
   - Check the classroom and all content routes at desktop and phone widths.
   - Exercise onboarding, navigation, mode/language controls, voice/typed controls, answer states, Follow AI, diagrams, sources, practice, empty/loading/error states.
   - Confirm the preview builds cleanly and existing product behavior remains intact.
