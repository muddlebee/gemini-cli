const projectNameEl = document.getElementById('project-name');
const updatedAtEl = document.getElementById('updated-at');
const inspirationListEl = document.getElementById('inspiration-list');
const variantListEl = document.getElementById('variant-list');
const historyMetaEl = document.getElementById('history-meta');
const layoutSectionsEl = document.getElementById('layout-sections');
const heroHeadlineEl = document.getElementById('hero-headline');
const heroDescriptionEl = document.getElementById('hero-description');
const heroCtaEl = document.getElementById('hero-cta');
const themeKickerEl = document.getElementById('theme-kicker');
const appNameEl = document.getElementById('theme-app-name');
const chatTitleEl = document.getElementById('chat-title');
const chatMessagesEl = document.getElementById('chat-messages');
const composerPlaceholderEl = document.getElementById('composer-placeholder');
const liveIndicatorEl = document.getElementById('live-indicator');

let latestUpdatedAt = '';

function buildListItem(text) {
  const li = document.createElement('li');
  li.textContent = text;
  return li;
}

function renderInspiration(inspirations) {
  inspirationListEl.innerHTML = '';
  if (!inspirations.length) {
    inspirationListEl.appendChild(buildListItem('No inspirations added yet.'));
    return;
  }
  inspirations.forEach((item) => {
    const tags = (item.tags ?? []).join(', ');
    const description = tags ? `${item.source} (${tags})` : item.source;
    inspirationListEl.appendChild(buildListItem(description));
  });
}

function renderVariants(variants, activeVariantId) {
  variantListEl.innerHTML = '';
  if (!variants.length) {
    variantListEl.appendChild(
      buildListItem('No variants generated. Run /design:gen from Gemini CLI.'),
    );
    return;
  }
  variants.forEach((variant) => {
    const label = variant.id === activeVariantId ? ' [active]' : '';
    variantListEl.appendChild(buildListItem(`${variant.title}${label}`));
  });
}

function renderSections(sections) {
  layoutSectionsEl.innerHTML = '';
  sections.forEach((section) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = section;
    layoutSectionsEl.appendChild(chip);
  });
}

function applyTokens(tokens) {
  const root = document.documentElement;
  root.style.setProperty('--bg', tokens.color.background);
  root.style.setProperty('--surface', tokens.color.surface);
  root.style.setProperty('--text', tokens.color.text);
  root.style.setProperty('--accent', tokens.color.accent);
  root.style.setProperty('--muted', tokens.color.muted);
  document.body.style.fontFamily = tokens.typography.familyBody;
}

function renderMessages(messages) {
  chatMessagesEl.innerHTML = '';
  if (!messages || !messages.length) {
    chatMessagesEl.appendChild(buildListItem('No messages yet.'));
    return;
  }
  messages.forEach((entry) => {
    const item = document.createElement('li');
    item.className = `message ${entry.role === 'user' ? 'from-user' : 'from-assistant'}`;
    item.textContent = entry.text;
    chatMessagesEl.appendChild(item);
  });
}

function renderHero(state) {
  const active = state.variants.find((item) => item.id === state.activeVariantId);
  if (!active) {
    heroHeadlineEl.textContent = 'Prompt-first active design will appear after init.';
    heroDescriptionEl.textContent =
      'Run /design:init with a design prompt to auto-generate and apply a variant.';
    heroCtaEl.textContent = 'Run /design:init';
    themeKickerEl.textContent = 'Waiting for active design';
    chatTitleEl.textContent = 'Live Prototype';
    composerPlaceholderEl.textContent = 'Type a message...';
    renderMessages([]);
    return;
  }
  const theme = active.preview.theme ?? {};
  appNameEl.textContent = theme.appName ?? state.project.name;
  themeKickerEl.textContent = active.preview.kicker ?? `${active.style} direction`;
  heroHeadlineEl.textContent = active.preview.heroHeadline;
  heroDescriptionEl.textContent = active.preview.subline ?? active.summary;
  heroCtaEl.textContent = active.preview.cta;
  chatTitleEl.textContent = active.preview.chatTitle ?? `${state.project.name} Prototype`;
  composerPlaceholderEl.textContent =
    active.preview.composerPlaceholder ?? 'Type a message...';
  renderMessages(active.preview.messages ?? []);
}

function render(state) {
  projectNameEl.textContent = state.project.name;
  updatedAtEl.textContent = `updated ${new Date(state.meta.updatedAt).toLocaleTimeString()}`;
  historyMetaEl.textContent = `History cursor: ${state.history.cursor + 1}/${state.history.eventCount} | Last action: ${state.meta.lastAction}`;

  applyTokens(state.tokens);
  renderInspiration(state.inspirations);
  renderVariants(state.variants, state.activeVariantId);
  renderSections(state.layout.sections ?? []);
  renderHero(state);
  liveIndicatorEl.textContent = `polling live (${new Date().toLocaleTimeString()})`;
}

async function fetchState() {
  const response = await fetch(`../state.json?ts=${Date.now()}`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Unable to load state.json: ${response.status}`);
  }
  return response.json();
}

async function refresh() {
  try {
    const state = await fetchState();
    if (state.meta.updatedAt !== latestUpdatedAt) {
      latestUpdatedAt = state.meta.updatedAt;
      render(state);
    }
  } catch (error) {
    updatedAtEl.textContent = error instanceof Error ? error.message : 'load error';
  }
}

setInterval(refresh, 700);
refresh();
