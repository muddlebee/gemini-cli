# GSoC Proposal: Expanding Gemini CLI IDE Integration — JetBrains, Neovim, and Zed

**Project:** Google Gemini CLI  
**Organization:** Google  
**Program:** Google Summer of Code  
**Difficulty:** Hard  
**Size:** Large (350 hours)

---

## Table of Contents

1. [Abstract](#1-abstract)
2. [Motivation and Problem Statement](#2-motivation-and-problem-statement)
3. [Current State of Gemini CLI IDE Integration](#3-current-state-of-gemini-cli-ide-integration)
4. [Proposed Solution Overview](#4-proposed-solution-overview)
5. [Common IDE Context Protocol](#5-common-ide-context-protocol)
6. [JetBrains Plugin — Detailed Design](#6-jetbrains-plugin--detailed-design)
7. [Neovim Integration — Architecture Proposal](#7-neovim-integration--architecture-proposal)
8. [Zed Integration — Architecture Proposal](#8-zed-integration--architecture-proposal)
9. [IDE Detection Improvements](#9-ide-detection-improvements)
10. [Reference Implementation Analysis](#10-reference-implementation-analysis)
11. [Risks and Mitigations](#11-risks-and-mitigations)
12. [12-Week Implementation Plan](#12-12-week-implementation-plan)
13. [Expected Outcomes and Deliverables](#13-expected-outcomes-and-deliverables)
14. [About the Applicant](#14-about-the-applicant)

---

## 1. Abstract

Gemini CLI currently provides first-class IDE integration only for VS Code and its forks. This proposal describes a plan to expand that integration to three additional editors — JetBrains IDEs (IntelliJ IDEA, PyCharm, WebStorm, etc.), Neovim, and Zed — while also establishing a **Common IDE Context Protocol** that makes future editor integrations straightforward and consistent.

The approach is **companion-first**: every new integration implements Gemini CLI's existing companion contract (MCP over HTTP, discovery file, `ide/contextUpdate`, diff tools) without requiring changes to Gemini CLI's core. The JetBrains plugin is the primary implementation deliverable. Neovim and Zed are fully specified and architecturally grounded, positioned as follow-on phases that reuse the same normalized context model.

---

## 2. Motivation and Problem Statement

Gemini CLI's IDE integration is one of its most powerful features: synchronized file state, cursor awareness, and native in-editor diffing make it feel like a true coding partner rather than a terminal tool. Today, that experience is exclusive to VS Code users.

This creates a real gap:

- **JetBrains IDEs** (IntelliJ IDEA, PyCharm, WebStorm, GoLand, Rider, CLion) collectively serve tens of millions of developers — many of them in enterprise Java, Python, and web stacks where Gemini CLI is most useful for large-scale refactors and code generation.
- **Neovim** is the dominant terminal-native editor among power users and developers who already live in the terminal — exactly the audience most likely to use Gemini CLI.
- **Zed** is a fast-growing modern editor with a built-in AI focus; its users expect deep CLI tool integration.

Without IDE integration in these editors, users get a degraded experience: Gemini CLI cannot see what file they are working on, cannot open diffs natively, and cannot use workspace context to improve response quality. They are forced to copy-paste file contents manually or switch to VS Code.

The fix is not to build three separate bespoke integrations. The fix is to **formalize the companion contract** that already exists in Gemini CLI's VSCode implementation, then implement it consistently across editors. This proposal does exactly that.

---

## 3. Current State of Gemini CLI IDE Integration

### 3.1 What Exists Today

Gemini CLI's IDE integration is built around a clean local communication model defined in [`docs/ide-integration/ide-companion-spec.md`](../ide-integration/ide-companion-spec.md). The VS Code companion (`packages/vscode-ide-companion`) is the reference implementation. The key components are:

| Component | Location | Role |
|---|---|---|
| `IDEServer` | `ide-server.ts` | Express HTTP server hosting MCP endpoint, session management, keep-alive |
| `OpenFilesManager` | `open-files-manager.ts` | Tracks open files, cursor, selection; sends `ide/contextUpdate` |
| `DiffManager` | `diff-manager.ts` | Opens VS Code diff editor, fires `ide/diffAccepted` / `ide/diffRejected` |
| `IdeClient` | `packages/core/src/ide/ide-client.ts` | CLI-side MCP client, connects via discovery file |
| `IdeContextStore` | `packages/core/src/ide/ideContext.ts` | Normalizes and stores context received from IDE |
| Discovery utils | `packages/core/src/ide/ide-connection-utils.ts` | Reads discovery files, traverses process tree |

### 3.2 The Companion Contract

The spec defines four interfaces that any companion plugin must implement:

1. **Transport:** MCP over HTTP on a loopback port (dynamically assigned, port `0`).
2. **Discovery:** A JSON file at `os.tmpdir()/gemini/ide/gemini-ide-server-${PID}-${PORT}.json` containing `port`, `workspacePath`, `authToken`, and `ideInfo`.
3. **Context:** An `ide/contextUpdate` MCP notification with an `IdeContext` payload (open files, active file, cursor, selection).
4. **Diffing:** `openDiff` and `closeDiff` MCP tools, plus `ide/diffAccepted` and `ide/diffRejected` notifications.

### 3.3 What Is Missing

- No JetBrains companion plugin exists.
- No Neovim integration exists.
- Zed has no companion extension.
- The `ide/contextUpdate` payload shape and discovery file format are documented but there is no shared schema or language-agnostic reference that non-TypeScript implementations can consume.
- IDE detection (`/ide install`) only handles VS Code and its forks.

---

## 4. Proposed Solution Overview

### 4.1 Guiding Principles

1. **Companion-first, core-stable.** Every new integration implements the existing Gemini CLI companion contract. No mandatory changes to `packages/core` are required for MVP compatibility.
2. **One external protocol.** Gemini's MCP-over-HTTP companion model is the only external wire protocol. No second competing protocol is introduced.
3. **Shared internal model.** A normalized editor-state schema is defined once and mapped into Gemini's external contract by each editor adapter. This is an internal compatibility primitive, not a new public API.
4. **JetBrains first.** The JetBrains plugin is the concrete implementation deliverable. Neovim and Zed are fully specified and architecturally grounded but are phase-two implementations.

### 4.2 Deliverables at a Glance

| Deliverable | Type | Phase |
|---|---|---|
| Common IDE Context Protocol spec | Documentation + JSON schema | Phase 1 |
| `packages/jetbrains-ide-companion` — full plugin | Kotlin/Gradle IntelliJ plugin | Phase 1 |
| Neovim integration architecture + Lua prototype | Lua plugin + bridge spec | Phase 2 (specified in Phase 1) |
| Zed integration architecture | Zed extension spec | Phase 2 (specified in Phase 1) |
| IDE detection improvements (`/ide install` for JetBrains) | Gemini CLI core (optional) | Phase 1 stretch goal |
| Setup and troubleshooting documentation | Markdown | Phase 1 |

---

## 5. Common IDE Context Protocol

### 5.1 Purpose

The Common IDE Context Protocol is not a new wire protocol. It is a set of **language-agnostic JSON schemas and a design document** that:

- Defines the canonical shapes for the discovery record, editor snapshot, context update payload, and diff session metadata.
- States explicitly that Gemini's companion spec is the external contract; these schemas are internal compatibility primitives.
- Gives future Neovim and Zed implementors a single reference so they do not re-derive the payload shapes from the TypeScript source.

### 5.2 Location

```
packages/ide-companion-protocol/
├── README.md                    # Design rationale and usage guide
├── schemas/
│   ├── discovery-record.json    # JSON Schema for the discovery file
│   ├── editor-snapshot.json     # Normalized editor state shape
│   ├── context-update.json      # ide/contextUpdate payload (mirrors IdeContext)
│   └── diff-session.json        # Diff session metadata
└── CHANGELOG.md
```

### 5.3 Normalized Editor State Model

Every editor companion maps its native APIs into this internal model before serializing to Gemini's external format:

```typescript
// Internal normalized model — not a wire format
interface EditorSnapshot {
  workspaceRoots: string[];          // Absolute paths to workspace root(s)
  openFiles: OpenFileEntry[];        // All open files, sorted by last focus
  activeFile: ActiveFileEntry | null;
  isTrusted: boolean;                // Workspace trust; default true for editors without this concept
  diffSession: DiffSessionMeta | null;
}

interface OpenFileEntry {
  path: string;         // Absolute on-disk path (virtual/unsaved files excluded)
  timestamp: number;    // Unix ms of last focus
}

interface ActiveFileEntry extends OpenFileEntry {
  isActive: true;
  cursor: { line: number; character: number } | null;  // 1-based
  selectedText: string | null;                          // Raw, pre-truncation
}

interface DiffSessionMeta {
  filePath: string;
  status: 'open' | 'accepted' | 'rejected' | 'closed';
}
```

### 5.4 Mapping to Gemini's External Contract

The `ide/contextUpdate` payload is derived directly from `EditorSnapshot`:

```
EditorSnapshot.workspaceRoots    → discovery file workspacePath
EditorSnapshot.openFiles         → IdeContext.workspaceState.openFiles (timestamp, path)
EditorSnapshot.activeFile        → openFiles entry with isActive: true, cursor, selectedText
EditorSnapshot.isTrusted         → IdeContext.workspaceState.isTrusted
```

Truncation (10 files, 16 KiB selection) is applied by the CLI's `IdeContextStore`, not by the companion. Companions should apply the same limits as a best-effort measure to avoid sending oversized payloads.

---

## 6. JetBrains Plugin — Detailed Design

### 6.1 Module Location and Structure

A new standalone Gradle/Kotlin module is created at `packages/jetbrains-ide-companion/`. It does **not** extend or depend on any existing Continue plugin or Continue runtime.

```
packages/jetbrains-ide-companion/
├── build.gradle.kts
├── gradle.properties            # platformVersion, pluginVersion, sinceBuild
├── settings.gradle.kts
├── src/
│   └── main/
│       ├── kotlin/com/google/gemini/ide/jetbrains/
│       │   ├── GeminiPluginStartupActivity.kt
│       │   ├── bridge/
│       │   │   ├── BridgeLifecycleService.kt
│       │   │   ├── McpHttpServer.kt
│       │   │   └── AuthTokenProvider.kt
│       │   ├── discovery/
│       │   │   └── DiscoveryFileManager.kt
│       │   ├── context/
│       │   │   ├── EditorContextTracker.kt
│       │   │   └── ContextDebouncer.kt
│       │   ├── diff/
│       │   │   ├── GeminiDiffManager.kt
│       │   │   └── DiffSessionState.kt
│       │   ├── terminal/
│       │   │   └── TerminalEnvSyncService.kt
│       │   └── tools/
│       │       ├── OpenDiffToolHandler.kt
│       │       ├── CloseDiffToolHandler.kt
│       │       └── OpenFileToolHandler.kt
│       └── resources/
│           └── META-INF/plugin.xml
└── src/test/kotlin/...
```

### 6.2 Plugin Architecture

The plugin is **headless** — no tool window, no webview, no embedded browser, no Continue binary bridge. It is a pure background service plugin.

```
JetBrains IDE Process
┌─────────────────────────────────────────────────────────┐
│  GeminiPluginStartupActivity                            │
│    └── BridgeLifecycleService (project service)         │
│          ├── McpHttpServer  ◄──── MCP over HTTP ────────┼──► Gemini CLI
│          │     ├── openDiff tool                        │
│          │     ├── closeDiff tool                       │
│          │     └── jetbrains.openFile tool              │
│          ├── DiscoveryFileManager                       │
│          │     └── writes /tmp/gemini/ide/gemini-ide-server-{PID}-{PORT}.json
│          ├── EditorContextTracker                       │
│          │     ├── FileEditorManagerListener            │
│          │     ├── CaretListener                        │
│          │     ├── SelectionListener                    │
│          │     └── ContextDebouncer (50ms)              │
│          │           └── sends ide/contextUpdate ───────┼──► Gemini CLI
│          ├── GeminiDiffManager                          │
│          │     └── IntelliJ DiffManager API             │
│          └── TerminalEnvSyncService                     │
│                └── TerminalCustomEnvProvider EP         │
└─────────────────────────────────────────────────────────┘
         │ writes
         ▼
  /tmp/gemini/ide/gemini-ide-server-{PID}-{PORT}.json
```

### 6.3 Subsystem Details

#### `BridgeLifecycleService`

A `@Service(Service.Level.PROJECT)` that owns the full lifecycle of the bridge for one IDE project window. One instance per open project.

- `startBridge()`: starts `McpHttpServer`, obtains the assigned port, generates an auth token via `AuthTokenProvider`, writes the discovery file via `DiscoveryFileManager`, registers terminal env vars via `TerminalEnvSyncService`, starts `EditorContextTracker`.
- `stopBridge()`: stops the MCP server, deletes the discovery file, clears terminal env vars.
- Registered as a `ProjectCloseListener` to call `stopBridge()` on IDE window close.

#### `McpHttpServer`

An embedded HTTP server (using `com.sun.net.httpserver.HttpServer` or Ktor's embedded engine — Ktor is preferred for its coroutine-native model and is already available in IntelliJ's classpath via bundled libraries).

- Listens on port `0` (OS-assigned); reads the actual port after binding.
- Exposes a single `/mcp` endpoint implementing the MCP Streamable HTTP transport (SSE for server-to-client notifications, POST for client-to-server requests).
- Auth middleware: validates `Authorization: Bearer <token>` on every request; returns `401` on failure.
- Host header check: rejects requests where `Host` is not `localhost:{port}` or `127.0.0.1:{port}`.
- Keep-alive: sends a ping every 60 seconds; if 3 consecutive pings are missed, cleans up the session.
- Registers MCP tools: `openDiff`, `closeDiff`, `jetbrains.openFile`.
- Sends MCP notifications: `ide/contextUpdate`, `ide/diffAccepted`, `ide/diffRejected`.

#### `DiscoveryFileManager`

- Creates `$TMPDIR/gemini/ide/` if it does not exist, with permissions `700`.
- Writes `gemini-ide-server-${PID}-${PORT}.json` with permissions `600`.
- PID is obtained via `ProcessHandle.current().pid()`.
- `workspacePath` is the project's base directory (`project.basePath`), joined by the OS path separator for multi-root projects.
- `ideInfo.name`: `"jetbrains"`. `ideInfo.displayName`: the product name from `ApplicationInfo.getInstance().fullApplicationName` (e.g., `"IntelliJ IDEA"`).
- Deletes the file on `stopBridge()` and on JVM shutdown hook.

#### `AuthTokenProvider`

- Generates a UUID via `java.util.UUID.randomUUID().toString()` on each `startBridge()` call.
- Holds the token in memory only; never persisted to disk beyond the discovery file.

#### `EditorContextTracker`

Subscribes to IntelliJ's event bus to build and maintain an `EditorSnapshot`:

| Event | IntelliJ API | Action |
|---|---|---|
| File opened / focused | `FileEditorManagerListener.fileOpened` | Add to open files, update timestamp, set as active |
| File closed | `FileEditorManagerListener.fileClosed` | Remove from open files |
| File renamed | `VirtualFileListener.propertyChanged` (PROP_NAME) | Update path in open files list |
| File deleted | `VirtualFileListener.fileDeleted` | Remove from open files |
| Caret moved | `CaretListener.caretPositionChanged` | Update cursor on active file entry |
| Selection changed | `SelectionListener.selectionChanged` | Update selectedText on active file entry |

All events feed into `ContextDebouncer`, which coalesces updates within a 50 ms window. On flush, the debouncer serializes the current `EditorSnapshot` to an `IdeContext` payload and sends an `ide/contextUpdate` notification to all active MCP sessions via `McpHttpServer`.

Limits enforced before sending:
- `openFiles` capped to 10 entries (most recent by timestamp).
- `selectedText` capped to 16,384 characters (appends `"... [TRUNCATED]"`).
- Only files with an absolute on-disk path are included (virtual/unsaved files excluded).

#### `GeminiDiffManager`

Uses IntelliJ's native `com.intellij.diff.DiffManager` API for the MVP diff implementation. This matches Gemini's `openDiff` semantics (show diff, wait for accept/reject) without requiring a custom streaming diff UI.

**`openDiff(filePath, newContent)`:**
1. Resolves `filePath` to a `VirtualFile` via `LocalFileSystem.getInstance().findFileByPath()`.
2. Reads current file content from `FileDocumentManager.getInstance().getDocument(vf)`.
3. Creates a `SimpleDiffRequest` with two `DocumentContent` objects: original and proposed.
4. Opens the diff via `DiffManager.getInstance().showDiff(project, request)`.
5. Registers listeners on the diff panel for accept (save action) and reject (close without save) to fire `ide/diffAccepted` or `ide/diffRejected` notifications.
6. Enforces one active diff at a time: if a diff is already open, returns an error.

**`closeDiff(filePath)`:**
1. Looks up the active diff session for `filePath`.
2. Reads the file's current content.
3. Closes the diff editor programmatically.
4. Returns the current file content in the `closeDiff` response.

**`DiffSessionState`:** Tracks `filePath → DiffSession` with status `open | accepted | rejected | closed`. Thread-safe via `ConcurrentHashMap`.

#### `TerminalEnvSyncService`

Injects environment variables into all integrated terminals opened within the project. Uses the `TerminalCustomEnvProvider` extension point (available since IDEA 2022.3) to provide:

- `GEMINI_CLI_IDE_SERVER_PORT` → the MCP server port
- `GEMINI_CLI_IDE_WORKSPACE_PATH` → the workspace path(s)
- `GEMINI_CLI_IDE_AUTH_TOKEN` → the auth token

These are set on `startBridge()` and cleared on `stopBridge()`. New terminal tabs opened after bridge start will automatically inherit the variables. Existing terminal tabs are not retroactively updated (a known limitation; documented in the README).

#### `OpenFileToolHandler`

Implements the `jetbrains.openFile(path, line?, column?)` MCP tool:

1. Resolves `path` to a `VirtualFile`.
2. Opens the file in the editor via `FileEditorManager.getInstance(project).openFile(vf, true)`.
3. If `line` is provided, navigates the caret to `(line - 1, column - 1)` (0-based IntelliJ coordinates) via `editor.caretModel.moveToLogicalPosition(LogicalPosition(line - 1, col - 1))`.
4. Scrolls the editor to the caret position via `editor.scrollingModel.scrollToCaret(ScrollType.CENTER)`.

### 6.4 Gradle / Build Setup

```kotlin
// build.gradle.kts
plugins {
    kotlin("jvm") version "2.1.0"
    id("org.jetbrains.intellij.platform") version "2.7.2"
}

intellijPlatform {
    intellijIdeaCommunity("2024.1")   // sinceBuild = "241"
    plugins(listOf("org.jetbrains.plugins.terminal"))
}

kotlin { jvmToolchain(17) }
```

- Targets IDEA 2024.1+ (`sinceBuild = "241"`), covering all current JetBrains products on the same platform version.
- The only bundled plugin dependency is `terminal` (for `TerminalCustomEnvProvider`).
- No dependency on Continue's plugin or any Continue runtime.

### 6.5 `plugin.xml` Registration

```xml
<idea-plugin>
  <id>com.google.gemini.ide.jetbrains</id>
  <name>Gemini CLI Companion</name>
  <vendor>Google</vendor>

  <depends>com.intellij.modules.platform</depends>
  <depends optional="true" config-file="gemini-terminal.xml">
    org.jetbrains.plugins.terminal
  </depends>

  <extensions defaultExtensionNs="com.intellij">
    <postStartupActivity
      implementation="com.google.gemini.ide.jetbrains.GeminiPluginStartupActivity"/>
    <projectService
      serviceInterface="com.google.gemini.ide.jetbrains.bridge.BridgeLifecycleService"
      serviceImplementation="com.google.gemini.ide.jetbrains.bridge.BridgeLifecycleService"/>
    <notificationGroup id="Gemini CLI" displayType="BALLOON"/>
  </extensions>

  <actions>
    <action id="gemini.showBridgeInfo"
            class="com.google.gemini.ide.jetbrains.actions.ShowBridgeInfoAction"
            text="Show Gemini Bridge Info"/>
    <action id="gemini.restartBridge"
            class="com.google.gemini.ide.jetbrains.actions.RestartBridgeAction"
            text="Restart Gemini Bridge"/>
  </actions>
</idea-plugin>
```

### 6.6 Test Plan

**Unit tests** (JUnit 5, no IDE runtime required):

| Test | What it verifies |
|---|---|
| `DiscoveryFileManagerTest` | File naming pattern, JSON content fields, file permissions (600), directory creation (700), cleanup on stop |
| `AuthTokenProviderTest` | Token is a valid UUID, different token generated on each call |
| `ContextDebouncerTest` | Multiple events within 50ms produce one flush; events after 50ms produce a second flush |
| `EditorContextTrackerTest` | Open files capped at 10; selectedText truncated at 16,384 chars; virtual files excluded; timestamp ordering |
| `DiffSessionStateTest` | One active diff at a time; state transitions open → accepted/rejected → closed |
| `WorkspacePathSerializerTest` | Single root, multi-root, OS path separator on Linux vs Windows |

**Integration tests** (IntelliJ Platform Test Framework / IDE Starter):

| Test | What it verifies |
|---|---|
| `BridgeStartupTest` | Server starts, discovery file written, auth token matches file |
| `AuthMiddlewareTest` | Missing/malformed/wrong token → 401; correct token → 200 |
| `ContextUpdateFlowTest` | Open file → `ide/contextUpdate` received by mock MCP client within 100ms |
| `DiffLifecycleTest` | `openDiff` → diff editor opens; accept → `ide/diffAccepted` fired; reject → `ide/diffRejected` fired |
| `OpenFileToolTest` | `jetbrains.openFile` opens file and moves caret to correct line/column |
| `MultiProjectTest` | Two project windows → two independent discovery files with different ports |

**Manual acceptance scenarios:**

- Multiple JetBrains windows open on different repos → each has its own discovery file; CLI connects to the correct one based on `workspacePath`.
- Same workspace in two windows → `GEMINI_CLI_IDE_SERVER_PORT` env var tie-breaks correctly.
- Dirty buffer (unsaved changes) → `ide/contextUpdate` reflects on-disk path; diff opens against on-disk content.
- Stale discovery file (IDE crashed) → CLI detects dead process, skips file.
- CLI running outside workspace root → connection rejected with directory mismatch error.
- Standalone terminal with `GEMINI_CLI_IDE_PID` set → CLI connects to the specified IDE instance.
- Reconnect after IDE restart → new discovery file written; CLI reconnects on next `/ide enable`.
- Terminal opened before bridge start → does not have env vars (documented limitation).
- Terminal opened after bridge start → has all three env vars.

---

## 7. Neovim Integration — Architecture Proposal

### 7.1 Overview

Neovim users typically run the CLI in the same terminal as the editor (split panes, tmux) or in a separate terminal. The discovery file is the primary handshake mechanism because the CLI may not be a child process of Neovim. The integration is a Lua plugin that starts a lightweight local bridge process (a small Node.js or Python script) which hosts the MCP HTTP server, since Lua's async I/O is limited for running a full HTTP server.

### 7.2 Architecture

```
Neovim Process
┌─────────────────────────────────────────────────────────┐
│  gemini-cli.nvim (Lua plugin)                           │
│    ├── autocmds: BufEnter, BufLeave, CursorMoved,       │
│    │             TextYankPost, VimLeavePre               │
│    ├── EditorStateCollector                             │
│    │     └── vim.api.nvim_get_current_buf/win/cursor    │
│    └── BridgeClient (uv.tcp / vim.loop)                 │
│          └── IPC to bridge process (Unix socket / TCP)  │
└──────────────┬──────────────────────────────────────────┘
               │ IPC (JSON over Unix socket)
               ▼
  gemini-bridge (Node.js or Python process)
  ├── McpHttpServer (same contract as JetBrains)
  ├── DiscoveryFileManager
  └── AuthTokenProvider
               │ MCP over HTTP
               ▼
         Gemini CLI
```

### 7.3 Key Design Decisions

**Why a separate bridge process?**
Lua's `vim.loop` (libuv) can handle TCP connections but implementing a full MCP Streamable HTTP server with SSE in pure Lua is complex and fragile. A small bridge process (< 200 lines of Node.js using the `@modelcontextprotocol/sdk`) is more maintainable and reuses the same MCP SDK as the VSCode companion. The Lua plugin communicates with it over a Unix socket using a simple JSON-newline protocol.

**Discovery file PID:**
Neovim's PID is obtained via `vim.fn.getpid()`. The bridge process writes the discovery file with this PID (not its own), so the CLI's process-tree traversal finds the correct file when running inside Neovim's terminal.

**Context events:**
| Neovim Event | Maps to |
|---|---|
| `BufEnter` | File opened/focused, update timestamp |
| `BufLeave` | File unfocused |
| `CursorMoved`, `CursorMovedI` | Cursor position update (debounced 50ms) |
| `TextYankPost` | Selected text update |
| `BufDelete` | File closed |
| `VimLeavePre` | Stop bridge, delete discovery file |

**Diff handling:**
Neovim has no built-in diff-accept/reject UI equivalent to VS Code's diff editor. The integration uses `vim.diff()` to show a diff buffer and registers keymaps (`<leader>ga` accept, `<leader>gr` reject) that fire the appropriate notifications. This is documented clearly so users know the keybindings.

### 7.4 Shared Protocol Reuse

The Lua plugin serializes Neovim's editor state into the same `EditorSnapshot` shape defined in the Common IDE Context Protocol (Section 5). The bridge process maps this to `IdeContext` for the `ide/contextUpdate` notification. No new wire format is introduced.

---

## 8. Zed Integration — Architecture Proposal

### 8.1 Overview

Zed has a native extension system (Rust-based WASM extensions). A Zed extension can register slash commands, language servers, and — crucially — run background tasks. The Zed companion extension hosts the MCP HTTP server directly in the extension process (no separate bridge needed), using Zed's async runtime.

### 8.2 Architecture

```
Zed Process
┌─────────────────────────────────────────────────────────┐
│  gemini-cli-zed (Zed Extension, Rust/WASM)              │
│    ├── WorkspaceObserver                                │
│    │     ├── on_open_buffer → file opened               │
│    │     ├── on_active_editor_changed → active file     │
│    │     └── on_selection_changed → cursor/selection    │
│    ├── McpHttpServer (tokio async)                      │
│    │     ├── openDiff tool                              │
│    │     └── closeDiff tool                             │
│    ├── DiscoveryFileManager                             │
│    └── DiffManager                                      │
│          └── zed::Editor::open_diff (Zed diff API)      │
└──────────────────────────────────────────────────────────┘
         │ MCP over HTTP
         ▼
   Gemini CLI
```

### 8.3 Key Design Decisions

**Extension runtime:**
Zed extensions run as WASM modules with access to a subset of the Zed API. Network I/O is available via the extension host. The MCP HTTP server runs on `tokio` within the extension process.

**Workspace events:**
Zed exposes `workspace.observe_open_buffers()` and `editor.observe_selections()`. These map directly to the `EditorSnapshot` fields. The `isTrusted` field defaults to `true` (Zed has no workspace trust concept).

**Diff handling:**
Zed has a native diff view (`editor::OpenExcerpts` or the proposed `editor::Diff` API). The `openDiff` tool creates a diff buffer showing original vs. proposed content. Accept maps to saving the proposed content; reject maps to closing the diff buffer without saving.

**Discovery file PID:**
Zed's process ID is obtained via `std::process::id()`. The discovery file follows the same naming convention as all other companions.

### 8.4 Shared Protocol Reuse

The Zed extension maps Zed's buffer/editor events into the same `EditorSnapshot` model. The serialization to `IdeContext` is shared logic that can be extracted into a small Rust crate (`ide-companion-core`) if the Neovim bridge is also written in Rust, or kept inline in the extension.

---

## 9. IDE Detection Improvements

### 9.1 Current Detection

The CLI's `ide-connection-utils.ts` detects the IDE by:
1. Traversing the process tree upward from the CLI process.
2. Reading discovery files in `$TMPDIR/gemini/ide/`.
3. Matching by PID, then by workspace path.

This works well for VS Code. For JetBrains, the process tree looks different: the IDE spawns a JVM process, which spawns a terminal emulator, which spawns the shell. The CLI must traverse through the JVM process to find the discovery file.

### 9.2 Proposed Improvements

**No core changes required for MVP:** The existing process-tree traversal already handles arbitrary depth. The JetBrains plugin writes the discovery file with the correct PID (`ProcessHandle.current().pid()` of the JVM process), which the CLI will find via its existing traversal.

**`/ide install` for JetBrains (stretch goal):**
Add JetBrains to the IDE installer in `packages/core/src/ide/ide-installer.ts`:
- Detect JetBrains by checking `ideInfo.name === "jetbrains"` in the discovery file, or by checking process names (`idea`, `pycharm`, `webstorm`, etc.) in the process tree.
- The installer would open the JetBrains Plugin Marketplace URL for the Gemini CLI Companion plugin, since JetBrains does not support CLI-based plugin installation.
- Display a user-friendly message: `"To install the Gemini CLI Companion for JetBrains, open your IDE and install the plugin from: <marketplace URL>"`.

**IDE detection display name improvements:**
Update the CLI's error messages to include JetBrains-specific guidance (e.g., `"Please ensure the Gemini CLI Companion plugin is installed and enabled in your JetBrains IDE"`).

---

## 10. Prior Art and Design Rationale

### 10.1 Why a New Plugin, Not a Fork

Several existing open-source IntelliJ plugins implement IDE-to-tool bridges and serve as useful prior art for JetBrains Platform API patterns. However, none of them are suitable as a base for the Gemini CLI companion, because they solve a fundamentally different problem:

| Typical existing plugin | Gemini Companion |
|---|---|
| Embeds a JCEF browser (webview) for a GUI | No UI — pure headless background service |
| Communicates via stdio IPC with a bundled binary | Communicates via MCP over HTTP on loopback |
| Uses a proprietary message protocol | Uses Gemini's standard MCP companion contract |
| Includes auth, telemetry, autocomplete, license services | None of these — minimal surface area |

Forking any of these would mean inheriting significant complexity and then trying to remove it. Building a small, focused plugin from scratch against the Gemini companion spec is the cleaner path and produces a more maintainable result.

### 10.2 Established JetBrains Platform Patterns

The implementation draws on well-documented, stable IntelliJ Platform APIs and patterns that are common across the JetBrains plugin ecosystem:

| Pattern | JetBrains Platform API | Used for |
|---|---|---|
| VFS file operations | `VirtualFileManager`, `FileDocumentManager`, `VfsUtil` | Read, write, open, URI normalization |
| Selection and cursor tracking | `SelectionListener`, `CaretListener`, `EditorFactory.eventMulticaster` | Cursor position and selected text context |
| Document change coalescing | `DocumentListener` + coroutine debounce | Coalescing rapid edits into a single context update |
| Editor lookup by file | `FileEditorManager.getInstance(project)` | Resolving a path to an open editor instance |
| Path normalization | `FileUtil`, `VfsUtilCore.urlToPath` | Cross-platform path handling including Windows |
| Diff session registry | `ConcurrentHashMap<Editor, DiffSession>` | One active diff at a time, per-editor state |
| Gradle plugin setup | `org.jetbrains.intellij.platform` v2.x | Modern plugin build configuration, `sinceBuild = "241"` |

These are standard IntelliJ Platform idioms documented in the [IntelliJ Platform SDK](https://plugins.jetbrains.com/docs/intellij/). The Gemini companion plugin is written from scratch using these APIs directly.

### 10.3 The VSCode Companion as the Canonical Reference

The primary design reference for this project is Gemini CLI's own VSCode companion (`packages/vscode-ide-companion`). The JetBrains plugin is a faithful port of its behavior — same discovery contract, same MCP tools, same `ide/contextUpdate` payload shape, same auth model — implemented using JetBrains Platform APIs instead of VS Code APIs. This is the intended design: the companion spec exists precisely so that new editor integrations can be built without guesswork.

---

## 11. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| IntelliJ Platform API changes between IDEA versions | Medium | Medium | Pin `sinceBuild = "241"`, test against 2024.1 and 2025.1; use stable platform APIs only |
| `TerminalCustomEnvProvider` EP not available in all JetBrains products | Medium | Low | Make terminal env injection optional; document as best-effort; discovery file is the primary mechanism |
| MCP SDK for JVM not mature / missing Streamable HTTP transport | Medium | High | Evaluate `io.modelcontextprotocol:kotlin-sdk` early in community bonding; fallback to implementing the transport layer directly using Ktor |
| JetBrains diff API does not support programmatic accept/reject callbacks | Low | High | Use `FileDocumentManager` save listeners and `FileEditorManagerListener` close events as proxies for accept/reject; this pattern is well-established in the IntelliJ Platform plugin ecosystem |
| Neovim bridge process adds installation complexity | Medium | Medium | Ship bridge as a bundled script inside the Lua plugin; use `vim.fn.jobstart` to manage its lifecycle |
| Zed extension WASM sandbox restricts network I/O | Low | High | Verify Zed extension network capabilities early; fallback to a separate bridge process model (same as Neovim) |
| CLI process-tree traversal fails for JetBrains JVM process hierarchy | Low | High | Test traversal depth against actual JetBrains process trees on Linux, macOS, Windows; document `GEMINI_CLI_IDE_PID` override as fallback |
| Multiple JetBrains windows on same workspace cause connection ambiguity | Medium | Medium | `GEMINI_CLI_IDE_SERVER_PORT` env var tie-breaking is already implemented in the CLI; document clearly |

---

## 12. 12-Week Implementation Plan

### Community Bonding Period (Pre-Week 1)

- [ ] Confirm Gemini CLI companion contract against current source (`ide-companion-spec.md`, `ide-server.ts`, `ide-connection-utils.ts`).
- [ ] Evaluate `io.modelcontextprotocol:kotlin-sdk` for JVM MCP support; decide on Ktor vs. embedded HTTP server.
- [ ] Study IntelliJ Platform SDK docs for key APIs: `FileEditorManagerListener`, `CaretListener`, `SelectionListener`, `DiffManager`, `TerminalCustomEnvProvider`.
- [ ] Set up JetBrains plugin development environment; verify `runIde` task works with `intellijPlatform` v2.x.
- [ ] Finalize module boundaries and package naming with mentors.
- [ ] Draft `packages/ide-companion-protocol/` schema structure for mentor review.

### Weeks 1–2: Foundation

**Goal:** Plugin boots, MCP server accepts authenticated connections, discovery file is written.

- [ ] Create `packages/jetbrains-ide-companion/` with `build.gradle.kts`, `plugin.xml`, `GeminiPluginStartupActivity`.
- [ ] Implement `BridgeLifecycleService` skeleton (start/stop lifecycle).
- [ ] Implement `McpHttpServer` with Ktor embedded server, `/mcp` endpoint, SSE transport.
- [ ] Implement `AuthTokenProvider` (UUID generation).
- [ ] Implement auth middleware (Bearer token validation, host header check).
- [ ] Implement `DiscoveryFileManager` (file write, permissions, cleanup).
- [ ] Unit tests: `DiscoveryFileManagerTest`, `AuthTokenProviderTest`, `AuthMiddlewareTest`.
- [ ] Manual validation: `curl` the `/mcp` endpoint from a terminal inside the IDE.

**Milestone:** CLI can discover the JetBrains plugin via the discovery file and establish an authenticated MCP connection.

### Weeks 3–4: Context Tracking

**Goal:** `ide/contextUpdate` notifications flow to the CLI with correct payload.

- [ ] Implement `EditorContextTracker` with `FileEditorManagerListener`, `CaretListener`, `SelectionListener`.
- [ ] Implement `ContextDebouncer` (50ms debounce, immediate flush on active-editor change).
- [ ] Serialize `EditorSnapshot` → `IdeContext` payload.
- [ ] Apply truncation: 10 files, 16 KiB selection.
- [ ] Send `ide/contextUpdate` notification to all active MCP sessions.
- [ ] Unit tests: `ContextDebouncerTest`, `EditorContextTrackerTest`.
- [ ] Integration test: `ContextUpdateFlowTest` (mock MCP client receives notification).
- [ ] Manual validation: Run `gemini /ide status` inside the IDE; verify file list and cursor position are correct.

**Milestone:** `gemini /ide status` shows the correct open files and active cursor position from JetBrains.

### Weeks 5–6: Diff Integration

**Goal:** `openDiff` / `closeDiff` tools work; accept/reject notifications fire correctly.

- [ ] Implement `GeminiDiffManager` using IntelliJ `DiffManager.getInstance().showDiff()`.
- [ ] Implement `DiffSessionState` (one active diff at a time, state machine).
- [ ] Implement `OpenDiffToolHandler` (MCP tool handler for `openDiff`).
- [ ] Implement `CloseDiffToolHandler` (MCP tool handler for `closeDiff`).
- [ ] Wire accept/reject listeners → `ide/diffAccepted` / `ide/diffRejected` notifications.
- [ ] Unit tests: `DiffSessionStateTest`.
- [ ] Integration test: `DiffLifecycleTest`.
- [ ] Manual validation: Ask Gemini to modify a file; verify diff opens in JetBrains; accept and reject both work.

**Milestone:** Full diff workflow works end-to-end in JetBrains.

### Weeks 7–8: File Navigation, Terminal Env, Multi-Project

**Goal:** `jetbrains.openFile` works; terminal env vars are set; multiple project windows are handled correctly.

- [ ] Implement `OpenFileToolHandler` (`jetbrains.openFile` with line/column navigation).
- [ ] Implement `TerminalEnvSyncService` using `TerminalCustomEnvProvider` EP.
- [ ] Handle file rename/delete events in `EditorContextTracker`.
- [ ] Handle multi-project: verify each project window has its own `BridgeLifecycleService` instance and independent discovery file.
- [ ] Integration test: `OpenFileToolTest`, `MultiProjectTest`.
- [ ] Manual validation: all manual acceptance scenarios from Section 6.6.

**Milestone:** All MVP features complete and manually validated.

### Weeks 9–10: Tests, Documentation, Protocol Package

**Goal:** Test coverage is solid; documentation is complete; Common IDE Context Protocol package is published.

- [ ] Complete unit and integration test suite to target coverage.
- [ ] Write `packages/jetbrains-ide-companion/README.md` (build, `runIde`, discovery file location, manual curl/MCP validation, Gemini CLI connection flow, known limitations).
- [ ] Write `packages/ide-companion-protocol/README.md` and finalize JSON schemas.
- [ ] Update `docs/ide-integration/index.md` to mention JetBrains support.
- [ ] Write Neovim architecture document (this proposal's Section 7, expanded).
- [ ] Write Zed architecture document (this proposal's Section 8, expanded).
- [ ] Run manual validation matrix; file bugs for any failures.

**Milestone:** Plugin is testable by external contributors; documentation is complete.

### Weeks 11–12: Hardening, Packaging, Stretch Goals

**Goal:** Plugin is release-ready; stretch goals addressed if time permits.

- [ ] Address all bugs found during Weeks 9–10 validation.
- [ ] Performance profiling: ensure `ide/contextUpdate` does not block the EDT.
- [ ] Packaging: verify plugin ZIP is buildable via `./gradlew buildPlugin`; test installation from disk in a clean IDE.
- [ ] Stretch: Implement `/ide install` JetBrains support in `packages/core/src/ide/ide-installer.ts`.
- [ ] Stretch: Begin Neovim Lua plugin prototype (bridge process + discovery file + `ide/contextUpdate`).
- [ ] Final GSoC report material and summary blog post draft.

**Milestone:** Plugin is ready for code review and publication to JetBrains Marketplace.

---

## 13. Expected Outcomes and Deliverables

| Outcome | Deliverable | Status |
|---|---|---|
| JetBrains IDE plugin with core functionality (open file, apply diff, get context) | `packages/jetbrains-ide-companion/` — full Kotlin/Gradle plugin | **Phase 1 implementation** |
| Common IDE Context Protocol specification | `packages/ide-companion-protocol/` — JSON schemas + design doc | **Phase 1 implementation** |
| IDE detection improvements | Updated `ide-installer.ts` + error messages for JetBrains | **Phase 1 stretch goal** |
| Documentation and setup guides | `README.md` for JetBrains plugin; updated `docs/ide-integration/` | **Phase 1 implementation** |
| Enhanced Neovim integration with bidirectional communication | Architecture doc + Lua plugin prototype | **Phase 2 specified in Phase 1** |
| Zed editor full integration | Architecture doc + Zed extension spec | **Phase 2 specified in Phase 1** |
| Shared context synchronization across CLI and IDE | Achieved via Common IDE Context Protocol + JetBrains implementation | **Phase 1 implementation** |

---

## 14. About the Applicant

> _[Fill in: name, university, relevant experience with Kotlin/JVM, IntelliJ plugin development, TypeScript/Node.js, prior open source contributions, GitHub profile, contact information.]_

### Relevant Skills

- **Kotlin / JVM:** [experience level, projects]
- **IntelliJ Platform plugin development:** [experience level, projects]
- **TypeScript / Node.js:** [experience level — relevant for understanding the Gemini CLI codebase]
- **Lua / Neovim plugin development:** [experience level — relevant for Phase 2]
- **Rust:** [experience level — relevant for Zed extension Phase 2]
- **Open source contributions:** [list relevant PRs or projects]

### Why This Project

> _[Fill in: personal motivation, why Gemini CLI, why IDE integration specifically.]_

### Time Commitment

I am available for approximately **35 hours per week** during the GSoC coding period. I have no other significant commitments during this time. I will be available for weekly sync meetings with my mentor(s) and will post weekly progress updates to the project mailing list.
