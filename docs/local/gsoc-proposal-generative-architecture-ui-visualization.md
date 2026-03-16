# GSoC Implementation Proposal: Generative Architecture & UI Visualization

**Project:** Google Gemini CLI  
**Organization:** Google  
**Program:** Google Summer of Code  
**Idea:** Generative Architecture & UI Visualization (#12)  
**Difficulty:** Medium  
**Size:** 175 hours  
**Area:** Innovation/UX

---

## Table of Contents

1. [Abstract](#1-abstract)
2. [Motivation and Problem Statement](#2-motivation-and-problem-statement)
3. [Understanding the Existing System](#3-understanding-the-existing-system)
4. [Proposed Solution Overview](#4-proposed-solution-overview)
5. [Technical Design](#5-technical-design)
6. [Component Specifications](#6-component-specifications)
7. [Integration Points](#7-integration-points)
8. [Risks and Mitigations](#8-risks-and-mitigations)
9. [Implementation Timeline](#9-implementation-timeline)
10. [Expected Outcomes and Deliverables](#10-expected-outcomes-and-deliverables)
11. [About the Applicant](#11-about-the-applicant)

---

## 1. Abstract

This proposal describes a plan to add **inline visual artifacts** to Gemini CLI: architecture diagrams, dependency graphs, data-flow visualizations, and live previews of generated UI components, rendered directly in the terminal. The implementation uses **Mermaid.js** for diagram generation from codebase-derived or model-generated definitions, and **terminal image protocols** (Sixel, iTerm2, Kitty) for rich graphics, with an **ASCII/ANSI box-drawing fallback** for unsupported terminals. A new **`visualize`** tool allows the agent to produce diagrams on demand; integration with natural-language “explain” flows and optional slash command **`/visualize`** makes “Explain this architecture” result in a rendered diagram inline. Caching, dependency/git visualizations, and a clear extension path for UI previews complete the scope within the 175-hour budget.

---

## 2. Motivation and Problem Statement

Today, Gemini CLI is text-only. When a developer asks “explain the authentication flow” or “show me how the frontend talks to the API,” the answer is prose and code blocks. Architecture, dependencies, and UI are described in words—users must mentally visualize or switch to a browser/IDE to draw diagrams or open a preview.

That constraint is unnecessary. Modern terminals support inline graphics (Sixel, iTerm2 inline images, Kitty graphics). Mermaid has become the de facto text-to-diagram format and can be rendered server-side to SVG/PNG. Gemini CLI already has a **tool/result pipeline** (tools return `llmContent` and `returnDisplay`; the CLI renders `resultDisplay` as markdown, ANSI, file diff, or JSON). The gap is: **no tool produces graphical output**, and **no display path** emits terminal image escape sequences or falls back to ASCII art.

**Why this matters:**

- **Paradigm shift:** No major CLI coding tool renders rich graphics inline—this is genuinely new.
- **Frontend developer appeal:** Instant visual feedback for generated HTML/CSS/React without leaving the terminal.
- **Viral demo potential:** Terminal diagrams are visually striking and shareable.
- **Fits the codebase:** The agent already has read-only tools and optional sub-agents (e.g. codebase investigator); giving it a `visualize` tool and teaching it to output Mermaid aligns with existing patterns.

---

## 3. Understanding the Existing System

Research was done against the [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) repository (including DeepWiki-assisted exploration) to ground the design in the current architecture.

### 3.1 Tool System

- **Tool definitions** live in `packages/core/src/tools/definitions/` (e.g. `coreTools.ts`, `trackerTools.ts`). Tools are declared with a name, description, and JSON schema; the **tool registry** and **scheduler** execute them and pass results back.
- **ToolResult** has `llmContent` (for model history) and **`returnDisplay`** (for the user). **`ToolResultDisplay`** in core is `string | FileDiff | AnsiOutput | TodoList | SubagentProgress`. The CLI’s **`ToolResultDisplay`** component (`packages/cli/src/ui/components/messages/ToolResultDisplay.tsx`) branches on type: JSON, markdown, ANSI, file diff, todos, subagent progress, or plain text.
- **Existing “visualize” precedent:** `tracker_visualize` renders an **ASCII tree** of the task graph and returns a string as `returnDisplay`. So the pattern of “tool that produces a visual representation” already exists; this project generalizes it to **rich graphics** and **Mermaid-driven diagrams**.

### 3.2 Slash Commands and Routing

- **Slash commands** are loaded by `CommandService` from `BuiltinCommandLoader`, file-based commands (`.gemini/commands/`), and MCP prompt loaders. Parsing is done in `parseSlashCommand`; execution is handled in `slashCommandProcessor.ts`. A command can return a **tool action** (e.g. schedule a tool with args), a **message**, or **submit_prompt**.
- Adding a **`/visualize`** slash command that schedules the `visualize` tool with user-supplied or default arguments fits this model.

### 3.3 Agent and Explain Flow

- The **CodebaseInvestigatorAgent** (and main agent) use `read_file`, `grep_search`, `glob`, and related tools to analyze code and answer questions. There is no dedicated “explain” command; “explain this architecture” is handled as a normal user prompt. The agent can be given a **`visualize`** tool and instructed (via system prompt / tool description) to call it when a diagram would help—e.g. after analyzing the codebase, output Mermaid and call `visualize` so the user sees a diagram inline.

### 3.4 Display Pipeline

- **HistoryItemDisplay** → **ToolGroupMessage** → **ToolMessage** / **ShellToolMessage** → **ToolResultDisplay**. `resultDisplay` flows from tool response through `toolMapping.ts` into history. Supporting a new display type (e.g. **terminal image** or **passthrough ANSI** that contains image escape sequences) requires either:
  - Extending **`ToolResultDisplay`** in core and the CLI’s **ToolResultDisplay** component to support an **inline image** type (e.g. `{ type: 'terminal_image', protocol, data }` or raw escape string), or
  - Having the tool return a **string** that is the exact escape sequence for the detected terminal; the CLI then renders it as “passthrough” text (no markdown/JSON parsing), so the terminal interprets the sequence. The second approach avoids core type changes but requires the tool to know terminal capability; the first keeps terminal detection in the CLI and is clearer long-term.

---

## 4. Proposed Solution Overview

### 4.1 Goals

1. **Inline diagram rendering:** Architecture (sequence, class, ERD, flowchart) and dependency/git visualizations generated from codebase analysis or user/model-provided Mermaid, rendered in the terminal when the terminal supports graphics.
2. **Terminal image protocols:** Support Sixel, iTerm2 inline images, and Kitty graphics protocol, with **detection** of the current terminal and **fallback** to ASCII/ANSI box-drawing or plain Mermaid source when unsupported.
3. **New `visualize` tool:** The agent (and optionally the user via `/visualize`) can request a diagram by providing Mermaid source; the tool returns a displayable result (image escape sequence or fallback text).
4. **Explain integration:** System prompt and tool description encourage the agent to call `visualize` when explaining architecture or flows, so “explain the authentication flow” can yield a sequence diagram inline.
5. **Caching:** Rendered images keyed by content (e.g. hash of Mermaid + options) to avoid regeneration.
6. **Future-ready:** Design allows later addition of “live preview” for HTML/CSS/React (render to image via headless browser, then same terminal image path).

### 4.2 Non-Goals (Out of Scope for 175h)

- Full WYSIWYG UI preview (e.g. interactive React in terminal): only **static image** preview in this phase.
- Editing diagrams in the CLI: view-only.
- New sub-agent dedicated to “diagram generation”: the main agent (and codebase investigator when used) gets the `visualize` tool; no new agent type.

---

### 4.3 Live Preview of Generated UI (Stretch / Post-GSoC)

The GSoC idea lists "Live preview of generated frontend components (HTML/CSS/React) rendered as terminal images." Within 175 hours, the **architecture** will support it: the same terminal-image pipeline (render to PNG, encode for protocol, display) can be fed by a different source (e.g. a headless browser screenshot of a small HTML/React snippet) instead of Mermaid. Delivering a full "generate React component and show pixel-perfect preview" flow is left as a follow-on; this proposal ensures the pipeline is in place and documented so that adding a second tool (e.g. `preview_component`) is straightforward.

---

## 5. Technical Design

### 5.1 Data Flow

```text
User: "Explain the auth flow"
    → Agent uses read_file / grep / codebase_investigator
    → Agent produces Mermaid (e.g. sequenceDiagram) in reasoning
    → Agent calls visualize({ mermaidCode: "..." })
    → Visualize tool:
         1. Check cache (hash(mermaidCode))
         2. If miss: render Mermaid → SVG/PNG (e.g. @mermaid-js/mermaid-cli or mermaid-isomorphic)
         3. Detect terminal (TERM_PROGRAM, etc.)
         4. Encode image for protocol (Sixel / iTerm2 / Kitty) or generate ASCII fallback
         5. Return ToolResult { llmContent, returnDisplay }
    → returnDisplay type: new "terminal_image" or passthrough string
    → ToolResultDisplay (CLI) emits escape sequence or ASCII to terminal
```

### 5.2 Terminal Detection and Protocol Priority

- **Detection:** Use `process.env.TERM_PROGRAM`, `TERM`, and optional `GEMINI_CLI_TERMINAL_GRAPHICS` (override). Map to:
  - **Kitty:** `TERM_PROGRAM=kitty` or similar → Kitty graphics protocol.
  - **iTerm2:** `TERM_PROGRAM=iTerm.app` → iTerm2 inline images.
  - **Sixel:** Windows Terminal, VS Code terminal, WezTerm, etc., when Sixel is supported (e.g. `TERM` hints or explicit opt-in).
- **Priority:** Prefer Kitty → iTerm2 → Sixel → ASCII/ANSI fallback. If no graphics support, return a **string** that is either ASCII-art (e.g. from a simple Mermaid-to-ASCII or flowchart-to-ASCII helper) or the raw Mermaid code block so the user can paste into a viewer.

### 5.3 Mermaid Rendering

- **Libraries:** Use **@mermaid-js/mermaid-cli** (official, Puppeteer-based) or **mermaid-isomorphic** (Playwright) for server-side render of Mermaid → SVG/PNG. Choice depends on dependency policy (Puppeteer vs Playwright). SVG is preferred for scaling; PNG is required for Sixel/iTerm2/Kitty (raster). Pipeline: Mermaid → SVG → rasterize to PNG if needed → encode for protocol.
- **Sandboxing:** Rendering may run in a sandboxed subprocess or use an existing headless browser already used by the project (if any) to avoid unbounded resource use.

### 5.4 Caching Layer

- **Key:** `hash(mermaidCode + options)` (options = theme, size, output format). Store under `os.tmpdir()/gemini/visualize/` or user cache dir with a size/age policy (e.g. max 100 entries, evict oldest).
- **Lookup:** Before rendering, compute key; if hit, load cached image bytes and encode for current terminal (encoding can still be terminal-dependent; only the raster/SVG is cached).

### 5.5 ToolResultDisplay Extension

- **Option A (recommended):** Extend **ToolResultDisplay** in core to a union that includes e.g. `{ type: 'terminal_image', protocol: 'sixel'|'iterm2'|'kitty', data: string }` (base64 or raw escape sequence). CLI **ToolResultDisplay** component checks for this and outputs the string as raw (no markdown/ANSI parsing), so the terminal interprets escapes.
- **Option B:** Tool returns a **string** that is the full escape sequence. CLI treats it as “passthrough” for that tool (e.g. `renderOutputAsMarkdown: false` and ensure no escaping). Simpler but pushes protocol choice into the tool (tool must know terminal type via env or a small helper).

Option A keeps terminal capability in the CLI and makes testing and fallback logic centralized.

---

## 6. Component Specifications

### 6.1 New Tool: `visualize`

- **Name:** `visualize` (tool name constant in `tool-names.ts`, definition in a new file under `packages/core/src/tools/definitions/`, e.g. `visualizeTools.ts`).
- **Parameters (JSON schema):**
  - `mermaidCode` (string, required): Mermaid diagram source.
  - `diagramType` (string, optional): `sequenceDiagram` | `flowchart` | `classDiagram` | `erDiagram` | `stateDiagram` | `gantt` | `pie` (hint for validation/theme; can be inferred from content).
  - `title` (string, optional): Caption for the diagram.
- **Behavior:**
  - Validate `mermaidCode` (basic sanity check).
  - Compute cache key; if hit, load cached image.
  - If miss: invoke Mermaid renderer (SVG then PNG if needed).
  - Detect terminal; encode image (Sixel/iTerm2/Kitty) or generate ASCII/fallback.
  - Return **ToolResult** with `returnDisplay` as the new terminal_image type or passthrough string, and `llmContent` summarizing what was rendered (e.g. “Rendered sequence diagram (3 participants, 5 steps).”).
- **Registration:** Add to tool registry and to model tool sets (e.g. in `coreTools.ts` or a separate set for “display” tools) so the agent can call it.

### 6.2 Terminal Image Encoder Module

- **Location:** New module under `packages/core` (e.g. `packages/core/src/utils/terminalImage.ts`) or under `packages/cli` if CLI owns terminal capability. Prefer core if the tool lives in core and returns a structured display type; then CLI only renders.
- **API:**
  - `detectTerminalGraphics(): 'kitty' | 'iterm2' | 'sixel' | 'none'`
  - `encodeImageToProtocol(imageBuffer: Buffer, protocol: string, options?: { width?, height? }): string` (returns escape sequence)
  - `renderToAsciiFallback(svgOrPngBuffer: Buffer, maxWidth: number): string` (optional; or return Mermaid source)
- **Dependencies:** Use existing Node libraries for Sixel/Kitty/iTerm2 encoding (e.g. node-iterm2-image, or a small vendor/implementation). If no mature library exists for all three, implement Kitty and iTerm2 first (well-documented protocols), then Sixel.

### 6.3 Mermaid Renderer Service

- **Location:** `packages/core/src/services/mermaidRenderer.ts` (or similar). Responsible for:
  - Calling `@mermaid-js/mermaid-cli` or mermaid-isomorphic with `mermaidCode`.
  - Returning SVG and/or PNG buffer, with timeout and size limits.
- **Configuration:** Optional config (e.g. theme, background) via existing config storage; defaults for first version.

### 6.4 Caching Layer

- **Location:** `packages/core/src/services/visualizeCache.ts`. In-memory or disk cache keyed by content hash; TTL or max size to avoid unbounded growth. Used by the `visualize` tool before calling the Mermaid renderer.

### 6.5 Slash Command `/visualize`

- **Definition:** In `BuiltinCommandLoader`, add a command (e.g. `visualizeCommand`) that accepts optional args: path to file containing Mermaid, or inline Mermaid. Action: schedule `visualize` tool with parsed `mermaidCode`. If no args, show short help (e.g. “Usage: /visualize <mermaid file or paste diagram after command”).

### 6.6 Explain Integration

- **System prompt / tool description:** Update agent system prompt (or the tool’s description) to state that when the user asks to “explain architecture,” “show data flow,” “show dependency graph,” or similar, the agent should produce Mermaid when appropriate and call the `visualize` tool so the user sees a diagram. No new “explain” command required; the existing chat flow plus the new tool achieves “Explain this architecture → diagram rendered.”

### 6.7 Dependency and Git Visualizations

- **Dependency graph:** A separate tool or an optional mode of `visualize`: e.g. `visualize({ source: 'package.json' })` or `visualize({ source: 'requirements.txt' })`. Implementation reads the file, builds a dependency graph (or uses existing dependency parsing if present), generates Mermaid (e.g. flowchart or graph), then reuses the same Mermaid → image → terminal pipeline. Can be Phase 2 (post-MVP) if time is tight.
- **Git history:** Similarly, a small helper that runs `git log` / `git branch` and produces Mermaid (e.g. git graph) and calls the same render path. Optional for 175h; can be scoped as “design + stub” and implemented if time permits.

---

## 7. Integration Points

| Area | Integration |
|------|-------------|
| **Tool registry** | Register `visualize` in `ALL_BUILTIN_TOOL_NAMES`, add definition and invocation in core (mirroring `tracker_visualize` pattern). |
| **ToolResultDisplay (core)** | Extend `ToolResultDisplay` type with `TerminalImage` variant; ensure serialization/rewind compatibility. |
| **ToolResultDisplay (CLI)** | In `ToolResultDisplay.tsx`, branch on `terminal_image` (or passthrough) and output raw escape sequence. |
| **Config** | Optional: `visualize.cacheDir`, `visualize.theme`, `terminal.graphics` override. |
| **Non-interactive mode** | When not in TTY or in non-interactive mode, `visualize` can return `llmContent` plus a fallback `returnDisplay` (e.g. “Diagram generated (view in interactive mode)” or save to file path). |

---

## 8. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| **Headless browser dependency (Puppeteer/Playwright)** | Prefer `@mermaid-js/mermaid-cli` with optional dependency or lazy load; document minimal setup. If too heavy, evaluate lightweight SVG-only renderers and rasterize only when needed for terminal protocols. |
| **Terminal support fragmentation** | Implement detection and graceful fallback; default to ASCII or Mermaid source so every terminal still gets useful output. |
| **Large images / memory** | Enforce max dimensions and timeouts in Mermaid renderer; cap cache size and age. |
| **Agent over-calling `visualize`** | Tool description should guide “when a diagram adds value”; rate or cost not required in first version. |

---

## 9. Implementation Timeline

Total: **175 hours** (≈ 12 weeks at ~15 h/week, or 8 weeks at ~22 h/week).

| Phase | Tasks | Hours (est.) |
|-------|--------|--------------|
| **1. Foundation** | Terminal detection, protocol encoder (Kitty + iTerm2 + Sixel), ASCII/fallback; extend `ToolResultDisplay` type and CLI renderer | 35 |
| **2. Mermaid pipeline** | Mermaid renderer service (SVG/PNG), integrate with tool; cache layer (key, store, lookup) | 30 |
| **3. `visualize` tool** | Tool definition, params, invocation, wiring to Mermaid + encoder + cache; unit tests | 25 |
| **4. Explain integration** | System prompt / tool description updates; manual testing with “explain architecture” prompts | 15 |
| **5. Slash command & UX** | `/visualize` command; help text; optional dependency/git visualization (stub or minimal) | 25 |
| **6. Polish & docs** | Non-interactive fallback, config options, documentation (user-facing and contributor), tests | 45 |

Buffer for integration issues and code review: already absorbed in the above. If dependency/git visualization is dropped to stay on time, Phase 5 can be reduced and Phase 6 expanded.

---

## 10. Expected Outcomes and Deliverables

- **Inline rendering** of architecture diagrams (sequence, class, ERD, flowchart) from agent-generated or user-provided Mermaid.
- **Support for multiple terminal image protocols:** Sixel, iTerm2, Kitty, with **intelligent ASCII/ANSI fallback** for unsupported terminals.
- **New tool `visualize`** for on-demand diagram generation (Mermaid in → image or fallback out).
- **Integration with explain flow:** “Explain this architecture” can result in a rendered diagram inline via agent calling `visualize`.
- **Caching layer** for rendered images to avoid regeneration.
- **Optional:** `/visualize` slash command; dependency graph (package.json/requirements.txt) and git history visualization (stub or minimal).
- **Documentation** for users (how to use `/visualize`, when diagrams appear) and contributors (how to add a new protocol or diagram source).

---

## 11. About the Applicant

> _[Your name, university, degree program, expected graduation]_

_[Short paragraph on why this project interests you and how it fits your skills.]_

Relevant experience:

- **TypeScript/Node.js:** _[e.g. CLI tools, build tools, or previous GSoC/OSS]_  
- **Terminal/CLI UX:** _[e.g. ANSI, TUI libraries, or terminal graphics]_  
- **Diagrams/visualization:** _[e.g. Mermaid, D3, or similar]_  
- **Open source:** _[2–3 links to PRs or projects]_

**GitHub:** [link]  
**Email:** [email]  
**Timezone:** [timezone]

---

## References

- [Gemini CLI repository](https://github.com/google-gemini/gemini-cli)
- [Mermaid.js](https://mermaid.js.org/) / [@mermaid-js/mermaid-cli](https://www.npmjs.com/package/@mermaid-js/mermaid-cli)
- [Kitty graphics protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/)
- [iTerm2 inline images](https://iterm2.com/documentation-images.html)
- [Sixel (Wikipedia)](https://en.wikipedia.org/wiki/Sixel)
- **Research:** DeepWiki MCP was used to query the gemini-cli repo for: (1) how slash commands are defined and how user input is routed to commands vs the agent, (2) how tool results and returnDisplay flow from execution to the terminal UI (ToolResultDisplay, HistoryItemDisplay, tool mapping), (3) how the codebase investigator and explain-style flows work (read_file, grep, glob, delegation to sub-agents). Codebase grep and file reads confirmed ToolResult/ToolResultDisplay types, tracker_visualize pattern, and BuiltinCommandLoader structure.
