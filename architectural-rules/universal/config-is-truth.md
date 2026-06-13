---
name: Config is truth, not installer wizards
description: For tools with a config file and an install/setup surface, treat the config file as the single source of truth. "First-run" is "no config exists yet, write defaults, proceed" — not a separate installer mode with separate code paths.
type: feedback
kind: architectural-rule
scope: [universal, configuration, cli-design, installer]
relevance: during-design, when-touching-installer, when-touching-cli-flags
---

For any tool with both (a) a config file and (b) an install/setup surface, the config file is the single source of truth. "First run on this machine" is just the case where the config file doesn't have the relevant block yet — write the default block, proceed through the normal code path, done. Same code path runs for the user's tenth re-bootstrap and for a friend's first-ever install.

**Why:** an installer wizard / `--first-run` / `--profile=friend` flag encodes a *role* into a *configuration*, implies a one-time decision the user can never revisit cleanly, and bifurcates the code path (installer vs steady-state). Three concrete failures of that shape:

1. *One-time decision lock-in.* A user who opted out of a hook bundle in the wizard now has no obvious path to opt back in. They have to discover that re-running the installer with a different flag is the answer (or worse, that hand-editing the config is). With "config is truth," they edit the file, re-run normally, idempotent.
2. *Bifurcated code paths.* Installer-mode and steady-state-mode are two surfaces to test, two failure modes to handle, two places where defaults can drift apart. With "config is truth," there's one code path that reads the file (seeding defaults if absent) and acts on it.
3. *Role leaks into configuration.* A `--friend-defaults` or `--team-mode` flag tells the tool *who the user is*. The tool doesn't need to know. It needs to know *what the user wants*. Conservative defaults serve a friend, a teammate, and the tool's author equally well.

**How to apply:**

- When designing an install/setup surface, the first question is "what config does this write." The setup is just "write that config (with sensible defaults if missing) and run normal startup."
- Resist install-time questions. If a question would be answered the same way by 90% of users, it's a default. If a question must be answered differently per-user, it's a config field. Either way, the install ceremony is unnecessary.
- Resist role-encoding flags (`--friend-defaults`, `--team-mode`, `--developer-mode`). They imply you know who the user is; you don't, and you don't need to. Every default is a default for *everyone*; users who want different opt in by editing the config.
- Make the steady-state code idempotent in both directions — turning a thing on and turning it back off should both be one-edit-then-re-run-the-tool. If "turning it off" requires a separate uninstall flow, the asymmetry will rot.
- First-run reporting: surface clearly that defaults were seeded ("seeded enabled block with solo defaults") so the user knows the config now exists and can be edited.

**Counter-cases (when an installer flow is appropriate):**

- Operations that are *not safely re-runnable* — partitioning a disk, allocating cloud resources, generating cryptographic identities. These genuinely have first-time-only semantics and a wizard can be the right shape.
- Onboarding flows that gather information the tool *can't compute defaults for* — e.g. the user's API key. Even then, prefer "leave the field empty in the seeded config and surface a clear error pointing at the file" over a blocking interactive prompt.

The rule isn't "no install scripts ever" — it's "don't *fake* an install ceremony for a steady-state config tool." Bootstrap that links files and writes a config? Steady-state. A wizard there is friction, not value.
