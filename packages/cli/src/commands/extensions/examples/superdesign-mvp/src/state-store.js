/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const STATE_FILE = 'state.json';
const EVENTS_FILE = 'events.jsonl';
const CANVAS_FILE = path.join('canvas', 'index.html');

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function slugifyName(name) {
  const normalized = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
  return normalized.replace(/(^-|-$)/g, '') || `project-${Date.now()}`;
}

export function createInitialState(projectId, projectName, projectPath, initialPrompt = '') {
  return {
    project: {
      id: projectId,
      name: projectName,
      path: projectPath,
      createdAt: nowIso(),
    },
    inspirations: [],
    tokens: {
      color: {
        background: '#0e1116',
        surface: '#161b22',
        text: '#f3f4f6',
        accent: '#7dd3fc',
        muted: '#9aa4b2',
      },
      typography: {
        familyHeading: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
        familyBody:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        scale: [12, 14, 16, 20, 28, 40],
      },
      spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 },
      radius: { sm: 8, md: 14, lg: 20 },
      shadow: {
        soft: '0 8px 24px rgba(0, 0, 0, 0.18)',
        crisp: '0 2px 6px rgba(0, 0, 0, 0.24)',
      },
    },
    layout: {
      style: 'balanced',
      sections: ['hero', 'value-props', 'showcase', 'cta'],
      density: 'medium',
    },
    variants: [],
    activeVariantId: null,
    meta: {
      initialPrompt,
      lastPrompt: initialPrompt,
      lastAction: 'init',
      score: null,
      checkpoints: [],
      updatedAt: nowIso(),
    },
    history: {
      cursor: 0,
      eventCount: 1,
    },
  };
}

export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

export async function ensureProjectScaffold(projectPath) {
  await fs.mkdir(projectPath, { recursive: true });
  await fs.mkdir(path.join(projectPath, 'assets'), { recursive: true });
  await fs.mkdir(path.join(projectPath, 'canvas'), { recursive: true });
}

export async function writeState(projectPath, state) {
  await fs.writeFile(
    path.join(projectPath, STATE_FILE),
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8',
  );
}

export async function readState(projectPath) {
  const raw = await fs.readFile(path.join(projectPath, STATE_FILE), 'utf8');
  return JSON.parse(raw);
}

export async function readEvents(projectPath) {
  try {
    const raw = await fs.readFile(path.join(projectPath, EVENTS_FILE), 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 'ENOENT') {
        return [];
      }
    }
    throw error;
  }
}

export async function writeEvents(projectPath, events) {
  const body = events.map((event) => JSON.stringify(event)).join('\n');
  await fs.writeFile(path.join(projectPath, EVENTS_FILE), `${body}\n`, 'utf8');
}

export async function commitEvent(projectPath, prevState, action, payload, nextState) {
  const events = await readEvents(projectPath);
  const currentCursor = prevState.history?.cursor ?? events.length - 1;
  const truncated = events.slice(0, currentCursor + 1);
  const event = {
    id: randomId('evt'),
    timestamp: nowIso(),
    action,
    payload,
    snapshot: cloneState(nextState),
  };
  truncated.push(event);
  const updatedState = cloneState(nextState);
  updatedState.meta.updatedAt = nowIso();
  updatedState.meta.lastAction = action;
  updatedState.history.cursor = truncated.length - 1;
  updatedState.history.eventCount = truncated.length;

  await writeEvents(projectPath, truncated);
  await writeState(projectPath, updatedState);
  return updatedState;
}

export async function initializeProject(projectPath, projectName, initialPrompt = '') {
  const projectId = slugifyName(projectName);
  const state = createInitialState(projectId, projectName, projectPath, initialPrompt);
  await ensureProjectScaffold(projectPath);
  await writeState(projectPath, state);
  const initEvent = {
    id: randomId('evt'),
    timestamp: nowIso(),
    action: 'design_init_project',
    payload: { projectName, initialPrompt },
    snapshot: cloneState(state),
  };
  await writeEvents(projectPath, [initEvent]);
  return state;
}

export function summarizeState(state) {
  return {
    project: {
      id: state.project.id,
      name: state.project.name,
      path: state.project.path,
    },
    inspirationCount: state.inspirations.length,
    variantCount: state.variants.length,
    activeVariantId: state.activeVariantId,
    layoutStyle: state.layout?.style ?? null,
    history: state.history,
    lastAction: state.meta.lastAction,
    canvasPath: path.join(state.project.path, CANVAS_FILE),
  };
}

export async function performUndo(projectPath) {
  const state = await readState(projectPath);
  const events = await readEvents(projectPath);
  if (!events.length || (state.history?.cursor ?? 0) <= 0) {
    return { changed: false, state };
  }
  const nextCursor = state.history.cursor - 1;
  const snapshot = cloneState(events[nextCursor].snapshot);
  snapshot.history.cursor = nextCursor;
  snapshot.history.eventCount = events.length;
  snapshot.meta.lastAction = 'design_undo';
  snapshot.meta.updatedAt = nowIso();
  await writeState(projectPath, snapshot);
  return { changed: true, state: snapshot };
}

export async function performRedo(projectPath) {
  const state = await readState(projectPath);
  const events = await readEvents(projectPath);
  const cursor = state.history?.cursor ?? 0;
  if (!events.length || cursor >= events.length - 1) {
    return { changed: false, state };
  }
  const nextCursor = cursor + 1;
  const snapshot = cloneState(events[nextCursor].snapshot);
  snapshot.history.cursor = nextCursor;
  snapshot.history.eventCount = events.length;
  snapshot.meta.lastAction = 'design_redo';
  snapshot.meta.updatedAt = nowIso();
  await writeState(projectPath, snapshot);
  return { changed: true, state: snapshot };
}

