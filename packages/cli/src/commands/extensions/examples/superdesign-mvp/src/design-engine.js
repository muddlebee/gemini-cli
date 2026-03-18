/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { cloneState } from './state-store.js';

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function keywordScore(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.reduce((score, keyword) => {
    return score + (lower.includes(keyword) ? 1 : 0);
  }, 0);
}

const PALETTES = [
  {
    id: 'editorial-dark',
    keywords: ['editorial', 'luxury', 'dark', 'cinematic'],
    color: {
      background: '#0f0e13',
      surface: '#1b1924',
      text: '#f7f3ef',
      accent: '#f59e0b',
      muted: '#aca6bf',
    },
  },
  {
    id: 'brutalist-ink',
    keywords: ['brutalist', 'bold', 'high contrast', 'poster'],
    color: {
      background: '#ffffff',
      surface: '#f4f4f5',
      text: '#09090b',
      accent: '#2563eb',
      muted: '#4b5563',
    },
  },
  {
    id: 'neo-mint',
    keywords: ['modern', 'saas', 'clean', 'calm', 'mint'],
    color: {
      background: '#f8fafc',
      surface: '#ffffff',
      text: '#0f172a',
      accent: '#0ea5e9',
      muted: '#64748b',
    },
  },
];

function pickPalette(inspirations) {
  const source = inspirations
    .map((item) => `${item.source} ${item.notes ?? ''} ${(item.tags ?? []).join(' ')}`)
    .join(' ');

  let winner = PALETTES[0];
  let bestScore = -1;
  for (const palette of PALETTES) {
    const score = keywordScore(source, palette.keywords);
    if (score > bestScore) {
      bestScore = score;
      winner = palette;
    }
  }
  return winner;
}

function buildThemeDescriptor(prompt = '', style = 'balanced') {
  const normalized = prompt.toLowerCase();
  const descriptor = {
    appName: 'Chat Canvas',
    tone: 'calm',
    motif: 'layered cards',
    style,
  };
  if (normalized.includes('origami')) {
    descriptor.appName = 'Origami Chat';
    descriptor.tone = 'serene';
    descriptor.motif = 'folded-paper bubbles';
  } else if (normalized.includes('neon')) {
    descriptor.appName = 'Neon Relay';
    descriptor.tone = 'electric';
    descriptor.motif = 'glow gradients';
  } else if (normalized.includes('minimal')) {
    descriptor.appName = 'Quiet Chat';
    descriptor.tone = 'minimal';
    descriptor.motif = 'spacious typography';
  }
  return descriptor;
}

function seedMessages(theme, accent) {
  return [
    {
      role: 'assistant',
      text: `Welcome to ${theme.appName}.`,
      color: accent,
    },
    {
      role: 'user',
      text: `I want a ${theme.tone} interface with ${theme.motif}.`,
      color: '#dbeafe',
    },
    {
      role: 'assistant',
      text: 'Perfect. I prepared the first active design direction.',
      color: accent,
    },
  ];
}

export function addInspiration(state, { input, tags = [], notes = '', type = 'text' }) {
  const next = cloneState(state);
  next.inspirations.push({
    id: randomId('insp'),
    type,
    source: input,
    tags,
    notes,
    createdAt: new Date().toISOString(),
  });
  next.meta.lastPrompt = `add inspiration: ${input}`;
  return next;
}

export function deriveTokens(state) {
  const next = cloneState(state);
  const palette = pickPalette(next.inspirations);
  next.tokens.color = palette.color;
  next.tokens.typography = {
    ...next.tokens.typography,
    familyHeading:
      palette.id === 'brutalist-ink'
        ? '"Archivo Black", "Arial Black", sans-serif'
        : palette.id === 'editorial-dark'
          ? '"Cormorant Garamond", Georgia, serif'
          : '"Sora", "Avenir Next", sans-serif',
    familyBody:
      palette.id === 'editorial-dark'
        ? '"Inter", "Segoe UI", sans-serif'
        : '"Manrope", "Segoe UI", sans-serif',
  };
  next.meta.lastPrompt = `derived tokens from palette: ${palette.id}`;
  return { state: next, paletteId: palette.id };
}

function buildVariant(projectId, index, style, sections, density, tokens) {
  const prompt = tokens.__promptHint ?? '';
  const theme = buildThemeDescriptor(prompt, style);
  const id = `${projectId}_v${index + 1}_${style.replace(/[^a-z]/gi, '')}`;
  return {
    id,
    title: `Variant ${index + 1} - ${style}`,
    style,
    density,
    sections,
    summary: `${style} direction with ${sections.join(', ')} in a ${theme.tone} tone`,
    preview: {
      kicker: `${theme.tone} messaging experience`,
      heroHeadline:
        style === 'bold-split'
          ? `Design a confident ${theme.appName} launch`
          : style === 'minimal-grid'
            ? `${theme.appName} with focused, distraction-free conversations`
            : `A premium ${theme.appName} with ${theme.motif}`,
      subline: `Prompt seed: ${prompt || 'general design exploration'}`,
      cta: style === 'editorial-stack' ? 'Preview Experience' : 'Open Conversation',
      chatTitle: `${theme.appName} Prototype`,
      messages: seedMessages(theme, tokens.color.accent),
      composerPlaceholder: 'Type a message...',
      accent: tokens.color.accent,
      theme,
    },
  };
}

