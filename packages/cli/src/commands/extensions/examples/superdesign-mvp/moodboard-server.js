/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  initializeProject,
  readState,
  commitEvent,
  summarizeState,
  performUndo,
  performRedo,
  slugifyName,
} from './src/state-store.js';
import {
  addInspiration,
  deriveTokens,
  generateVariants,
  applyVariant,
  iterateDesign,
  exportDesignArtifacts,
} from './src/design-engine.js';

const extensionRoot = process.cwd();
const canvasTemplateDir = path.join(extensionRoot, 'canvas');

function findRepoRoot(startPath) {
  let current = startPath;
  while (true) {
    if (existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return startPath;
    }
    current = parent;
  }
}

const repoRoot = findRepoRoot(extensionRoot);
const runtimeProjectsRoot = path.join(repoRoot, '.superdesign-runtime', 'projects');
const activeProjectFile = path.join(repoRoot, '.superdesign-runtime', '.active-project');

function textResponse(title, data) {
  return {
    content: [
      {
        type: 'text',
        text: `${title}\n${JSON.stringify(data, null, 2)}`,
      },
    ],
  };
}

async function copyCanvasTemplate(projectPath) {
  const targetCanvasDir = path.join(projectPath, 'canvas');
  await fs.mkdir(targetCanvasDir, { recursive: true });
  for (const fileName of ['index.html', 'app.js', 'styles.css']) {
    await fs.copyFile(
      path.join(canvasTemplateDir, fileName),
      path.join(targetCanvasDir, fileName),
    );
  }
}

async function setActiveProject(projectPath) {
  await fs.mkdir(path.dirname(activeProjectFile), { recursive: true });
  await fs.writeFile(activeProjectFile, `${projectPath}\n`, 'utf8');
}

async function getActiveProject() {
  try {
    const raw = await fs.readFile(activeProjectFile, 'utf8');
    return raw.trim();
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 'ENOENT') {
        return null;
      }
    }
    throw error;
  }
}

async function resolveProjectPath({ projectPath, projectId }) {
  if (projectPath && projectPath.trim()) {
    return path.resolve(projectPath);
  }
  if (projectId && projectId.trim()) {
    return path.resolve(runtimeProjectsRoot, projectId);
  }
  const active = await getActiveProject();
  if (!active) {
    throw new Error(
      'No active project found. Run design_init_project first or pass projectPath.',
    );
  }
  return active;
}

