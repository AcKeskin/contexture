# new-agent: agent file template

```
---
name: <name>
description: <opening sentence about scope> Use PROACTIVELY for <triggers>.
tools: <tool list>
model: <model>
---

You are a <role> specializing in <scope sentence — language, platform, framework>.
<Optional second sentence on what makes the output good.>

## Focus Areas

<Bulleted list. Pull from the scope answers + a few derived items based on the framework.
If the user did not list these, prompt: "Anything specific to focus on beyond <derived list>? (blank to skip)">

## Pre-flight questions

Always ask these before generating code. Skipping any of them produces plausible-looking output that breaks on real input.

<Numbered list from step 5, each with a short why-this-matters clause if the user did not provide one — prompt for it inline if missing.>

## Approach

<Numbered list — derived from the focus areas + pre-flight + anti-patterns. Skill auto-drafts;
user reviews in the preview step.>

## Anti-patterns

<Bulleted list from step 6, with the "Symptom:" clause preserved.>

## Debugging workflow

<Numbered list from step 7.>

## Tool discipline

<Only when the allowlist includes Bash/Write/Edit/NotebookEdit (step 7b). Insert the fixed
block verbatim. Omit this entire section for read-only agents.>

## Output

<Bulleted list from step 8.>

<Optional closing line: a one-sentence rule the agent should never violate. Prompt:
"One-line rule the agent should never violate? (blank to skip — e.g. 'Never silently downgrade 10-bit HDR to 8-bit SDR.')">
```
