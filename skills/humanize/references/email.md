# Register module — email & messaging

Professional email and chat (Slack-style). Imports the catalogue (`ai-vocabulary.v1.md`) + carve-out (`false-positives.md`). **Length caveat: most chat messages fall below the ~120-word detection floor — score conservatively or aggregate across a sender's recent messages; never a confident per-message verdict.**

## Register-specific tells (flag by density)

- **Template scaffolding** — "I hope this email finds you well", "I wanted to reach out", "I trust this message finds you well", "Please don't hesitate to reach out", "I look forward to hearing from you".
- **Over-politeness stacking** — multiple thanks / apologies / hedges in a short message ("Sorry to bother you, but… thanks so much in advance!").
- **Corporate filler** — "circle back", "touch base", "per my last email", "going forward", "at your earliest convenience", "for visibility".
- **Buried ask** — the actual request sits at the bottom under throat-clearing.
- **Fake personalization** — "I came across your impressive work…" with nothing specific cited.

## Conventions to PRESERVE (never flag — native here)

- A real greeting and a single sign-off (email *wants* "Hi Sam" / "— Alex"). One sign-off, not three.
- Brevity, fragments, lowercase in chat ("on it", "ship it 👍").
- Emoji that carry meaning in chat.
- Direct one-line asks ("Free Tuesday 2pm?").
- Em-dashes, contractions, casual tone.
