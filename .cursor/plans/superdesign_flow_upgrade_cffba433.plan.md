---
name: SuperDesign Flow Upgrade
overview: Refine the MVP so `/design:init` immediately renders a prompt-driven active design, auto-opens canvas, and uses repo-root runtime storage to avoid noisy flow issues while keeping variant iteration commands for exploration.
todos:
  - id: upgrade-init-warm-start
    content: Upgrade `design_init_project` to accept prompt, run warm-start pipeline, and auto-open canvas.
    status: completed
  - id: move-runtime-root-folder
    content: Set default project storage to repo-root runtime directory and update path resolution/summaries.
    status: completed
  - id: improve-active-design-first-render
    content: Replace generic layout with prompt-themed active canvas rendering so init prompt yields immediate design-specific UI.
    status: completed
  - id: add-live-reload-polling
    content: Add polling-based live reload in canvas runtime so state changes appear automatically without manual refresh.
    status: completed
  - id: tighten-init-wrapper
    content: Update `/design:init` wrapper to enforce one-step prompt-first init behavior.
    status: completed
  - id: refresh-docs-flow
    content: Update README and DEMO docs to reflect init-first-populated flow and runtime folder usage.
    status: completed
  - id: validate-e2e-demo-commands
    content: Run full CLI demo flow and capture pass/fail checks for init/iterate/gen/apply/export.
    status: in_progress
isProject: false
---

# SuperDesign Flow Upgrade Plan

## Goal

Make the demo feel instant and polished: `init` should create a project from the design prompt, populate the active design immediately, open the canvas automatically, and keep runtime artifacts in a dedicated repo-root runtime folder.

## Decisions Locked

- Runtime storage will be inside repo root in a dedicated folder (e.g. `.superdesign-runtime/projects`).
- `init` becomes prompt-first warm start (not blank canvas).
- `gen` remains variant exploration after init, not required for first render.
- Live reload will use polling (`state.json` timestamp checks) for MVP reliability over websocket complexity.

## Implementation Changes

- Update MCP init behavior in `[/home/muddles/Codes/gsoc/gemini-cli/packages/cli/src/commands/extensions/examples/superdesign-mvp/moodboard-server.js](/home/muddles/Codes/gsoc/gemini-cli/packages/cli/src/commands/extensions/examples/superdesign-mvp/moodboard-server.js)`:
  - Extend `design_init_project` inputs to include prompt text and optional auto-open flag.
  - During init, run warm-start pipeline: `add inspiration -> derive tokens -> generate variants -> apply first variant`.
  - Resolve project output path under repo-root runtime directory by default.
  - Auto-open canvas file after init via platform-safe launcher (`xdg-open` on Linux).
- Improve runtime path handling in `[/home/muddles/Codes/gsoc/gemini-cli/packages/cli/src/commands/extensions/examples/superdesign-mvp/src/state-store.js](/home/muddles/Codes/gsoc/gemini-cli/packages/cli/src/commands/extensions/examples/superdesign-mvp/src/state-store.js)`:
  - Keep state/event/log semantics unchanged.
  - Ensure summaries/reporting point to new runtime location.
- Improve visual first impression in `[/home/muddles/Codes/gsoc/gemini-cli/packages/cli/src/commands/extensions/examples/superdesign-mvp/src/design-engine.js](/home/muddles/Codes/gsoc/gemini-cli/packages/cli/src/commands/extensions/examples/superdesign-mvp/src/design-engine.js)` and canvas files:
  - Add prompt-aware defaults for first active design (headline, CTA, style descriptors).
  - Replace the generic 3-panel visual structure with themed active-design rendering based on prompt/style direction.
  - Keep variant switching available without dominating the primary canvas view.
- Update canvas runtime in `[/home/muddles/Codes/gsoc/gemini-cli/packages/cli/src/commands/extensions/examples/superdesign-mvp/canvas/index.html](/home/muddles/Codes/gsoc/gemini-cli/packages/cli/src/commands/extensions/examples/superdesign-mvp/canvas/index.html)` and `[/home/muddles/Codes/gsoc/gemini-cli/packages/cli/src/commands/extensions/examples/superdesign-mvp/canvas/app.js](/home/muddles/Codes/gsoc/gemini-cli/packages/cli/src/commands/extensions/examples/superdesign-mvp/canvas/app.js)`:
  - Ensure first load shows populated active design (no generic placeholder if prompt provided).
  - Add polling-based live reload so state changes are reflected automatically (without reopening the file).
  - Keep active design as the visual priority while preserving lightweight controls/status.
- Update wrapper command behavior in `[/home/muddles/Codes/gsoc/gemini-cli/packages/cli/src/commands/extensions/examples/superdesign-mvp/commands/design/init.toml](/home/muddles/Codes/gsoc/gemini-cli/packages/cli/src/commands/extensions/examples/superdesign-mvp/commands/design/init.toml)`:
  - Treat full args as design prompt.
  - Instruct immediate one-step init tool execution only.
- Update docs for the new flow in `[/home/muddles/Codes/gsoc/gemini-cli/packages/cli/src/commands/extensions/examples/superdesign-mvp/README.md](/home/muddles/Codes/gsoc/gemini-cli/packages/cli/src/commands/extensions/examples/superdesign-mvp/README.md)` and `[/home/muddles/Codes/gsoc/gemini-cli/packages/cli/src/commands/extensions/examples/superdesign-mvp/DEMO.md](/home/muddles/Codes/gsoc/gemini-cli/packages/cli/src/commands/extensions/examples/superdesign-mvp/DEMO.md)`:
  - New command sequence (`init` now yields visible design immediately).
  - Clarify `gen` is for additional alternatives.
  - Document runtime directory location and cleanup instructions.

## Updated User Flow

```mermaid
flowchart LR
user[User] --> init[/design:init prompt]
init --> warmStart[WarmStartPipeline]
warmStart --> stateWrite[StateAndEventsWritten]
stateWrite --> autoOpen[AutoOpenCanvas]
autoOpen --> activeView[ActiveDesignVisible]
activeView --> gen[/design:gen optional]
gen --> apply[/design:apply optional]
apply --> iterate[/design:iterate]
iterate --> export[/design:export]
```



## Validation Plan

- Run `npm run build` in repo root.
- Run live command sequence in CLI:
  - `/design:init "beautiful origami chat app"`
  - `/design:iterate "softer paper shadows and tighter spacing"`
  - `/design:gen 3 minimal`
  - `/design:apply 2`
  - `/design:export html`
- Verify:
  - canvas opens automatically on init,
  - first render is populated (not blank placeholder),
  - active canvas reflects prompt theme (not generic 3-panel fallback),
  - live reload updates after iterate/apply without manual refresh,
  - events/history advance correctly,
  - exports are written in runtime folder.

