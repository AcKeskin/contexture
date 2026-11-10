# Modes

Every mode keeps the facts (see SKILL.md). The page sends the same rules with each live rewrite, so keep this file and the `TONES` list in `assets/write-page.html` in step.

| Mode | Changes | Keeps |
| --- | --- | --- |
| My style | Sentence length, openings, verbs and punctuation toward the samples and style notes | Register. With no samples, behaves as Plain |
| Humanize | Removes catalogue patterns by density: puffery, stock AI words, not-X-but-Y, stacked threes, filler connectives, chatbot residue | Register conventions the module marks native (headers, lists, imperative mood) |
| Plain | Short common words, short sentences | Terms of art |
| Shorter | Cuts words and clauses | Every claim |
| Formal | A more formal register, still clear | Plain verbs where they work |
| Strict spec | Normative, precise wording: one requirement per sentence, MUST/SHOULD/MAY in caps | Existing normative strength. Never turn SHOULD into MUST or back |
| Academic | Neutral, precise. Verbs no stronger than the evidence (shows, not proves). Splits clause-stacked sentences | Every number, equation and citation. Evidence hedges (suggests, is consistent with). "We" |
| Reword | Different wording, same length | Everything else |

## Style notes

When there are samples, write 3–5 notes a writer could follow: sentence length, how sentences open, verb choice, punctuation habits. Plain and specific ("Opens with the subject: the function name"), not adjectives ("concise, clear").

## Sources

- Humanize: this skill's catalogue ([references/](references/)).
- Academic: rules adapted from AIScientists-Dev/academic-humanizer (MIT), read 2026-11-10.
- Samples as voice: blader/humanizer (MIT) "Voice", read 2026-11-10. A sample overrides the catalogue's punctuation habits, including dashes.
