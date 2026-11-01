---
description: "An intermittent failure with no obvious fix goes to systematic-debugging before any fix."
tags: [trigger, auto]
max_turns: 15
allowed_tools: [Read, Glob, Grep, Skill, AskUserQuestion]
---

My test fails about one run in five with "TypeError: undefined is not a function" inside parseDate. I've tried adding retries. What should I do?
