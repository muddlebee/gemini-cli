const projectNameEl = document.getElementById('project-name');
const updatedAtEl = document.getElementById('updated-at');
const liveIndicatorEl = document.getElementById('live-indicator');
const previewFrame = document.getElementById('preview-frame');
const emptyState = document.getElementById('empty-state');
const variantListEl = document.getElementById('variant-list');
const inspirationListEl = document.getElementById('inspiration-list');
const tokenSwatchesEl = document.getElementById('token-swatches');
const historyBarEl = document.getElementById('history-bar');

let latestUpdatedAt = '';
let activeVariantId = null;
let isApplyingVariant = false;

// Fallback skeleton rendered when a variant has no HTML yet.
function buildSkeletonHtml(variant, tokens) {
  const bg = tokens?.color?.background ?? '#0e1116';
  const surface = tokens?.color?.surface ?? '#161b22';
  const text = tokens?.color?.text ?? '#f3f4f6';
  const accent = tokens?.color?.accent ?? '#7dd3fc';
  const muted = tokens?.color?.muted ?? '#9aa4b2';
  const fontBody = tokens?.typography?.familyBody ?? 'system-ui, sans-serif';
  const fontHeading = tokens?.typography?.familyHeading ?? 'system-ui, sans-serif';
  const preview = variant?.preview ?? {};
  const messages = (preview.messages ?? [])
    .map((m) => {
      const align = m.role === 'user' ? 'flex-end' : 'flex-start';
      const bubbleBg = m.role === 'user' ? surface : `color-mix(in srgb, ${accent} 20%, ${surface})`;
      return `<div style="display:flex;justify-content:${align};margin-bottom:8px;">
        <div style="max-width:72%;padding:10px 14px;border-radius:16px;background:${bubbleBg};font-size:14px;line-height:1.4;">${m.text}</div>
      </div>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:${fontBody};background:${bg};color:${text};min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem;gap:1.5rem;}
  .badge{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${muted};padding:4px 10px;border:1px solid ${muted}44;border-radius:999px;}
  h1{font-family:${fontHeading};font-size:clamp(1.6rem,3vw,2.8rem);line-height:1.1;text-align:center;max-width:22ch;}
  .sub{color:${muted};font-size:15px;text-align:center;max-width:46ch;line-height:1.5;}
  .chat{width:100%;max-width:520px;background:${surface};border-radius:20px;overflow:hidden;border:1px solid ${muted}28;}
  .chat-header{padding:12px 16px;border-bottom:1px solid ${muted}22;font-size:13px;color:${muted};display:flex;justify-content:space-between;}
  .chat-body{padding:16px;min-height:160px;}
  .chat-footer{padding:10px 16px;border-top:1px solid ${muted}22;font-size:13px;color:${muted}88;}
  .cta{margin-top:.5rem;padding:10px 22px;background:${accent};color:#111;border:0;border-radius:999px;font-weight:700;font-size:14px;cursor:pointer;}
  .generating{font-size:13px;color:${muted};font-style:italic;text-align:center;}
</style>
</head>
<body>
  <span class="badge">${preview.kicker ?? variant?.style ?? 'design variant'}</span>
  <h1>${preview.heroHeadline ?? variant?.title ?? 'Design variant'}</h1>
  <p class="sub">${preview.subline ?? ''}</p>
  <div class="chat">
    <div class="chat-header">
      <span>${preview.chatTitle ?? 'Prototype'}</span>
      <span>live</span>
    </div>
    <div class="chat-body">${messages || '<p class="generating">Generating preview…</p>'}</div>
    <div class="chat-footer">${preview.composerPlaceholder ?? 'Type a message…'}</div>
  </div>
  <button class="cta">${preview.cta ?? 'Open'}</button>
</body>
</html>`;
}

function renderPreview(state) {
  const active = state.variants.find((v) => v.id === state.activeVariantId);
  if (!active) {
    previewFrame.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  const html = active.preview?.html ?? buildSkeletonHtml(active, state.tokens);
  emptyState.classList.add('hidden');
  previewFrame.classList.remove('hidden');

  // Only update srcdoc when content actually changes to avoid iframe flicker.
  if (previewFrame.dataset.variantId !== active.id || previewFrame.dataset.html !== html) {
    previewFrame.srcdoc = html;
    previewFrame.dataset.variantId = active.id;
    previewFrame.dataset.html = html;
  }
}

function renderVariants(variants, currentActiveId) {
  variantListEl.innerHTML = '';
  if (!variants.length) {
    variantListEl.innerHTML = '<p class="rail-empty">No variants yet.</p>';
    return;
  }
  variants.forEach((variant) => {
    const btn = document.createElement('button');
    btn.className = `variant-btn${variant.id === currentActiveId ? ' active' : ''}`;
    const hasHtml = Boolean(variant.preview?.html);
    btn.innerHTML = `
      <span class="variant-title">${variant.title}</span>
      <span class="variant-meta">${variant.style}${hasHtml ? ' ✓' : ' ·'}</span>
    `;
    btn.disabled = isApplyingVariant;
    btn.addEventListener('click', async () => {
      if (isApplyingVariant || activeVariantId === variant.id) {
        return;
      }
      try {
        isApplyingVariant = true;
        await applyVariantFromCanvas(variant.id);
        await refresh();
      } finally {
        isApplyingVariant = false;
      }
    });
    variantListEl.appendChild(btn);
  });
}

function renderInspiration(inspirations) {
  inspirationListEl.innerHTML = '';
  if (!inspirations.length) {
    inspirationListEl.innerHTML = '<li class="rail-empty">No inspirations yet.</li>';
    return;
  }
  inspirations.forEach((item) => {
    const li = document.createElement('li');
    const tags = (item.tags ?? []).join(', ');
    li.textContent = tags ? `${item.source} (${tags})` : item.source;
    inspirationListEl.appendChild(li);
  });
}

function renderTokenSwatches(tokens) {
  tokenSwatchesEl.innerHTML = '';
  const colors = tokens?.color ?? {};
  Object.entries(colors).forEach(([name, value]) => {
    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    swatch.title = `${name}: ${value}`;
    swatch.innerHTML = `<span class="swatch-dot" style="background:${value}"></span><span class="swatch-name">${name}</span>`;
    tokenSwatchesEl.appendChild(swatch);
  });
}

function renderHistoryBar(state) {
  const cursor = state.history?.cursor ?? 0;
  const total = state.history?.eventCount ?? 1;
  historyBarEl.textContent = `${state.meta?.lastAction ?? ''} · ${cursor + 1}/${total}`;
}

function render(state) {
  projectNameEl.textContent = state.project.name;
  updatedAtEl.textContent = new Date(state.meta.updatedAt).toLocaleTimeString();

  renderPreview(state);
  renderVariants(state.variants, state.activeVariantId);
  renderInspiration(state.inspirations);
  renderTokenSwatches(state.tokens);
  renderHistoryBar(state);

  activeVariantId = state.activeVariantId;
}

async function fetchState() {
  const response = await fetch(`/state.json?ts=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`state.json ${response.status}`);
  return response.json();
}

async function applyVariantFromCanvas(variantId) {
  const response = await fetch('/api/apply-variant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ variantId }),
  });
  if (!response.ok) {
    throw new Error(`apply-variant ${response.status}`);
  }
}

async function refresh() {
  try {
    const state = await fetchState();
    if (state.meta.updatedAt !== latestUpdatedAt) {
      latestUpdatedAt = state.meta.updatedAt;
      render(state);
    }
    liveIndicatorEl.style.color = '#22c55e';
  } catch (err) {
    updatedAtEl.textContent = err.message ?? 'load error';
    liveIndicatorEl.style.color = '#ef4444';
  }
}

setInterval(refresh, 700);
refresh();
