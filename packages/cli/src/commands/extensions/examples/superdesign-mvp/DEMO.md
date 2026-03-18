# Demo Script (3-5 minutes)

## Pre-demo checklist

1. `npm install` has been run in this extension folder.
2. Extension is linked: `gemini extensions link .`
3. Gemini CLI restarted after linking.
4. A browser window is ready to open local files.

## Live walkthrough

### 0:00-1:00 Initialize with prompt-seeded design

Run:

```text
/design:init beautiful origami chat app with folded-paper bubbles and serene minimalism
```

Say:

- "This creates a persistent project with state and event history."
- "Init already seeds inspiration, derives tokens, and applies an active variant."
- "The canvas opens automatically with the first themed direction."

Project output path is under `.superdesign-runtime/projects/<project-id>/`.

### 1:00-1:40 Refine inspiration (optional)

Run:

```text
/design:add brutalist typography, high contrast hero, clear CTA hierarchy
/design:add reference: editorial landing page with warm accent and premium tone
```

Say:

- "Inspiration is stored structurally, not as ephemeral prompt text."
- "This lets us derive a consistent design language."

### 1:40-2:20 Iterate active design

Run:

```text
/design:iterate softer paper shadows and tighter message spacing
```

### 2:20-2:50 Generate and apply alternatives

Run:

```text
/design:gen 3 minimal
/design:apply 2
```

Say:

- "Variants are deterministic HTML-first structures."
- "I can select by index for faster iteration."

### 2:50-3:40 Undo/redo control

Run:

```text
/design:undo
/design:redo
```

Say:

- "Changes are tracked as event snapshots."
- "Undo/redo is reliable because it is state-based."

### 3:40-4:20 Export handoff

Run:

```text
/design:export html
```

Say:

- "Now we export the finalized HTML artifact and token JSON."
- "Engineering can code production UI after design direction is finalized."

## Fallback recovery steps

- If wrappers do not appear: run `/commands reload`, then restart Gemini CLI.
- If no active project error appears: rerun `/design:init`.
- If canvas appears stale: wait 1-2 seconds for polling refresh, then run one iterate command.
- If variant apply fails: run `/design:gen 3` then `/design:apply 1`.
