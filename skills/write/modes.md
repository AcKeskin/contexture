# Modes

Every mode keeps the facts (see SKILL.md). The page sends the same rules with each live rewrite, so keep this file and the `TONES` list in `assets/write-page.html` in step.

| Mode | Changes | Keeps |
| --- | --- | --- |
| My style | Sentence length, openings, verbs and punctuation toward the samples and style notes | Register. With no samples, behaves as Plain |
| Humanize | Removes catalogue patterns by density: puffery, stock AI words, not-X-but-Y, stacked threes, filler connectives, chatbot residue | Register conventions the module marks native (headers, lists, imperative mood) |
| Plain | The STE80 rules below: one idea per sentence, instructions 20 words at most, active voice, plain verbs | Terms of art. The source's certainty (can, must, may) |
| Shorter | Cuts words and clauses | Every claim |
| Formal | A more formal register, still clear | Plain verbs where they work |
| Strict spec | Normative, precise wording: one requirement per sentence, MUST/SHOULD/MAY in caps | Existing normative strength. Never turn SHOULD into MUST or back |
| Academic | Neutral, precise. Verbs no stronger than the evidence (shows, not proves). Splits clause-stacked sentences | Every number, equation and citation. Evidence hedges (suggests, is consistent with). "We" |
| Reword | Different wording, same length | Everything else |

## Plain rules (STE80)

Plain follows ASD-STE100, softened to about 80%. A few words over a limit is fine; vary the length.

1. One idea per sentence. Two linked facts may share one with "and" or "because".
2. Instructions: 20 words at most. Descriptions: 25. A number with its unit, a name or a code identifier is one word.
3. Condition first, then the command: "If the build fails, run the tests."
4. Keep articles, "that" and the verb. Fragments are fine in tables, headings and labels.
5. A sequence, options or more than two conditions become a list. Number steps.
6. Active voice. Name who acts, unless the actor is unknown or does not matter.
7. Simple tenses: present, past, "will", imperative.
8. Put the action in the verb ("decide", not "make a decision"). No "-ing" chains.
9. Honest modals. Keep the source's certainty; "may" and "should" only for real doubt or advice.
10. Plain words with one meaning ("use", not "utilize"). One exact verb for a phrasal verb.
11. One term per thing. Do not rotate synonyms.
12. At most three nouns in a row. Break longer stacks with "of" or "for".
13. One topic per paragraph, six sentences at most, topic first.
14. Keep steps and descriptions apart. A warning comes before the step it protects.
15. No semicolons. Plain connectors: "but", "so", "also", not "however", "furthermore", "moreover".

`prep.mjs` flags instructions over 20 words and other sentences over 25.

## Style notes

When there are samples, write 3–5 notes a writer could follow: sentence length, how sentences open, verb choice, punctuation habits. Plain and specific ("Opens with the subject: the function name"), not adjectives ("concise, clear").

## Sources

- Humanize: this skill's catalogue ([references/](references/)).
- Plain: STE80 rules adapted from Dodaios/ste80-humanizer (MIT, ace4484), read 2026-11-18.
- Academic: rules adapted from AIScientists-Dev/academic-humanizer (MIT), read 2026-11-10.
- Samples as voice: blader/humanizer (MIT) "Voice", read 2026-11-10. A sample overrides the catalogue's punctuation habits, including dashes.
