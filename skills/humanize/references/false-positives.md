# False positives — DO NOT flag (research-refuted)

The de-dogmatize guard. Each entry below is either **adversarially refuted** in deep-research wf_1a39f292 (lost its verification vote) or is a **register convention** mistaken for a tell. The skill must NOT flag these standalone, and the rule must carry the carve-out. Flagging them is the failure mode of the surveyed humanizers (the-humanizer, the em-dash folklore).

## Refuted statistical markers (lost verification votes)

| Claimed tell | Verdict | Why it's wrong |
|---|---|---|
| **Low perplexity / low lexical diversity** | refuted 0-3 | A proxy for writer **proficiency**, not machine authorship. ~60% false-positive rate on non-native (TOEFL) essays; vocabulary enrichment cuts FPR ~49%. → carry a **proficiency-confound flag** that down-weights it. |
| **Distinct POS distributions** (more nouns/determiners/adjectives) | refuted 1-2 | Did not survive as a standalone reliable discriminator. |
| **"Humanized paraphrase defeats detectors" as a tell** | refuted 0-3 | Directional at best (preprint, n~49). Not a basis for scoring. |

## Conventions mistaken for tells (do not flag; down-weight in doc registers)

- **Em-dashes (single / occasional)** — folklore as a tell. Explicitly debunked; legitimate human punctuation. **Never flag presence.** *Exception (soft, voice-relative — catalogue §B6):* the spaced em-dash ` — ` used as the **default connective at high density** is a current-era LLM fingerprint. Flag **overuse relative to the author's sample / register norm** as a voice-match cue, never as an AI verdict, and never on a single occurrence. The fix is rewrite-time diversification, not a ban.
- **Single catchphrase match** — e.g. "stand as a testament" appears in pre-LLM (2021) human Wikipedia. Match **density**, never one instance.
- **Headers, boldface, bulleted lists** — genuine conventions in technical docs, changelogs, PRs. Lower their weight to near-zero in doc registers; they are not anomalies there.
- **Rule-of-three, once** — a normal rhetorical tool. Only *repeated* stacking is a signal (see catalogue §B1).
- **Curly quotes, title-case headings** — Wikipedia-register artifacts; irrelevant to dev-doc/email/PR registers.

## Structural-fragility reminder (why scorer, not oracle)

No text-only detector escapes a mathematical false-positive floor (impossibility bound, Sadasivan et al.); 14 commercial tools tested, none reached 80% accuracy. The skill therefore reports **advisory density**, surfaces the proficiency-confound flag, and **never** issues a binary verdict. A clean score does not certify human authorship; a high score does not prove AI authorship.
