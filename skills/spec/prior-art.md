# spec: prior-art pass

Read at step 4.5, only for port or parity work.

4.5 **Prior-art pass** (conditional — port / parity work only). When the feature already exists somewhere and this work is a *port* of it, the existing implementation **is** the requirements document. Interviewing from zero re-derives from memory what the repo already states exactly.

   **Trigger.** Run this pass when the user frames the work against something that exists — *"like X but for Y"*, *"same as the desktop version"*, *"port"*, *"parity with"*, *"we did this for &lt;platform&gt;"* — or when the interview surfaces a sibling capability already built. **No trigger, no pass:** an original feature goes straight to step 5 with no added cost.

   1. **Sweep for candidate bases.** Codemap first (it already names modules and their roles); targeted Glob/Grep only where the codemap doesn't reach. This is a *locate* pass, not a read pass — you are looking for which implementations exist and where.

   2. **Confirm the canonical base.** List the candidates and ask which one is authoritative. Never pick silently: sibling implementations drift, and the one that looks newest is not reliably the one they consider correct.

      **Surface drift as a finding.** If two candidates disagree on behaviour, say so before the interview continues:

      > `<A>` and `<B>` differ on `<behaviour>`. The port can't inherit both — which is the intended behaviour?

      Drift is a requirements question the user must settle, not something to resolve by picking the majority or the most recent.

   3. **Bases in another project.** A base often lives outside this repo (*"like we did in `<other project>`"*). Two sources, both narrow:
      - **User nomination** — they name the project or path.
      - **A memory pointer** — a stored reference or lesson already points at that project.

      **Never sweep other projects looking for one.** An unprompted scan across the filesystem is unbounded cost for a guess, and it reads private trees nobody pointed you at. No nomination and no pointer means no cross-project base — say so and continue with what's here.

      Resolve a nominated project through its own codemap when it has one, targeted reads otherwise. If that codemap is stale, **warn and use it anyway** — regenerating another project's artefacts from this session is scope creep. Record the base path with a note that it is machine-local: the spec is a local artefact, and a path that resolves here means nothing on a teammate's machine.

## Delta interview (step 5, confirmed base)

interview on the **delta**, not from zero. First inventory the base's observable behaviours: what it does, its states and transitions, what it does on failure. **Inventory, don't absorb** — you are listing behaviours and where they live, not reading implementations into the spec; the deep read belongs downstream in blueprint or the plan. Then ask only about divergence:

     > The base does `<A>`, `<B>`, `<C>` on `<event>`. Same here, or does `<target>` differ?

     Behaviours the user doesn't flag as different are carried into the spec as inherited, exactly as the evolve flow carries untouched sections forward. This is the same delta discipline, with a code baseline instead of a spec baseline.

     **Ask the shared-core question — always, on every confirmed base:**

     > Port the behaviour into a separate implementation, or extract the shared logic into a common core both call?

     This is an architecture decision with a long tail, it is cheapest to take now, and it will otherwise be taken by default at execute time by whoever is closest to the code. Record the answer in the spec — including *why*, since "we deliberately duplicated" and "we never thought about it" read identically six months later.

## Anchoring guard (step 6, confirmed base)

Cross-check what discover returned *against the base*. A base is evidence, not gospel — a known defect in it will otherwise be ported forward as though it were a requirement. When a retrieved lesson or warning names a problem in the base, flag it rather than inheriting it silently:

   > The base carries `<known problem>` (from `<memory name>`). Porting it as-is inherits that. Keep the behaviour, or fix it in the port?

   The delta interview asks *what differs*; this asks *what shouldn't be copied*. Without it, the pass makes the strongest case for reproducing exactly the behaviour you already learned was wrong.
