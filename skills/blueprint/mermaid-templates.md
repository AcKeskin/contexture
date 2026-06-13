# Mermaid templates for `/blueprint`

Diagram templates the `document` skill references by name. All Mermaid (native in Obsidian + GitHub). Each template shows the shape; the skill fills it from the source. Fan-out caps from `SKILL.md` §4.5 apply.

## `c4-architecture`

C4-style component/container view. **Emit both** a native C4 block and a flowchart fallback, with the note — native `C4*` blocks render inconsistently across Obsidian Mermaid versions; the flowchart is the guaranteed floor.

Native block:

```mermaid
C4Container
  title Container diagram — <system>
  Person(user, "User", "Who initiates")
  Container(api, "API", "<tech>", "Handles requests")
  Container(core, "Domain core", "<tech>", "Business logic")
  ContainerDb(db, "Store", "<tech>", "Persists state")
  Rel(user, api, "calls")
  Rel(api, core, "invokes")
  Rel(core, db, "reads/writes")
```

Flowchart fallback (always include directly below the native block):

```mermaid
%% Fallback if your Mermaid build does not render C4Container above.
flowchart LR
  user([User])
  subgraph boundary["<system>"]
    api["API<br/><i>handles requests</i>"]
    core["Domain core<br/><i>business logic</i>"]
    db[("Store")]
  end
  user --> api --> core --> db
```

With the note line beneath: *"C4 shown as a native block (preferred) with a flowchart fallback for renderers without C4 support."*

## `sequence`

Runtime flow. One per primary scenario. In Mode 2, prefix with the inferred marker.

```mermaid
%% inferred — verify against runtime    (Mode 2 ONLY; omit in Mode 1)
sequenceDiagram
  actor User
  participant API
  participant Core
  participant Store
  User->>API: request(payload)
  API->>Core: validate + dispatch
  Core->>Store: persist(entity)
  Store-->>Core: ok / id
  Core-->>API: result
  API-->>User: response
```

Cap: > ~12 participants → split per sub-scenario, note the split.

## `class`

Data-model types and their relations.

```mermaid
classDiagram
  class Entity {
    +Id id
    +String name
    +save() void
  }
  class Repository {
    <<interface>>
    +find(id) Entity
    +save(e) void
  }
  Repository <|.. SqlRepository : implements
  Entity "1" o-- "many" Child : owns
```

Stereotypes: `<<interface>>`, `<<abstract>>`, `<<enumeration>>`, `<<record>>`. Relations: `<|--` extends, `<|..` implements, `o--` composition, `*--` aggregation. Cap: > ~15 nodes → split per module/aggregate.

## `er`

Persisted-entity relations (data layer).

```mermaid
erDiagram
  USER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
  PRODUCT ||--o{ LINE_ITEM : "appears in"
  USER {
    uuid id PK
    string email UK
  }
  ORDER {
    uuid id PK
    uuid user_id FK
    timestamp created_at
  }
```

## `state`

Lifecycle of a stateful entity.

```mermaid
%% inferred — verify against runtime    (Mode 2 ONLY)
stateDiagram-v2
  [*] --> Draft
  Draft --> Active : submit
  Active --> Superseded : new version
  Active --> Abandoned : abandon
  Superseded --> [*]
  Abandoned --> [*]
```

## `activity`

Process flow with decision branches (Mermaid has no native activity diagram — use a flowchart).

```mermaid
flowchart TD
  start([Start]) --> read[Read sources]
  read --> gap{Source silent?}
  gap -->|yes| ask[Batch-ask the gaps]
  gap -->|no| author[Author section]
  ask --> author
  author --> more{More sections?}
  more -->|yes| read
  more -->|no| gate[Review gate]
  gate -->|accept| write[Write artefacts]
  gate -->|reject| stop([Discard])
  write --> done([Done])
```

## Conventions

- Use `%%{init: {"flowchart": {"defaultRenderer": "elk"}}}%%` on dense flowcharts (codemap-visualize precedent) so layout stays readable.
- One Mermaid block per logical diagram. In per-section vault split, each section note carries its own blocks (Obsidian renders faster one-per-note).
- Mode 2: every behavioral diagram (`sequence`, `state`) starts with the `%% inferred — verify against runtime` comment.