function openCanvasFile(canvasPath) {
  const platform = os.platform();
  let command = 'xdg-open';
  let args = [canvasPath];
  if (platform === 'darwin') {
    command = 'open';
  } else if (platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', canvasPath];
  }
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

function inferProjectName(name, prompt) {
  if (name && name.trim()) {
    return name.trim();
  }
  if (prompt && prompt.trim()) {
    const words = prompt
      .trim()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .slice(0, 5)
      .join(' ');
    if (words) {
      return words;
    }
  }
  return 'superdesign-demo';
}

function normalizeTags(tags) {
  if (!tags) {
    return [];
  }
  if (Array.isArray(tags)) {
    return tags;
  }
  return String(tags)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

const server = new McpServer({
  name: 'superdesign-mvp-server',
  version: '0.1.0',
});

server.registerTool(
  'design_init_project',
  {
    description:
      'Initialize a persistent moodboard project with state/event logs and canvas files.',
    inputSchema: z
      .object({
        name: z.string().min(1).optional(),
        prompt: z.string().min(1).optional(),
        path: z.string().optional(),
        autoOpen: z.boolean().optional(),
        variantCount: z.number().int().min(1).max(6).optional(),
      })
      .shape,
  },
  async ({ name, prompt, path: projectPathArg, autoOpen, variantCount }) => {
    const projectName = inferProjectName(name, prompt);
    const defaultPath = path.resolve(runtimeProjectsRoot, slugifyName(projectName));
    const projectPath = projectPathArg ? path.resolve(projectPathArg) : defaultPath;
    let state = await initializeProject(projectPath, projectName, prompt ?? '');
    await copyCanvasTemplate(projectPath);
    if (prompt && prompt.trim()) {
      const afterInspiration = addInspiration(state, {
        input: prompt,
        tags: normalizeTags('init,prompt-seed'),
        notes: 'Seed prompt captured during initialization',
        type: 'prompt-seed',
      });
      const committedInspiration = await commitEvent(
        projectPath,
        state,
        'design_add_inspiration',
        { input: prompt, source: 'init-seed' },
        afterInspiration,
      );
      const derived = deriveTokens(committedInspiration);
      const committedTokens = await commitEvent(
        projectPath,
        committedInspiration,
        'design_derive_tokens',
        { paletteId: derived.paletteId, source: 'init-seed' },
        derived.state,
      );
      const generated = generateVariants(committedTokens, variantCount ?? 3, '');
      const committedVariants = await commitEvent(
        projectPath,
        committedTokens,
        'design_generate_variants',
        { count: variantCount ?? 3, source: 'init-seed' },
        generated,
      );
      if (committedVariants.variants.length > 0) {
        const activated = applyVariant(
          committedVariants,
          committedVariants.variants[0].id,
        );
        state = await commitEvent(
          projectPath,
          committedVariants,
          'design_apply_variant',
          { variantId: committedVariants.variants[0].id, source: 'init-seed' },
          activated,
        );
      } else {
        state = committedVariants;
      }
    }
    await setActiveProject(projectPath);
    const canvasPath = path.join(projectPath, 'canvas', 'index.html');
    if (autoOpen ?? true) {
      try {
        openCanvasFile(canvasPath);
      } catch {
        // best-effort browser launch; return path regardless
      }
    }
    return textResponse('Project initialized', {
      ...summarizeState(state),
      runtimeProjectsRoot,
      nextSteps: [
        'Canvas should open automatically in your browser',
        'Use /design:iterate to refine the active direction',
        'Use /design:gen only when you want alternative variants',
      ],
    });
  },
);

server.registerTool(
  'design_add_inspiration',
  {
    description: 'Add an inspiration item (URL, text note, or local reference).',
    inputSchema: z
      .object({
        input: z.string().min(1),
        projectPath: z.string().optional(),
        projectId: z.string().optional(),
        tags: z.union([z.array(z.string()), z.string()]).optional(),
        notes: z.string().optional(),
        type: z.string().optional(),
      })
      .shape,
  },
  async ({ input, projectPath, projectId, tags, notes, type }) => {
    const resolved = await resolveProjectPath({ projectPath, projectId });
    const prevState = await readState(resolved);
    const nextState = addInspiration(prevState, {
      input,
      tags: normalizeTags(tags),
      notes: notes ?? '',
      type: type ?? 'text',
    });
    const committed = await commitEvent(
      resolved,
      prevState,
      'design_add_inspiration',
      { input, tags, notes, type },
      nextState,
    );
    return textResponse('Inspiration added', summarizeState(committed));
  },
);

server.registerTool(
  'design_derive_tokens',
  {
    description: 'Derive design tokens from inspirations in a deterministic way.',
    inputSchema: z
      .object({
        projectPath: z.string().optional(),
        projectId: z.string().optional(),
      })
      .shape,
  },
  async ({ projectPath, projectId }) => {
    const resolved = await resolveProjectPath({ projectPath, projectId });
    const prevState = await readState(resolved);
    const { state: nextState, paletteId } = deriveTokens(prevState);
    const committed = await commitEvent(
      resolved,
      prevState,
      'design_derive_tokens',
      { paletteId },
      nextState,
    );
    return textResponse('Tokens derived', {
      ...summarizeState(committed),
      paletteId,
      tokens: committed.tokens,
    });
  },
);

server.registerTool(
  'design_generate_variants',
  {
    description: 'Generate deterministic HTML-oriented design variants.',
    inputSchema: z
      .object({
        projectPath: z.string().optional(),
        projectId: z.string().optional(),
        count: z.number().int().min(1).max(6).optional(),
        constraints: z.string().optional(),
      })
      .shape,
  },
  async ({ projectPath, projectId, count, constraints }) => {
    const resolved = await resolveProjectPath({ projectPath, projectId });
    const prevState = await readState(resolved);
    const nextState = generateVariants(prevState, count ?? 3, constraints ?? '');
    const committed = await commitEvent(
      resolved,
      prevState,
      'design_generate_variants',
      { count, constraints },
      nextState,
    );
    return textResponse('Variants generated', {
      ...summarizeState(committed),
      variants: committed.variants,
    });
  },
);

server.registerTool(
  'design_apply_variant',
  {
    description: 'Apply a generated variant as the active design direction.',
    inputSchema: z
      .object({
        variantId: z.string().min(1),
        projectPath: z.string().optional(),
        projectId: z.string().optional(),
      })
      .shape,
  },
  async ({ variantId, projectPath, projectId }) => {
    const resolved = await resolveProjectPath({ projectPath, projectId });
    const prevState = await readState(resolved);
    const byIndex = Number(variantId);
    const selectedId =
      Number.isInteger(byIndex) && byIndex > 0 && byIndex <= prevState.variants.length
        ? prevState.variants[byIndex - 1].id
        : variantId;
    const nextState = applyVariant(prevState, selectedId);
    const committed = await commitEvent(
      resolved,
      prevState,
      'design_apply_variant',
      { variantId: selectedId },
      nextState,
    );
    return textResponse('Variant applied', summarizeState(committed));
  },
);

server.registerTool(
  'design_iterate',
  {
    description: 'Iterate on the active direction using targeted instruction deltas.',
    inputSchema: z
      .object({
        instruction: z.string().min(1),
        projectPath: z.string().optional(),
        projectId: z.string().optional(),
      })
      .shape,
  },
  async ({ instruction, projectPath, projectId }) => {
    const resolved = await resolveProjectPath({ projectPath, projectId });
    const prevState = await readState(resolved);
    const nextState = iterateDesign(prevState, instruction);
    const committed = await commitEvent(
      resolved,
      prevState,
      'design_iterate',
      { instruction },
      nextState,
    );
    return textResponse('Iteration applied', summarizeState(committed));
  },
);

server.registerTool(
  'design_undo',
  {
    description: 'Undo the last design mutation.',
    inputSchema: z
      .object({
        projectPath: z.string().optional(),
        projectId: z.string().optional(),
      })
      .shape,
  },
  async ({ projectPath, projectId }) => {
    const resolved = await resolveProjectPath({ projectPath, projectId });
    const { changed, state } = await performUndo(resolved);
    return textResponse(changed ? 'Undo completed' : 'Nothing to undo', summarizeState(state));
  },
);

server.registerTool(
  'design_redo',
  {
    description: 'Redo the last undone design mutation.',
    inputSchema: z
      .object({
        projectPath: z.string().optional(),
        projectId: z.string().optional(),
      })
      .shape,
  },
  async ({ projectPath, projectId }) => {
    const resolved = await resolveProjectPath({ projectPath, projectId });
    const { changed, state } = await performRedo(resolved);
    return textResponse(changed ? 'Redo completed' : 'Nothing to redo', summarizeState(state));
  },
);

server.registerTool(
  'design_export',
  {
    description: 'Export current design as HTML (default) or full state.',
    inputSchema: z
      .object({
        projectPath: z.string().optional(),
        projectId: z.string().optional(),
        format: z.enum(['html', 'state']).optional(),
      })
      .shape,
  },
  async ({ projectPath, projectId, format }) => {
    const resolved = await resolveProjectPath({ projectPath, projectId });
    const state = await readState(resolved);
    const exported = await exportDesignArtifacts(resolved, state, format ?? 'html');
    return textResponse('Export completed', {
      ...summarizeState(state),
      export: exported,
    });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