export function generateVariants(state, count = 3, constraints = '') {
  const next = cloneState(state);
  const promptHint = next.meta.initialPrompt || next.meta.lastPrompt || '';
  next.tokens.__promptHint = promptHint;
  const styles = ['bold-split', 'minimal-grid', 'editorial-stack', 'asymmetric-flow'];
  const density = constraints.toLowerCase().includes('minimal')
    ? 'low'
    : constraints.toLowerCase().includes('dense')
      ? 'high'
      : 'medium';
  const sections = constraints.toLowerCase().includes('no testimonials')
    ? ['hero', 'value-props', 'showcase', 'cta']
    : ['hero', 'value-props', 'testimonials', 'cta'];

  const total = Math.max(1, Math.min(6, Number(count) || 3));
  next.variants = Array.from({ length: total }, (_, index) =>
    buildVariant(
      next.project.id,
      index,
      styles[index % styles.length],
      sections,
      density,
      next.tokens,
    ),
  );
  if (!next.activeVariantId && next.variants.length > 0) {
    next.activeVariantId = next.variants[0].id;
  }
  next.meta.lastPrompt = `generated ${total} variants`;
  return next;
}

export function applyVariant(state, variantId) {
  const next = cloneState(state);
  const variant = next.variants.find((item) => item.id === variantId);
  if (!variant) {
    throw new Error(`Unknown variantId: ${variantId}`);
  }
  next.activeVariantId = variantId;
  next.layout = {
    style: variant.style,
    sections: variant.sections,
    density: variant.density,
  };
  next.meta.activeTheme = variant.preview.theme;
  next.meta.lastPrompt = `applied variant ${variantId}`;
  return next;
}

export function iterateDesign(state, instruction) {
  const next = cloneState(state);
  const normalized = instruction.toLowerCase();
  next.meta.lastPrompt = instruction;

  if (normalized.includes('contrast')) {
    next.tokens.color.text = '#ffffff';
    next.tokens.color.background = '#090b10';
    next.tokens.color.surface = '#121721';
  }
  if (normalized.includes('warm')) {
    next.tokens.color.accent = '#fb923c';
  }
  if (normalized.includes('cool')) {
    next.tokens.color.accent = '#38bdf8';
  }
  if (normalized.includes('spacing') || normalized.includes('clutter')) {
    next.tokens.spacing = { xs: 4, sm: 6, md: 12, lg: 20, xl: 32 };
    next.layout.density = 'low';
  }
  if (normalized.includes('bold') || normalized.includes('typography')) {
    next.tokens.typography.familyHeading = '"Archivo Black", "Arial Black", sans-serif';
    next.tokens.typography.scale = [12, 14, 16, 22, 34, 52];
  }
  if (normalized.includes('editorial')) {
    next.layout.style = 'editorial-stack';
    next.tokens.typography.familyHeading = '"Cormorant Garamond", Georgia, serif';
    next.tokens.typography.scale = [12, 14, 18, 24, 38, 56];
  }
  if (normalized.includes('minimal')) {
    next.layout.style = 'minimal-grid';
    next.layout.density = 'low';
    next.layout.sections = ['hero', 'value-props', 'cta'];
  }

  const active = next.variants.find((item) => item.id === next.activeVariantId);
  if (active) {
    active.preview.accent = next.tokens.color.accent;
    active.summary = `${next.layout.style} direction tuned by instruction: ${instruction}`;
    active.preview.subline = instruction;
  }

  return next;
}

export async function exportDesignArtifacts(projectPath, state, format = 'html') {
  const exportDir = path.join(projectPath, 'exports');
  await fs.mkdir(exportDir, { recursive: true });

  const tokenPath = path.join(exportDir, 'tokens.json');
  await fs.writeFile(tokenPath, `${JSON.stringify(state.tokens, null, 2)}\n`, 'utf8');

  let outputPath;
  if (format === 'state') {
    outputPath = path.join(exportDir, 'state-export.json');
    await fs.writeFile(outputPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  } else {
    outputPath = path.join(exportDir, 'canvas-export.html');
    const active = state.variants.find((item) => item.id === state.activeVariantId);
    const messages = (active?.preview?.messages ?? [])
      .map(
        (entry) =>
          `<li><strong>${entry.role}:</strong> ${entry.text}</li>`,
      )
      .join('');
    const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${state.project.name} Export</title>
<style>
body{font-family:system-ui,sans-serif;background:${state.tokens.color.background};color:${state.tokens.color.text};margin:0;padding:2rem}
.card{max-width:760px;margin:0 auto;background:${state.tokens.color.surface};padding:1.2rem;border-radius:16px;box-shadow:${state.tokens.shadow.soft}}
h1{margin:0 0 0.35rem;font-family:${state.tokens.typography.familyHeading}}
p{opacity:0.9}
ul{padding-left:1rem}
button{background:${state.tokens.color.accent};border:0;border-radius:999px;padding:0.55rem 1rem;font-weight:700}
</style></head>
<body>
<div class="card">
<h1>${active?.preview?.heroHeadline ?? state.project.name}</h1>
<p>${active?.preview?.subline ?? state.meta.lastPrompt}</p>
<p><strong>Active Variant:</strong> ${state.activeVariantId ?? 'none'}</p>
<ul>${messages}</ul>
<button>${active?.preview?.cta ?? 'Start'}</button>
</div>
</body>
</html>`;
    await fs.writeFile(outputPath, `${html}\n`, 'utf8');
  }

  return {
    exportDir,
    outputPath,
    tokenPath,
  };
}

