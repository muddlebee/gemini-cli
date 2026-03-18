# SuperDesign MVP Extension

SuperDesign MVP is an extension-only implementation of a moodboard plus iterative
HTML design canvas workflow for Gemini CLI.

It is built for deterministic demos: no external image-model dependency is
required for the baseline flow.

## What it includes

- MCP tools for project setup, inspiration capture, token derivation, variant
  generation, iterative refinement, undo/redo, and export.
- Slash wrapper commands under `/design:*` for controlled and demo-friendly UX.
- Persistent project state via `state.json` and `events.jsonl`.
- Browser canvas runtime at `.superdesign-runtime/projects/<project-id>/canvas/index.html`.

## Directory structure

- `moodboard-server.js`: MCP server entrypoint and tool registration.
- `src/state-store.js`: state persistence and deterministic undo/redo snapshots.
- `src/design-engine.js`: deterministic design logic and export helpers.
- `canvas/*`: runtime template copied into each project.
- `commands/design/*.toml`: wrapper commands for fast CLI control.

## Setup

From the extension folder:

```bash
cd packages/cli/src/commands/extensions/examples/superdesign-mvp
npm install
gemini extensions link .
```

Restart Gemini CLI after linking to ensure extension commands are loaded.

## Wrapper commands

- `/design:init "<design prompt>"`
- `/design:add <note-or-url>`
- `/design:gen [count] [constraints...]`
- `/design:apply <index-or-variant-id>`
- `/design:iterate <instruction>`
- `/design:undo`
- `/design:redo`
- `/design:export [html|state]`

## MCP tools and contracts

- `design_init_project(name, path?)`
- `design_init_project(name?, prompt?, path?, autoOpen?, variantCount?)`
- `design_add_inspiration(input, projectPath?, projectId?, tags?, notes?, type?)`
- `design_derive_tokens(projectPath?, projectId?)`
- `design_generate_variants(projectPath?, projectId?, count?, constraints?)`
- `design_apply_variant(variantId, projectPath?, projectId?)`
- `design_iterate(instruction, projectPath?, projectId?)`
- `design_undo(projectPath?, projectId?)`
- `design_redo(projectPath?, projectId?)`
- `design_export(projectPath?, projectId?, format?)`

## Architecture note

The MVP relies on deterministic state transitions:

- Every mutation creates an event in `events.jsonl` with a full state snapshot.
- `state.json` stores the currently active snapshot and history cursor.
- Undo/redo simply moves the cursor across recorded snapshots.

This approach is intentionally simple and reproducible for demos: the same
command sequence always yields the same visual state.

## Updated flow

1. Run `/design:init "beautiful origami chat app"`.
2. The tool warm-starts state by seeding prompt inspiration, deriving tokens,
   generating variants, and auto-applying variant 1.
3. Canvas opens automatically and starts polling live state updates.
4. Use `/design:iterate` for fast refinements and `/design:gen` only when
   exploring alternative directions.

## Runtime artifacts

- Runtime projects are written to `.superdesign-runtime/projects` at repo root.
- This keeps mutable demo artifacts out of extension source folders.
