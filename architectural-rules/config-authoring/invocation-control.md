---
name: Invocation control
description: "\"Never auto-fires\" names two different contracts and only one is enforceable. Say which one; when the model must not invoke it at all, the frontmatter field is the contract, not the prose."
type: user
kind: architectural-rule
scope: [config-authoring, skills]
relevance: when-touching-skills, when-authoring-instructions, during-review
---

- <!-- id: two-contracts --> **"Never auto-fires" is two contracts, not one.** *Does-not-self-start*: the skill never decides on its own that now is the moment, but another organ may still drive it (everything the closing ceremony sequences is this). *User-only*: the model cannot invoke it at all, by any path. Name which one a skill means. Writing one phrase for both hides the difference until something breaks.
- <!-- id: platform-fields --> **The platform enforces the second, not the first.** `disable-model-invocation: true` makes a skill user-only. `user-invocable: false` makes it model-only (a library skill other skills call, absent from the `/` menu). Does-not-self-start has no field; it stays prose, and the prose should say so rather than implying a gate exists.
- <!-- id: frontmatter-is-the-contract --> When a skill is user-only, **the frontmatter field is the contract and the description does not repeat it.** Two statements of one contract drift, and the field is the one the host reads.
- <!-- id: default-reading --> **An unannotated "never auto-fires" in a description means does-not-self-start.** User-only is declared by the frontmatter field and nowhere else. So a description carrying the phrase with no field is correct as written, not an omission — and a description carrying both is the drift to fix.
- <!-- id: flag-costs-the-description --> **`disable-model-invocation: true` also removes the description from context.** That is the point for a skill with side effects — the model should not know enough to want to run it. It is a real loss for a skill whose value includes being offered mid-conversation ("want me to run this on that draft?"). Choose per skill, on that question, not on tidiness.
- <!-- id: check-the-drivers-first --> **Before setting the field, check who drives the skill.** Grep the skills tree for `/name` and read the hits: a driver that invokes it breaks, a document that merely names it does not. A skill any ceremony sequences cannot be user-only.

**Why:** these contracts were interchangeable for as long as neither was enforced, so one phrase covered both and nobody noticed. Once one of them is a field the host obeys, the difference is the difference between a skill that stays out of the way and a ceremony that silently stops running. Related: `universal/skill-auto-fire.md` covers *when* a model-invocable skill fires; this rule covers *whether* it can be model-invoked at all.
