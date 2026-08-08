import {
  loadProgressDurable,
  saveProgressDurable,
  replaceProgressDurable,
  saveCustomBankDurable,
  deleteCustomBankDurable,
  clearProgressDurable,
  requestPersistentStorage,
  loadSettings,
  saveSettings,
  loadCloudSettings,
  saveCloudSettings,
  setSessionToken,
  getSessionToken,
  downloadJson,
  downloadText,
  loadContentLayout,
  saveContentLayout,
  clearContentLayout
} from './storage.js?v=20';
import { readGitHubProgress, writeGitHubProgress } from './github-sync.js?v=20';
import { normalizeLayoutSortMode, mergeVisibleLayoutOrder, sortItemsByLayout } from './layout-utils.js?v=20';

const app = document.querySelector('#app');
const progressImport = document.querySelector('#progress-import');
const bankImport = document.querySelector('#bank-import');

let baseCatalog = { appTitle: "Amin's Dent Study", courses: [] };
let catalog = { appTitle: "Amin's Dent Study", courses: [] };
let progress = null;
let contentLayout = loadContentLayout();
let settings = loadSettings();
let cloudSettings = loadCloudSettings();
let loadedBanks = new Map();
let saveStatus = { text: 'Preparing local storage…', kind: 'busy' };
let localSaveRequested = false;
let localSaveInFlight = null;
let modal = null;
let toastTimer = null;
let searchTerm = '';
let courseFilter = 'all';
let draggedCourseId = null;
let courseDragSaveTimer = null;
let courseDragMoved = false;
let draggedSessionId = null;
let draggedSessionCourseId = null;
let sessionDragSaveTimer = null;
let sessionDragMoved = false;
let suppressSessionOpenUntil = 0;
let suppressCourseOpenUntil = 0;

const esc = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const now = () => new Date().toISOString();
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const pct = (n, d) => d ? Math.round((n / d) * 100) : 0;
const idFromHash = () => decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'home';
function go(route) {
  flushPendingContentOrder();
  location.hash = `#/${route}`;
}
const slugify = value => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || `item-${Date.now()}`;
const clone = value => JSON.parse(JSON.stringify(value));


const uiIcons = {
  dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect></svg>',
  courses: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z"></path><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z"></path></svg>',
  review: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a2 2 0 0 1 2 2v16l-8-4-8 4V5a2 2 0 0 1 2-2z"></path><path d="M8 8h8M8 12h6"></path></svg>',
  flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4"></path><path d="M5 5h11l-2 4 2 4H5"></path></svg>',
  progress: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V10M10 20V4M15 20v-7M20 20V7"></path></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M4 21h16"></path></svg>',
  help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M9.8 9a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.2.9-1.2 1.8"></path><path d="M12 17h.01"></path></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"></path></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>',
  cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 8.5 4.5 4.5 0 0 0 7 18z"></path><path d="m9 13 3-3 3 3M12 10v7"></path></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
  image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="2"></circle><path d="m5 17 4-4 3 3 3-4 4 5"></path></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5"></path></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>'
};

function uiIcon(name, className = '') {
  return `<span class="ui-icon ${esc(className)}">${uiIcons[name] || ''}</span>`;
}

function profileInitials() {
  const name = (settings.profileName || 'Amin').trim();
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'A';
}

function courseArt(course, index = 0) {
  const label = `${course.title || ''} ${(course.tags || []).join(' ')}`.toLowerCase();
  if (label.includes('muscle') || label.includes('anatomy')) {
    return '<svg class="course-illustration" viewBox="0 0 120 86" aria-hidden="true"><circle cx="60" cy="20" r="12"></circle><path d="M43 72c2-20 4-33 17-33s15 13 17 33M38 59l22-15 22 15M48 48l-14 25M72 48l14 25"></path></svg>';
  }
  if (label.includes('bone') || label.includes('physiology')) {
    return '<svg class="course-illustration warm" viewBox="0 0 120 86" aria-hidden="true"><path d="M12 70 34 24l18 35 16-27 18 38z"></path><path d="m29 58 14-13 12 10 14-15 21 22"></path><path d="M8 70h104"></path></svg>';
  }
  return '<svg class="course-illustration" viewBox="0 0 120 86" aria-hidden="true"><path d="M30 18c9-8 18-3 30-1 12-2 21-7 30 1 11 10 4 33-3 48-5 11-9 14-14 13-7-1-6-25-13-25s-6 24-13 25c-5 1-9-2-14-13-7-15-14-38-3-48z"></path><path d="M14 67h35M71 67h35"></path></svg>';
}

function courseVisual(course, index = 0, context = 'card') {
  if (course.thumbnail) {
    return `<img class="course-thumbnail-image ${esc(context)}" src="${esc(course.thumbnail)}" alt="${esc(course.title)} course thumbnail">`;
  }
  return courseArt(course, index);
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The thumbnail could not be read.'));
    reader.readAsDataURL(file);
  });
}

async function prepareCourseThumbnail(file) {
  if (!file) return '';
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file for the course thumbnail.');
  if (file.size > 8 * 1024 * 1024) throw new Error('The thumbnail image must be smaller than 8 MB.');
  const source = await fileAsDataUrl(file);
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('The selected thumbnail image could not be opened.'));
    image.src = source;
  });
  const maxWidth = 1000;
  const maxHeight = 650;
  const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.82);
}


function shuffled(values) {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }
  return next;
}

function canonicalQuestionIds(bank) {
  return (bank.questions || []).map(question => question.id);
}

function setQuestionOrder(bank, state, randomize, force = false) {
  const canonical = canonicalQuestionIds(bank);
  const wasRandomized = Boolean(state.randomizeQuestions);
  state.randomizeQuestions = Boolean(randomize);
  if (!state.randomizeQuestions) {
    state.questionIds = canonical;
  } else if (force || !wasRandomized || !Array.isArray(state.questionIds) || state.questionIds.length !== canonical.length) {
    state.questionIds = shuffled(canonical);
  }
  if (!state.questionIds.includes(state.currentQuestionId)) state.currentQuestionId = state.questionIds[0] || null;
  state.updatedAt = now();
}

function syncBankQuestionIds(bank, state) {
  const canonical = canonicalQuestionIds(bank);
  const valid = new Set(canonical);
  const current = (Array.isArray(state.questionIds) ? state.questionIds : []).filter(id => valid.has(id));
  const currentSet = new Set(current);
  const missing = canonical.filter(id => !currentSet.has(id));
  state.questionIds = [...current, ...(state.randomizeQuestions ? shuffled(missing) : missing)];
  if (!state.questionIds.length) state.questionIds = canonical;
  if (!state.questionIds.includes(state.currentQuestionId)) state.currentQuestionId = state.questionIds[0] || null;
}

function normalizeQuestionImage(question, baseUrl = '') {
  if (!question?.image) return;
  if (typeof question.image === 'string') {
    question.image = {
      src: question.image,
      alt: question.imageAlt || '',
      caption: question.imageCaption || ''
    };
  }
  if (!question.image || typeof question.image !== 'object') return;
  const source = String(question.image.src || '').trim();
  if (!source) return;
  if (baseUrl && !/^(data:|blob:)/i.test(source)) {
    try { question.image.src = new URL(source, baseUrl).href; }
    catch { question.image.src = source; }
  } else {
    question.image.src = source;
  }
  question.image.alt ||= '';
  question.image.caption ||= '';
}

function normalizeBankImages(bank, baseUrl = '') {
  for (const question of bank.questions || []) normalizeQuestionImage(question, baseUrl);
  return bank;
}

async function prepareQuestionImage(file) {
  if (!file?.type?.startsWith('image/')) throw new Error(`${file?.name || 'A selected file'} is not an image.`);
  if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name} is larger than 12 MB.`);
  const source = await fileAsDataUrl(file);
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return source;
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error(`${file.name} could not be opened.`));
    image.src = source;
  });
  const maxWidth = 1800;
  const maxHeight = 1400;
  const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.84);
}

function imageLookupKeys(value) {
  const normalized = String(value || '').replaceAll('\\', '/').replace(/^\.\//, '');
  const parts = normalized.split('/');
  return [...new Set([normalized, parts.at(-1) || normalized])];
}

async function embedUploadedQuestionImages(bank, files) {
  normalizeBankImages(bank);
  const imageFiles = [...(files || [])];
  const lookup = new Map();
  for (const file of imageFiles) {
    const dataUrl = await prepareQuestionImage(file);
    for (const key of imageLookupKeys(file.webkitRelativePath || file.name)) lookup.set(key, dataUrl);
    for (const key of imageLookupKeys(file.name)) lookup.set(key, dataUrl);
  }
  const missing = [];
  for (const question of bank.questions || []) {
    if (!question.image?.src) continue;
    const source = String(question.image.src).trim();
    if (/^(data:|blob:|https?:|\/)/i.test(source)) continue;
    const match = imageLookupKeys(source).map(key => lookup.get(key)).find(Boolean);
    if (match) question.image.src = match;
    else missing.push(source);
  }
  if (missing.length) {
    const unique = [...new Set(missing)];
    throw new Error(`Missing image file${unique.length === 1 ? '' : 's'} referenced by the JSON: ${unique.slice(0, 4).join(', ')}${unique.length > 4 ? '…' : ''}. Select matching image files, use a full HTTPS URL, or use repository-relative paths for repository-managed banks.`);
  }
  return bank;
}

function normalizeContentSortMode(value) {
  return normalizeLayoutSortMode(value);
}

function itemKey(value) {
  return String(value ?? '').trim();
}

function validIsoDate(value, fallback = '') {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function firstValidDate(values, fallback = '') {
  for (const value of values) {
    const normalized = validIsoDate(value);
    if (normalized) return normalized;
  }
  return fallback;
}

function latestValidDate(values, fallback = '') {
  const normalized = values.map(value => validIsoDate(value)).filter(Boolean).sort();
  return normalized.at(-1) || fallback;
}

function ensureContentLayoutShape() {
  contentLayout ||= {};
  contentLayout.schemaVersion = 2;
  contentLayout.courses ||= { mode: 'manual', order: [], items: {} };
  contentLayout.courses.mode = normalizeContentSortMode(contentLayout.courses.mode);
  contentLayout.courses.order = Array.isArray(contentLayout.courses.order) ? contentLayout.courses.order.map(itemKey).filter(Boolean) : [];
  contentLayout.courses.items ||= {};
  contentLayout.sessions ||= {};
  return contentLayout;
}

function courseLayoutState() {
  ensureContentLayoutShape();
  return contentLayout.courses;
}

function sessionLayoutState(courseId) {
  ensureContentLayoutShape();
  const key = itemKey(courseId);
  contentLayout.sessions[key] ||= { mode: 'manual', order: [], items: {} };
  const state = contentLayout.sessions[key];
  state.mode = normalizeContentSortMode(state.mode);
  state.order = Array.isArray(state.order) ? state.order.map(itemKey).filter(Boolean) : [];
  state.items ||= {};
  return state;
}

function saveContentLayoutNow({ mirror = true } = {}) {
  try {
    contentLayout = saveContentLayout(contentLayout);
    if (mirror) mirrorContentLayoutToProgress();
    return true;
  } catch (error) {
    console.error('Course and session layout save failed:', error);
    showToast('Course and session order could not be saved in this browser.', 'error');
    return false;
  }
}

function upsertLayoutItem(items, id, dates = {}) {
  const key = itemKey(id);
  if (!key) return;
  const existing = items[key] || {};
  const fallback = now();
  const addedAt = firstValidDate([
    existing.addedAt,
    dates.addedAt,
    dates.createdAt,
    dates.lastUpdated,
    dates.modifiedAt
  ], fallback);
  const modifiedAt = latestValidDate([
    existing.modifiedAt,
    dates.modifiedAt,
    dates.lastUpdated,
    dates.updatedAt,
    addedAt
  ], addedAt);
  items[key] = { addedAt, modifiedAt };
}

function touchCourseLayoutItem(courseId, { addedAt = '', modifiedAt = now() } = {}) {
  const state = courseLayoutState();
  upsertLayoutItem(state.items, courseId, { addedAt, modifiedAt });
  saveContentLayoutNow({ mirror: false });
}

function touchSessionLayoutItem(courseId, bankId, { addedAt = '', modifiedAt = now() } = {}) {
  const state = sessionLayoutState(courseId);
  upsertLayoutItem(state.items, bankId, { addedAt, modifiedAt });
  saveContentLayoutNow({ mirror: false });
}

function seedContentLayoutFromCatalog(sourceCatalog = catalog) {
  ensureContentLayoutShape();
  const courses = sourceCatalog?.courses || [];
  const courseState = courseLayoutState();
  const courseIds = courses.map(course => itemKey(course.id)).filter(Boolean);
  const existingCourseOrder = courseState.order.filter(id => courseIds.includes(id));
  const existingCourseSet = new Set(existingCourseOrder);
  courseState.order = [...existingCourseOrder, ...courseIds.filter(id => !existingCourseSet.has(id))];

  for (const course of courses) {
    const sessionDates = (course.sessions || []).flatMap(session => [session.modifiedAt, session.lastUpdated, session.addedAt, session.createdAt]);
    upsertLayoutItem(courseState.items, course.id, {
      addedAt: course.addedAt || course.createdAt || course.lastUpdated || (course.sessions || [])[0]?.lastUpdated,
      modifiedAt: course.modifiedAt || course.updatedAt || latestValidDate(sessionDates)
    });
    const sessionState = sessionLayoutState(course.id);
    const sessionIds = (course.sessions || []).map(session => itemKey(session.bankId ?? session.id)).filter(Boolean);
    const existingSessionOrder = sessionState.order.filter(id => sessionIds.includes(id));
    const existingSessionSet = new Set(existingSessionOrder);
    sessionState.order = [...existingSessionOrder, ...sessionIds.filter(id => !existingSessionSet.has(id))];
    for (const session of course.sessions || []) {
      const sessionId = itemKey(session.bankId ?? session.id);
      upsertLayoutItem(sessionState.items, sessionId, {
        addedAt: session.addedAt || session.createdAt || session.lastUpdated,
        modifiedAt: session.modifiedAt || session.updatedAt || session.lastUpdated
      });
    }
  }
  saveContentLayoutNow({ mirror: false });
}

function sortByLayout(items, state, options) {
  return sortItemsByLayout(items, state, options);
}

function courseSortMode() {
  return courseLayoutState().mode;
}

function sortOptionsMarkup(current) {
  const options = [
    ['manual', 'Manual'],
    ['alphabetical', 'Alphabetical A–Z'],
    ['added-desc', 'Date added — newest first'],
    ['added-asc', 'Date added — oldest first'],
    ['modified-desc', 'Date modified — newest first'],
    ['modified-asc', 'Date modified — oldest first']
  ];
  return options.map(([value, label]) => `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`).join('');
}

function sortModeLabel(mode, noun = 'items') {
  const labels = {
    manual: `Manual ${noun} order restored.`,
    alphabetical: `${noun[0].toUpperCase() + noun.slice(1)} sorted alphabetically.`,
    'added-desc': `${noun[0].toUpperCase() + noun.slice(1)} sorted by newest added.`,
    'added-asc': `${noun[0].toUpperCase() + noun.slice(1)} sorted by oldest added.`,
    'modified-desc': `${noun[0].toUpperCase() + noun.slice(1)} sorted by most recently modified.`,
    'modified-asc': `${noun[0].toUpperCase() + noun.slice(1)} sorted by least recently modified.`
  };
  return labels[mode] || labels.manual;
}

function orderedCourses(courses) {
  return sortByLayout(courses, courseLayoutState(), {
    id: course => course.id,
    title: course => course.title
  });
}

function mergeVisibleOrder(fullOrder, visibleIds, validIds) {
  return mergeVisibleLayoutOrder(fullOrder, visibleIds, validIds);
}

function setCourseOrder(visibleIds) {
  const state = courseLayoutState();
  const validIds = catalog.courses.map(course => itemKey(course.id)).filter(Boolean);
  const displayedIds = orderedCourses(catalog.courses).map(course => itemKey(course.id));
  state.order = mergeVisibleOrder(displayedIds, visibleIds, validIds);
  state.mode = 'manual';
  state.updatedAt = now();
  saveContentLayoutNow();
  persist();
  rebuildCatalog();
  return true;
}

function setCourseSortMode(mode) {
  const state = courseLayoutState();
  state.mode = normalizeContentSortMode(mode);
  state.updatedAt = now();
  saveContentLayoutNow();
  persist();
  rebuildCatalog();
}

function sessionSortMode(courseId) {
  return sessionLayoutState(courseId).mode;
}

function orderedSessionsForCourse(course) {
  return sortByLayout([...(course.sessions || [])], sessionLayoutState(course.id), {
    id: session => session.bankId ?? session.id,
    title: session => session.title
  });
}

function setSessionOrder(courseId, visibleIds) {
  const course = findCourse(courseId);
  if (!course) return false;
  const state = sessionLayoutState(courseId);
  const validIds = (course.sessions || []).map(session => itemKey(session.bankId ?? session.id)).filter(Boolean);
  const displayedIds = orderedSessionsForCourse(course).map(session => itemKey(session.bankId ?? session.id));
  state.order = mergeVisibleOrder(displayedIds, visibleIds, validIds);
  state.mode = 'manual';
  state.updatedAt = now();
  saveContentLayoutNow();
  persist();
  return true;
}

function sessionOrderFromGrid(courseId) {
  const grid = document.querySelector(`.session-tile-grid[data-session-course="${CSS.escape(itemKey(courseId))}"]`);
  if (!grid) return [];
  return [...grid.querySelectorAll('[data-session-drag-id]')].map(card => itemKey(card.dataset.sessionDragId)).filter(Boolean);
}

function courseOrderFromGrid() {
  const grid = document.querySelector('.course-grid');
  if (!grid) return [];
  return [...grid.querySelectorAll('[data-course-drag-id]')].map(card => itemKey(card.dataset.courseDragId)).filter(Boolean);
}

function commitCourseOrderFromGrid() {
  const visibleIds = courseOrderFromGrid();
  if (!visibleIds.length) return false;
  return setCourseOrder(visibleIds);
}

function commitSessionOrderFromGrid(courseId) {
  const visibleIds = sessionOrderFromGrid(courseId);
  if (!visibleIds.length) return false;
  return setSessionOrder(courseId, visibleIds);
}

function scheduleCourseOrderSave() {
  clearTimeout(courseDragSaveTimer);
  courseDragSaveTimer = setTimeout(() => {
    if (!draggedCourseId || !courseDragMoved) return;
    commitCourseOrderFromGrid();
  }, 80);
}

function scheduleSessionOrderSave(courseId) {
  clearTimeout(sessionDragSaveTimer);
  sessionDragSaveTimer = setTimeout(() => {
    if (!draggedSessionId || draggedSessionCourseId !== courseId || !sessionDragMoved) return;
    commitSessionOrderFromGrid(courseId);
  }, 80);
}

function flushPendingContentOrder() {
  let changed = false;
  clearTimeout(courseDragSaveTimer);
  clearTimeout(sessionDragSaveTimer);
  if (draggedCourseId && courseDragMoved) changed = commitCourseOrderFromGrid() || changed;
  if (draggedSessionCourseId && sessionDragMoved) changed = commitSessionOrderFromGrid(draggedSessionCourseId) || changed;
  return changed;
}

function setSessionSortMode(courseId, mode) {
  const state = sessionLayoutState(courseId);
  state.mode = normalizeContentSortMode(mode);
  state.updatedAt = now();
  saveContentLayoutNow();
  persist();
}

function reconcileContentLayoutFromProgress({ replace = false } = {}) {
  const incoming = progress.contentLayout;
  if (incoming && incoming.schemaVersion === 2) {
    if (replace || !contentLayout?.updatedAt || String(incoming.updatedAt || '') >= String(contentLayout.updatedAt || '')) {
      contentLayout = clone(incoming);
    }
  } else {
    ensureContentLayoutShape();
    const legacyCourseOrder = managedContent().courseOrder || [];
    if (legacyCourseOrder.length && (!courseLayoutState().order.length || replace)) courseLayoutState().order = legacyCourseOrder.map(itemKey).filter(Boolean);
    for (const [courseId, order] of Object.entries(managedContent().sessionOrders || {})) {
      const state = sessionLayoutState(courseId);
      if (Array.isArray(order) && (!state.order.length || replace)) state.order = order.map(itemKey).filter(Boolean);
      const legacyMode = managedContent().sessionSortModes?.[courseId];
      if (legacyMode === 'alphabetical') state.mode = 'alphabetical';
    }
  }
  ensureContentLayoutShape();
  saveContentLayoutNow({ mirror: false });
}

function latestSessionRef() {
  const sessions = allSessions();
  const withState = sessions
    .map(session => ({ session, updatedAt: progress.banks[session.bankId]?.updatedAt || progress.banks[session.bankId]?.startedAt || '' }))
    .filter(item => item.updatedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return withState[0]?.session || sessions[0] || null;
}

function managedContent() {
  progress.managedContent ||= { courses: [], courseOrder: [], sessionOrders: {}, sessionSortModes: {} };
  progress.managedContent.courses ||= [];
  progress.managedContent.courseOrder ||= [];
  progress.managedContent.sessionOrders ||= {};
  progress.managedContent.sessionSortModes ||= {};
  return progress.managedContent;
}

function rebuildCatalog() {
  const next = clone(baseCatalog);
  next.courses ||= [];
  for (const overlay of managedContent().courses) {
    const existing = next.courses.find(course => course.id === overlay.id);
    if (existing) {
      if (Object.prototype.hasOwnProperty.call(overlay, 'title')) existing.title = overlay.title || existing.title;
      if (Object.prototype.hasOwnProperty.call(overlay, 'description')) existing.description = overlay.description || '';
      if (Array.isArray(overlay.tags)) existing.tags = overlay.tags;
      if (Object.prototype.hasOwnProperty.call(overlay, 'thumbnail')) existing.thumbnail = overlay.thumbnail || '';
      if (overlay.addedAt) existing.addedAt = overlay.addedAt;
      if (overlay.modifiedAt) existing.modifiedAt = overlay.modifiedAt;
      existing.sessions ||= [];
      for (const session of overlay.sessions || []) {
        const index = existing.sessions.findIndex(item => item.bankId === session.bankId);
        if (index >= 0) existing.sessions[index] = { ...existing.sessions[index], ...session };
        else existing.sessions.push(session);
      }
    } else {
      next.courses.push({
        id: overlay.id,
        title: overlay.title || overlay.id,
        description: overlay.description || '',
        tags: overlay.tags || [],
        thumbnail: overlay.thumbnail || '',
        addedAt: overlay.addedAt || '',
        modifiedAt: overlay.modifiedAt || '',
        sessions: overlay.sessions || [],
        managed: true
      });
    }
  }
  next.courses = next.courses.map(course => ({
    ...course,
    sessions: [...(course.sessions || [])]
  }));
  seedContentLayoutFromCatalog(next);
  next.courses = orderedCourses(next.courses);
  catalog = next;
}

function managedCourse(courseId) {
  return managedContent().courses.find(course => course.id === courseId);
}

function ensureManagedCourse(courseId) {
  let course = managedCourse(courseId);
  if (!course) {
    course = { id: courseId, sessions: [] };
    managedContent().courses.push(course);
  }
  course.sessions ||= [];
  return course;
}

function isManagedCourse(courseId) {
  const course = managedCourse(courseId);
  return Boolean(course?.managed || (!baseCatalog.courses || !baseCatalog.courses.some(item => item.id === courseId)));
}

function isManagedSession(bankId) {
  return managedContent().courses.some(course => (course.sessions || []).some(session => session.bankId === bankId));
}

function applySettings() {
  document.documentElement.dataset.theme = settings.theme || 'system';
  document.documentElement.style.setProperty('--font-scale', String(settings.fontScale || 1));
}

function setSaveStatus(text, kind = 'ok') {
  saveStatus = { text, kind };
  const chip = document.querySelector('.status-chip');
  if (chip) {
    chip.className = `status-chip ${kind === 'busy' ? 'busy' : kind === 'error' ? 'error' : ''}`;
    const label = chip.querySelector('.status-text');
    if (label) label.textContent = text;
  }
}

function mirrorContentLayoutToProgress() {
  ensureContentLayoutShape();
  progress.contentLayout = clone(contentLayout);
  const content = managedContent();
  content.courseOrder = [...courseLayoutState().order];
  for (const [courseId, layout] of Object.entries(contentLayout.sessions || {})) {
    content.sessionOrders[courseId] = [...(layout.order || [])];
    content.sessionSortModes[courseId] = layout.mode === 'alphabetical' ? 'alphabetical' : 'manual';
  }
}

async function flushLocalSave() {
  if (localSaveInFlight) return localSaveInFlight;
  localSaveInFlight = (async () => {
    while (localSaveRequested) {
      localSaveRequested = false;
      setSaveStatus('Saving…', 'busy');
      mirrorContentLayoutToProgress();
      await saveProgressDurable(progress);
    }
    setSaveStatus('Saved locally', 'ok');
  })().catch(error => {
    console.error(error);
    setSaveStatus('Save failed', 'error');
    showToast(error.message || 'Local study data could not be saved.', 'error');
    throw error;
  }).finally(() => {
    localSaveInFlight = null;
    if (localSaveRequested) queueMicrotask(() => flushLocalSave().catch(() => {}));
  });
  return localSaveInFlight;
}

function persist() {
  localSaveRequested = true;
  flushLocalSave().catch(() => {});
  return localSaveInFlight;
}

function showToast(message, kind = '') {
  document.querySelector('.toast')?.remove();
  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  node.textContent = message;
  document.body.append(node);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.remove(), 3500);
}

function allSessions() {
  return catalog.courses.flatMap(course => (course.sessions || []).map(session => ({ ...session, course })));
}

function findCourse(courseId) {
  return catalog.courses.find(course => course.id === courseId);
}

function findSession(bankId) {
  return allSessions().find(session => session.bankId === bankId);
}

function sessionStats(bankId, countHint = 0) {
  const state = progress.banks[bankId];
  const total = state?.questionIds?.length || countHint || 0;
  const records = Object.values(state?.questions || {});
  const answered = records.filter(record => record.submitted || (state?.mode === 'exam' && record.selected?.length)).length;
  const correct = records.filter(record => record.correct === true).length;
  const incorrect = records.filter(record => record.correct === false).length;
  const flagged = records.filter(record => record.flagged).length;
  return { total, answered, correct, incorrect, flagged, completion: pct(answered, total) };
}

function overallStats() {
  const sessions = allSessions();
  let totalQuestions = 0;
  let answered = 0;
  let flagged = 0;
  let completed = 0;
  for (const session of sessions) {
    const stats = sessionStats(session.bankId, session.questionCount);
    totalQuestions += stats.total || session.questionCount || 0;
    answered += stats.answered;
    flagged += stats.flagged;
    if (stats.total && stats.answered >= stats.total) completed += 1;
  }
  return { courses: catalog.courses.length, sessions: sessions.length, totalQuestions, answered, flagged, completed };
}

function validateQuestion(question, ids) {
  const errors = [];
  if (!question || typeof question !== 'object') return ['Question is not an object.'];
  if (!question.id) errors.push('Missing question id.');
  else if (ids.has(question.id)) errors.push(`Duplicate question id: ${question.id}`);
  else ids.add(question.id);
  if (!question.stem) errors.push(`Question ${question.id || '?'} has no stem.`);
  const supported = ['single-choice', 'multiple-select', 'true-false', 'fill-blank', 'short-answer', 'numeric'];
  if (!supported.includes(question.type)) errors.push(`Unsupported type in ${question.id || '?'}: ${question.type}`);
  if (['single-choice', 'multiple-select'].includes(question.type)) {
    if (!Array.isArray(question.options) || question.options.length < 2) errors.push(`${question.id} requires at least two options.`);
    const optionIds = new Set((question.options || []).map(option => option.id));
    const answers = Array.isArray(question.correctAnswer) ? question.correctAnswer : [question.correctAnswer];
    for (const answer of answers) if (!optionIds.has(answer)) errors.push(`${question.id} has invalid correct answer: ${answer}`);
  }
  if (question.type === 'true-false' && typeof question.correctAnswer !== 'boolean') errors.push(`${question.id} needs a Boolean correctAnswer.`);
  if (question.image) {
    const image = typeof question.image === 'string' ? { src: question.image } : question.image;
    if (!image || typeof image !== 'object' || !String(image.src || '').trim()) errors.push(`${question.id} has an image without a src value.`);
  }
  return errors;
}

function validateBank(bank) {
  const errors = [];
  if (!bank || typeof bank !== 'object') return ['The file is not a JSON object.'];
  if (!bank.bankId) errors.push('Missing bankId.');
  if (!Array.isArray(bank.questions)) errors.push('Missing questions array.');
  const ids = new Set();
  for (const question of bank.questions || []) errors.push(...validateQuestion(question, ids));
  return errors;
}

async function loadBank(bankId) {
  if (loadedBanks.has(bankId)) return loadedBanks.get(bankId);
  if (progress.customReviews?.[bankId]) {
    const bank = await buildReviewBank(progress.customReviews[bankId]);
    loadedBanks.set(bankId, bank);
    return bank;
  }
  if (progress.customBanks?.[bankId]) {
    const bank = normalizeBankImages(progress.customBanks[bankId]);
    const errors = validateBank(bank);
    if (errors.length) throw new Error(errors.slice(0, 4).join(' '));
    loadedBanks.set(bankId, bank);
    return bank;
  }
  const session = findSession(bankId);
  if (!session) throw new Error('Question bank was not found in courses.json.');
  const response = await fetch(session.path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load ${session.path} (${response.status}).`);
  const bank = normalizeBankImages(await response.json(), response.url);
  const errors = validateBank(bank);
  if (errors.length) throw new Error(errors.slice(0, 4).join(' '));
  loadedBanks.set(bankId, bank);
  return bank;
}

async function buildReviewBank(config) {
  const questions = [];
  for (const ref of config.questionRefs || []) {
    const sourceBank = await loadBank(ref.bankId);
    const sourceQuestion = sourceBank.questions.find(question => question.id === ref.questionId);
    if (!sourceQuestion) continue;
    questions.push({
      ...clone(sourceQuestion),
      id: `${ref.bankId}::${ref.questionId}`,
      reviewSource: {
        bankId: ref.bankId,
        questionId: ref.questionId,
        sessionTitle: ref.sessionTitle || sourceBank.sessionTitle || sourceBank.title || ref.bankId
      }
    });
  }
  return {
    schemaVersion: 1,
    bankId: config.bankId,
    courseId: config.courseId,
    courseTitle: config.courseTitle,
    sessionId: 'custom-course-review',
    sessionTitle: config.title || 'Custom course review',
    description: config.description || 'Selected flagged and incorrect questions from multiple sessions.',
    version: config.version || '1.0.0',
    kind: 'course-review',
    originCourseId: config.courseId,
    questions
  };
}

function sourceRecordFor(question) {
  const source = question?.reviewSource;
  if (!source) return null;
  const sourceState = progress.banks[source.bankId];
  if (!sourceState) return null;
  return recordFor(sourceState, source.questionId);
}

function syncReviewRecord(question, record) {
  const sourceRecord = sourceRecordFor(question);
  if (!sourceRecord) return;

  // Custom reviews behave like fresh retests. Metadata can stay synchronized,
  // but an old source answer is replaced only after the retest is submitted.
  sourceRecord.flagged = Boolean(record.flagged);
  sourceRecord.confidence = record.confidence || '';
  sourceRecord.note = record.note || '';

  if (record.submitted) {
    sourceRecord.selected = clone(record.selected || []);
    sourceRecord.submitted = true;
    sourceRecord.correct = record.correct;
    sourceRecord.firstCorrect = record.firstCorrect;
    sourceRecord.attempts = record.attempts || 0;
  }
  sourceRecord.updatedAt = now();
}

function retestRecordFromSource(sourceRecord) {
  const fresh = blankRecord();
  if (!sourceRecord) return fresh;
  fresh.flagged = Boolean(sourceRecord.flagged);
  fresh.confidence = sourceRecord.confidence || '';
  fresh.note = sourceRecord.note || '';
  fresh.firstCorrect = sourceRecord.firstCorrect ?? null;
  fresh.attempts = sourceRecord.attempts || 0;
  return fresh;
}

function reviewNavigation(bank, index, total, position = '', question = null, record = null, stats = null) {
  const sessionTitle = bank.sessionTitle || bank.title || bank.bankId;
  const completion = Number.isFinite(Number(stats?.completion))
    ? Math.max(0, Math.min(100, Math.round(Number(stats.completion))))
    : Math.round(((index + 1) / Math.max(total, 1)) * 100);

  if (position === 'bottom' && question && record) {
    return `<nav class="quiz-nav inside bottom">
      <button class="btn secondary" data-action="previous-question" ${index <= 0 ? 'disabled' : ''}>← Previous</button>
      <button class="btn ${record.flagged ? 'warning' : 'secondary'} quiz-nav-flag" data-action="toggle-flag" data-question="${esc(question.id)}">${record.flagged ? '★ Flagged' : '☆ Flag question'}</button>
      <button class="btn primary" data-action="next-question" ${index >= total - 1 ? 'disabled' : ''}>Next →</button>
    </nav>`;
  }

  return `<nav class="quiz-nav inside top quiz-session-nav">
    <div class="quiz-nav-left">
      <button class="quiz-focus-sidebar-toggle" data-action="toggle-sidebar" aria-label="${settings.sidebarCollapsed ? 'Show navigation' : 'Hide navigation'}" title="${settings.sidebarCollapsed ? 'Show navigation' : 'Hide navigation'}">${settings.sidebarCollapsed ? '☰' : '‹'}</button>
      <button class="btn secondary" data-action="previous-question" ${index <= 0 ? 'disabled' : ''}>← Previous</button>
    </div>
    <div class="quiz-nav-progress" aria-label="${esc(sessionTitle)}, question ${index + 1} of ${total}, ${completion}% complete">
      <strong class="quiz-nav-session">${esc(sessionTitle)}</strong>
      <div class="quiz-nav-progress-row">
        <span>Question ${index + 1} of ${total}</span>
        <span class="quiz-nav-progress-percent">${completion}%</span>
      </div>
      <div class="quiz-nav-mini-track" aria-hidden="true"><span style="width:${completion}%"></span></div>
    </div>
    <button class="btn primary" data-action="next-question" ${index >= total - 1 ? 'disabled' : ''}>Next →</button>
  </nav>`;
}

function blankRecord() {
  return {
    selected: [],
    submitted: false,
    correct: null,
    firstCorrect: null,
    attempts: 0,
    flagged: false,
    confidence: '',
    note: '',
    updatedAt: now()
  };
}

function ensureBankState(bank, mode = settings.defaultMode || 'study') {
  let state = progress.banks[bank.bankId];
  if (!state || state.bankVersion !== (bank.version || '1.0.0')) {
    const oldQuestions = state?.questions || {};
    const randomizeQuestions = Boolean(state?.randomizeQuestions);
    const questionIds = randomizeQuestions ? shuffled(canonicalQuestionIds(bank)) : canonicalQuestionIds(bank);
    state = {
      bankId: bank.bankId,
      bankVersion: bank.version || '1.0.0',
      courseId: bank.courseId,
      sessionId: bank.sessionId,
      title: bank.sessionTitle || bank.title || bank.bankId,
      mode,
      examSubmitted: false,
      randomizeQuestions,
      currentQuestionId: questionIds[0] || null,
      questionIds,
      reviewFilter: 'all',
      startedAt: state?.startedAt || now(),
      updatedAt: now(),
      completedAt: null,
      questions: Object.fromEntries(bank.questions.map(question => [question.id, oldQuestions[question.id] || blankRecord()]))
    };
    progress.banks[bank.bankId] = state;
    persist();
  } else {
    state.randomizeQuestions = Boolean(state.randomizeQuestions);
    syncBankQuestionIds(bank, state);
  }
  return state;
}

function resetBank(bank, mode = settings.defaultMode || 'study', randomizeQuestions = Boolean(progress.banks[bank.bankId]?.randomizeQuestions)) {
  const questionIds = randomizeQuestions ? shuffled(canonicalQuestionIds(bank)) : canonicalQuestionIds(bank);
  progress.banks[bank.bankId] = {
    bankId: bank.bankId,
    bankVersion: bank.version || '1.0.0',
    courseId: bank.courseId,
    sessionId: bank.sessionId,
    title: bank.sessionTitle || bank.title || bank.bankId,
    mode,
    examSubmitted: false,
    randomizeQuestions,
    currentQuestionId: questionIds[0] || null,
    questionIds,
    reviewFilter: 'all',
    startedAt: now(),
    updatedAt: now(),
    completedAt: null,
    questions: Object.fromEntries(bank.questions.map(question => [question.id, blankRecord()]))
  };
  persist();
}

function recordFor(state, questionId) {
  if (!state.questions[questionId]) state.questions[questionId] = blankRecord();
  return state.questions[questionId];
}

function normalizedText(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[.,;:!?]/g, '').replace(/\s+/g, ' ');
}

function isCorrect(question, selected) {
  if (question.type === 'true-false') return selected[0] === String(question.correctAnswer);
  if (question.type === 'single-choice') return selected[0] === question.correctAnswer;
  if (question.type === 'multiple-select') {
    const expected = [...question.correctAnswer].sort();
    const actual = [...selected].sort();
    return expected.length === actual.length && expected.every((value, index) => value === actual[index]);
  }
  if (question.type === 'fill-blank' || question.type === 'short-answer') {
    const answers = Array.isArray(question.correctAnswer) ? question.correctAnswer : [question.correctAnswer];
    return answers.map(normalizedText).includes(normalizedText(selected[0]));
  }
  if (question.type === 'numeric') {
    const value = Number(selected[0]);
    if (!Number.isFinite(value)) return false;
    if (Array.isArray(question.acceptedRange)) return value >= question.acceptedRange[0] && value <= question.acceptedRange[1];
    const tolerance = Number(question.tolerance || 0);
    return Math.abs(value - Number(question.correctAnswer)) <= tolerance;
  }
  return false;
}

function answerLabel(question, answer) {
  if (answer === undefined || answer === null || answer === '' || (Array.isArray(answer) && answer.length === 0)) return 'Unanswered';
  if (question.type === 'true-false') return answer === true || answer === 'true' ? 'True' : 'False';
  if (['single-choice', 'multiple-select'].includes(question.type)) {
    const values = Array.isArray(answer) ? answer : [answer];
    return values.map(id => question.options.find(option => option.id === id)?.text || id).join('; ');
  }
  return Array.isArray(answer) ? answer.join(', ') : String(answer);
}

function correctAnswerLabel(question) {
  if (question.type === 'true-false') return question.correctAnswer ? 'True' : 'False';
  return answerLabel(question, question.correctAnswer);
}

function bankStats(bank, state) {
  const records = bank.questions.map(question => recordFor(state, question.id));
  const answered = records.filter(record => record.submitted || (state.mode === 'exam' && record.selected.length)).length;
  const graded = records.filter(record => record.correct !== null);
  const correct = graded.filter(record => record.correct).length;
  const incorrect = graded.filter(record => !record.correct).length;
  const flagged = records.filter(record => record.flagged).length;
  const low = records.filter(record => record.confidence === 'low').length;
  return {
    total: bank.questions.length,
    answered,
    correct,
    incorrect,
    flagged,
    low,
    accuracy: pct(correct, graded.length),
    completion: pct(answered, bank.questions.length)
  };
}

function filteredQuestionIds(bank, state) {
  const filter = state.reviewFilter || 'all';
  const byId = new Map(bank.questions.map(question => [question.id, question]));
  const order = (state.questionIds || canonicalQuestionIds(bank)).filter(id => byId.has(id));
  return order.filter(id => {
    const record = recordFor(state, id);
    if (filter === 'incorrect') return record.correct === false;
    if (filter === 'flagged') return record.flagged;
    if (filter === 'unanswered') return !record.submitted && !record.selected.length;
    if (filter === 'low') return record.confidence === 'low';
    return true;
  });
}

function currentQuestion(bank, state) {
  const ids = filteredQuestionIds(bank, state);
  if (!ids.length) return { question: null, ids, index: -1 };
  if (!ids.includes(state.currentQuestionId)) state.currentQuestionId = ids[0];
  const index = ids.indexOf(state.currentQuestionId);
  return { question: bank.questions.find(item => item.id === state.currentQuestionId), ids, index };
}

function markCompleteIfNeeded(bank, state) {
  const stats = bankStats(bank, state);
  if (stats.answered >= stats.total && (state.mode !== 'exam' || state.examSubmitted)) {
    state.completedAt ||= now();
  }
}

function header(activeMode = '') {
  const displayName = settings.profileName || 'Amin';
  return `
    <header class="topbar">
      <button class="header-icon-btn sidebar-toggle" data-action="toggle-sidebar" aria-label="${settings.sidebarCollapsed ? 'Show navigation' : 'Hide navigation'}" title="${settings.sidebarCollapsed ? 'Show navigation' : 'Hide navigation'}">${settings.sidebarCollapsed ? '☰' : '‹'}</button>
      <label class="global-search" aria-label="Search courses and questions">
        ${uiIcon('search')}
        <input id="global-search" type="search" value="${esc(searchTerm)}" placeholder="Search courses, topics, and questions">
      </label>
      <div class="top-actions">
        ${activeMode ? `<span class="mode-chip">${esc(activeMode)}</span>` : ''}
        <span class="status-chip ${saveStatus.kind === 'busy' ? 'busy' : saveStatus.kind === 'error' ? 'error' : ''}"><span class="status-dot"></span><span class="status-text">${esc(saveStatus.kind === 'ok' ? 'Local-first' : saveStatus.text)}</span></span>
        <button class="header-icon-btn" data-action="cloud-open" aria-label="Open private synchronization" title="Private sync">${uiIcon('cloud')}</button>
        <span class="profile-avatar" aria-hidden="true">${esc(profileInitials())}</span>
        <button class="profile-name" data-action="settings">${esc(displayName)}</button>
      </div>
    </header>`;
}

function sidebar() {
  const [section] = idFromHash().split('/');
  const active = section === 'course' || section === 'session' ? 'courses' : section === 'quiz' || section === 'results' ? 'review' : section || 'home';
  const nav = (key, label, iconName, action) => `<button class="side-nav-item ${active === key ? 'active' : ''}" data-action="${action}" ${active === key ? 'aria-current="page"' : ''}>${uiIcon(iconName)}<span>${label}</span></button>`;
  return `<aside class="sidebar">
    <button class="side-brand" data-action="home" aria-label="Amin's Dent Study dashboard">
      <span class="side-brand-mark"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18.2 12.7c6.1-5.2 12.4-1.8 13.8-1.3 1.4-.5 7.7-3.9 13.8 1.3 7.7 6.6 2.8 20.5-1.6 30.2-3 6.7-5.7 9.3-8.2 8.4-4.2-1.6-1.4-17.8-4-17.8s.2 16.2-4 17.8c-2.5.9-5.2-1.7-8.2-8.4-4.4-9.7-9.3-23.6-1.6-30.2Z"></path></svg></span>
      <strong>Amin's Dent Study</strong>
    </button>
    <nav class="side-nav" aria-label="Primary navigation">
      ${nav('home', 'Dashboard', 'dashboard', 'home')}
      ${nav('courses', 'Courses', 'courses', 'browse-courses')}
      ${nav('review', 'Review', 'review', 'global-review')}
      ${nav('flagged', 'Flagged', 'flag', 'global-flagged')}
      ${nav('progress', 'Progress', 'progress', 'progress')}
    </nav>
    <nav class="side-nav side-nav-bottom" aria-label="Utilities">
      <button class="side-nav-item" data-action="export-progress">${uiIcon('download')}<span>Backup &amp; transfer</span></button>
      <button class="side-nav-item" data-action="help">${uiIcon('help')}<span>Help &amp; support</span></button>
      <button class="side-nav-item ${active === 'settings' ? 'active' : ''}" data-action="settings">${uiIcon('settings')}<span>Settings</span></button>
    </nav>
  </aside>`;
}

function footer() {
  return `<footer><span>Amin’s private study space—focused, organized, and always ready for the next session.</span></footer>`;
}

function layout(content, activeMode = '', pageClass = '', options = {}) {
  const hideHeader = Boolean(options.hideHeader);
  return `<div class="app-shell ${settings.sidebarCollapsed ? 'sidebar-collapsed' : ''} ${hideHeader ? 'focus-layout' : ''}">${sidebar()}<section class="workspace">${hideHeader ? '' : header(activeMode)}<main class="page ${pageClass}">${content}</main>${footer()}</section></div>${renderModal()}`;
}

function courseCardMarkup(course, index = 0) {
  const sessions = course.sessions || [];
  const totals = sessions.reduce((sum, session) => {
    const s = sessionStats(session.bankId, session.questionCount);
    sum.questions += s.total || session.questionCount || 0;
    sum.answered += s.answered;
    sum.flagged += s.flagged;
    return sum;
  }, { questions: 0, answered: 0, flagged: 0 });
  const completion = pct(totals.answered, totals.questions);
  return `<article class="course-card dashboard-course-card" data-course-card="${esc(course.id)}" data-course-drag-id="${esc(course.id)}" draggable="true">
    <div class="course-card-top">
      <div class="course-art">${courseVisual(course, index, 'card')}</div>
      <button class="course-thumbnail-button" data-action="replace-course-thumbnail" data-course="${esc(course.id)}" aria-label="Replace ${esc(course.title)} thumbnail" title="Replace thumbnail">${uiIcon('image')}</button>
      <input class="course-thumbnail-quick-input sr-only" data-course="${esc(course.id)}" type="file" accept="image/*" tabindex="-1" aria-hidden="true">
    </div>
    <div class="course-type">${esc(course.tags?.[0] || (isManagedCourse(course.id) ? 'Imported course' : 'Dental sciences'))}</div>
    <h3><button data-action="open-course" data-course="${esc(course.id)}">${esc(course.title)}</button></h3>
    <p>${esc(course.description || '')}</p>
    <div class="course-card-footer">
      <div class="course-facts"><span>${totals.questions} questions</span><span>${sessions.length} session${sessions.length === 1 ? '' : 's'}</span></div>
      <div class="course-progress-line"><strong>${completion}%</strong><div class="progress-track"><div style="width:${completion}%"></div></div><span>${completion ? 'In progress' : 'Not started'}</span></div>
      <div class="course-card-actions">
        <button class="btn link" data-action="open-course" data-course="${esc(course.id)}">Open course ${uiIcon('arrow')}</button>
        ${isManagedCourse(course.id) ? `<button class="btn text-danger small" data-action="remove-course" data-course="${esc(course.id)}">Delete</button>` : ''}
      </div>
    </div>
  </article>`;
}

function visibleCourses() {
  return catalog.courses
    .filter(course => courseFilter === 'all' || course.id === courseFilter)
    .filter(course => {
      if (!searchTerm) return true;
      const haystack = [course.title, course.description, ...(course.tags || []), ...(course.sessions || []).flatMap(session => [session.title, session.description, ...(session.tags || [])])].join(' ').toLowerCase();
      return haystack.includes(searchTerm.toLowerCase());
    });
}

function renderHome() {
  const stats = overallStats();
  const progressPercent = pct(stats.answered, stats.totalQuestions);
  const recent = latestSessionRef();
  const courseOptions = catalog.courses.map(course => `<option value="${esc(course.id)}" ${courseFilter === course.id ? 'selected' : ''}>${esc(course.title)}</option>`).join('');
  const currentCourseSort = courseSortMode();
  const cards = visibleCourses().map(courseCardMarkup).join('');
  const firstName = (settings.profileName || 'Amin').trim().split(/\s+/)[0] || 'Amin';
  const content = `
    <section class="dashboard-hero">
      <div class="welcome-panel">
        <span class="eyebrow">Your private study space</span>
        <h1>Welcome back, ${esc(firstName)}</h1>
        <p>Stay consistent, keep building your clinical knowledge, and master what matters.</p>
        <div class="hero-actions">
          ${recent ? `<button class="btn primary large" data-action="resume-bank" data-bank="${esc(recent.bankId)}">Continue session ${uiIcon('arrow')}</button>` : `<button class="btn primary large" data-action="browse-courses">Browse courses ${uiIcon('arrow')}</button>`}
          <button class="btn quiet" data-action="add-course">${uiIcon('plus')} Add course</button>
        </div>
      </div>
      <aside class="progress-overview-card">
        <div class="overview-head"><h2>Your progress</h2><span class="sync-pill">✓ ${cloudSettings.repo ? 'Cloud ready' : 'Saved locally'}</span></div>
        <div class="overview-body">
          <div class="donut" style="--progress:${progressPercent}"><span>${progressPercent}%</span></div>
          <div><strong>Overall progress</strong><p>${progressPercent ? 'You’re making great progress.' : 'Start a session to build momentum.'}</p></div>
        </div>
        <div class="overview-stats"><div>${uiIcon('courses')}<strong>${stats.answered}</strong><span>Answered</span></div><div>${uiIcon('progress')}<strong>${stats.sessions}</strong><span>Sessions</span></div><div>${uiIcon('flag')}<strong>${stats.flagged}</strong><span>Flagged</span></div></div>
        <div class="weekly-goal"><div><span>Study goal</span><span>${stats.answered} / ${Math.max(stats.totalQuestions, 1)} questions</span></div><div class="progress-track"><div style="width:${progressPercent}%"></div></div></div>
      </aside>
    </section>
    <section id="courses" class="dashboard-courses">
      <div class="section-heading">
        <div><span class="eyebrow">Continue learning</span><h2>Your courses</h2></div>
        <div class="heading-actions"><label class="compact-sort-control"><span>Course order</span><select id="course-sort" aria-label="Sort courses">${sortOptionsMarkup(currentCourseSort)}</select></label><select id="course-filter" aria-label="Filter courses"><option value="all">All courses</option>${courseOptions}</select><button class="btn secondary" data-action="add-session">${uiIcon('plus')} Add session</button><button class="btn primary" data-action="add-course">${uiIcon('plus')} Add course</button></div>
      </div>
      <div class="course-grid">${cards}<button class="add-course-card" data-action="add-course"><span>${uiIcon('plus')}</span><strong>Add another course</strong><small>Create it from this dashboard—no code editing required.</small></button></div>
      ${cards ? '' : '<div class="empty">No courses match the current search.</div>'}
    </section>`;
  app.innerHTML = layout(content, '', 'dashboard-page');
}

function renderCourseLibrary() {
  const courseOptions = catalog.courses.map(course => `<option value="${esc(course.id)}" ${courseFilter === course.id ? 'selected' : ''}>${esc(course.title)}</option>`).join('');
  const currentCourseSort = courseSortMode();
  const cards = visibleCourses().map(courseCardMarkup).join('');
  const content = `<section class="library-head"><span class="eyebrow">Course library</span><div class="library-title-row"><div><h1>All courses</h1><p>Open a course, create a new one, or attach another session without editing the source code.</p></div><div class="heading-actions"><button class="btn secondary" data-action="add-session">${uiIcon('plus')} Add session</button><button class="btn primary" data-action="add-course">${uiIcon('plus')} Add course</button></div></div></section>
  <div class="toolbar library-toolbar"><div class="library-sort-tools"><label class="compact-sort-control"><span>Course order</span><select id="course-sort">${sortOptionsMarkup(currentCourseSort)}</select></label><select id="course-filter"><option value="all">All courses</option>${courseOptions}</select></div><span>${visibleCourses().length} course${visibleCourses().length === 1 ? '' : 's'}</span></div>
  <div class="course-grid library-grid">${cards}<button class="add-course-card" data-action="add-course"><span>${uiIcon('plus')}</span><strong>Add course</strong><small>Course management stays inside the webpage.</small></button></div>`;
  app.innerHTML = layout(content, 'Courses', 'library-page');
}

function renderCourse(courseId) {
  const course = findCourse(courseId);
  if (!course) return renderError('Course not found.');
  const currentSessionSort = sessionSortMode(course.id);
  const orderedSessions = orderedSessionsForCourse(course);
  const sessions = orderedSessions.map((session, index) => {
    const stats = sessionStats(session.bankId, session.questionCount);
    return `<article class="session-tile ${index === 0 ? 'featured' : ''}" data-session-drag-id="${esc(session.bankId)}" data-session-course-id="${esc(course.id)}" draggable="true" title="Drag to reorder this session">
      <label class="session-review-check" title="Include this session in a custom course review"><input type="checkbox" data-review-session value="${esc(session.bankId)}" ${(stats.flagged || stats.incorrect) ? 'checked' : ''}><span>Review</span></label>
      <button class="session-tile-main" data-action="open-session" data-bank="${esc(session.bankId)}">
        <span class="session-kicker">${esc(session.category || `Session ${index + 1}`)}</span>
        <strong>${esc(session.title)}</strong>
        <small>${session.questionCount || stats.total} questions · ${stats.answered} tackled · v${esc(session.version || '1.0')}</small>
        <div class="session-count-row"><span><strong>${session.questionCount || stats.total}</strong> total</span><span><strong>${stats.answered}</strong> tackled</span><span><strong>${stats.completion}%</strong> complete</span></div>
        <div class="progress-track"><div style="width:${stats.completion}%"></div></div>
      </button>
      <div class="session-tile-actions"><button class="btn link small" data-action="open-session" data-bank="${esc(session.bankId)}">Open</button>${isManagedSession(session.bankId) ? `<button class="btn text-danger small" data-action="remove-session" data-course="${esc(course.id)}" data-bank="${esc(session.bankId)}">Delete</button>` : ''}</div>
    </article>`;
  }).join('');
  const totals = (course.sessions || []).reduce((acc, session) => {
    const stat = sessionStats(session.bankId, session.questionCount);
    acc.questions += stat.total || session.questionCount || 0;
    acc.answered += stat.answered;
    acc.flagged += stat.flagged;
    acc.incorrect += stat.incorrect;
    return acc;
  }, { questions: 0, answered: 0, flagged: 0, incorrect: 0 });
  const reviewEligible = totals.flagged + totals.incorrect;
  const content = `
    <button class="text-back" data-action="browse-courses">← Course library</button>
    <section class="course-detail-hero">
      <div class="course-detail-art">${courseVisual(course, 0, 'hero')}</div>
      <div class="course-detail-copy"><span class="eyebrow">${isManagedCourse(course.id) ? 'Imported course' : 'Dental course'}</span><h1>${esc(course.title)}</h1><p>${esc(course.description || '')}</p><div class="course-meta">${(course.tags || []).map(tag => `<span class="badge">${esc(tag)}</span>`).join('')}</div><div class="course-detail-actions"><button class="btn secondary small" data-action="edit-course" data-course="${esc(course.id)}">Customize course</button></div></div>
      <div class="course-version"><span>Course total</span><strong>${totals.questions}</strong><small>questions</small></div>
    </section>
    <section class="sessions-panel">
      <div class="sessions-panel-head"><div><span class="eyebrow">Available sessions</span><h2>Choose a question bank</h2><p class="session-order-hint">Drag session cards to arrange them manually, or sort by title, date added, or date modified.</p></div><div class="sessions-panel-actions"><label class="session-sort-control"><span>Session order</span><select id="session-sort" data-course="${esc(course.id)}">${sortOptionsMarkup(currentSessionSort)}</select></label><button class="btn primary" data-action="add-session" data-course="${esc(course.id)}">${uiIcon('plus')} Add session</button></div></div>
      <div class="session-tile-grid" data-session-course="${esc(course.id)}">${sessions}<button class="add-session-tile" data-action="add-session" data-course="${esc(course.id)}"><span>${uiIcon('plus')} Add session</span><strong>Import JSON question bank</strong><small>It will be grouped under ${esc(course.title)}.</small></button></div>
    </section>
    <section class="course-lower-grid">
      <article class="card course-summary-card"><span class="eyebrow">Course progress</span><h2>${esc(course.title)}</h2><p>${totals.answered} of ${totals.questions} questions answered across ${(course.sessions || []).length} session${(course.sessions || []).length === 1 ? '' : 's'}.</p><div class="progress-track large-track"><div style="width:${pct(totals.answered, totals.questions)}%"></div></div><div class="summary-mini-stats"><div><strong>${totals.answered}</strong><span>Answered</span></div><div><strong>${totals.incorrect}</strong><span>Incorrect</span></div><div><strong>${totals.flagged}</strong><span>Flagged</span></div></div></article>
      <article class="card custom-review-builder"><div><span class="eyebrow">Custom retest</span><h2>Retest across sessions</h2><p>Select session tiles above, then combine flagged or incorrect questions into a fresh question set. Previous answers stay hidden until you answer each question again.</p></div><div class="review-filter-options"><label><input id="review-include-flagged" type="checkbox" checked> Flagged questions</label><label><input id="review-include-incorrect" type="checkbox" checked> Incorrect questions</label><button class="btn primary" data-action="build-course-review" data-course="${esc(course.id)}" ${reviewEligible ? '' : 'disabled'}>Build custom retest</button></div><p class="review-count-note">${reviewEligible} matching records available before duplicate removal.</p></article>
    </section>`;
  app.innerHTML = layout(content, 'Course', 'course-page');
}

async function renderSession(bankId) {
  renderLoading('Loading session…');
  try {
    const bank = await loadBank(bankId);
    const session = findSession(bankId);
    const state = ensureBankState(bank);
    const stats = bankStats(bank, state);
    const courseId = bank.courseId || session?.course?.id || '';
    const topics = [...new Set(bank.questions.map(question => question.topic).filter(Boolean))];
    const content = `
      <button class="text-back" data-action="open-course" data-course="${esc(courseId)}">← Course library</button>
      <section class="session-hero-card">
        <div class="session-hero-icon">${courseVisual(session?.course || { title: bank.courseTitle || '' }, 0, 'hero')}</div>
        <div><span class="eyebrow">${esc(session?.course?.title || bank.courseTitle || 'Course')}</span><h1>${esc(bank.sessionTitle || bank.title || session?.title || bank.bankId)}</h1><p>${esc(bank.description || session?.description || '')}</p><div class="course-meta">${topics.slice(0, 6).map(topic => `<span class="badge">${esc(topic)}</span>`).join('')}</div></div>
        <div class="course-version"><span>Bank version</span><strong>${esc(bank.version || '1.0.0')}</strong><small>${bank.questions.length} questions</small></div>
      </section>
      <section class="session-setup-grid">
        <article class="card session-summary-card"><div class="card-title-line"><span class="eyebrow">Session</span><span class="question-count-pill">${bank.questions.length} questions</span></div><h2>${esc(bank.sessionTitle || bank.title || bank.bankId)}</h2><p>${esc(bank.description || '')}</p><div class="progress-summary"><strong>${stats.answered}</strong><span>answered</span><div class="progress-track"><div style="width:${stats.completion}%"></div></div><strong>${stats.completion}%</strong></div><button class="btn link" data-action="review-filter" data-bank="${esc(bankId)}" data-filter="all">Review existing progress →</button><div class="summary-mini-stats"><div><strong>${stats.correct}</strong><span>Correct</span></div><div><strong>${stats.incorrect}</strong><span>Incorrect</span></div><div><strong>${stats.flagged}</strong><span>Flagged</span></div></div></article>
        <article class="card study-setup-card"><span class="eyebrow">Quiz setup</span><h2>How do you want to study?</h2><div class="study-mode-grid">
          <button class="study-mode-card selected" data-action="start-mode" data-bank="${esc(bankId)}" data-mode="study"><strong>Study</strong><span>Immediate explanations</span></button>
          <button class="study-mode-card" data-action="start-mode" data-bank="${esc(bankId)}" data-mode="exam"><strong>Exam</strong><span>Feedback after submission</span></button>
          <button class="study-mode-card" data-action="review-filter" data-bank="${esc(bankId)}" data-filter="all"><strong>Practice</strong><span>Flexible question set</span></button>
          <button class="study-mode-card" data-action="review-filter" data-bank="${esc(bankId)}" data-filter="incorrect" ${stats.incorrect ? '' : 'disabled'}><strong>Mastery</strong><span>Prioritize missed items</span></button>
        </div><div class="feedback-toggle"><div><strong>Immediate feedback</strong><span>Show explanations after each answer</span></div><span class="visual-switch on"></span></div><div class="randomize-control"><div><strong>Randomize question order</strong><span>Shuffle this session once and preserve that order across devices until you reshuffle or turn it off.</span></div><label class="toggle-control"><input id="session-randomize" data-bank="${esc(bankId)}" type="checkbox" ${state.randomizeQuestions ? 'checked' : ''}><span class="toggle-track" aria-hidden="true"></span><span class="sr-only">Randomize question order</span></label></div><div class="randomize-status"><span>${state.randomizeQuestions ? 'Current question order is randomized.' : 'Questions currently follow the bank order.'}</span><button class="btn secondary small" data-action="reshuffle-session" data-bank="${esc(bankId)}">Reshuffle now</button></div><div class="hero-actions"><button class="btn primary large" data-action="start-mode" data-bank="${esc(bankId)}" data-mode="study">${stats.answered ? 'Continue study' : 'Start studying'} ${uiIcon('arrow')}</button><button class="btn secondary" data-action="reset-bank" data-bank="${esc(bankId)}">Reset session</button></div></article>
      </section>
      <section class="card topics-card"><div><span class="eyebrow">Session coverage</span><h2>Topics in this question bank</h2></div><div class="course-meta">${topics.map(topic => `<span class="badge">${esc(topic)}</span>`).join('') || '<span class="muted">No topic labels supplied.</span>'}</div></section>`;
    app.innerHTML = layout(content, 'Session', 'session-page');
  } catch (error) {
    renderError(error.message);
  }
}

function renderQuestionInput(question, record, reveal, mode) {
  if (question.type === 'true-false') {
    const options = [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }];
    return answerButtons(question, { ...question, options }, record, reveal, mode);
  }
  if (['single-choice', 'multiple-select'].includes(question.type)) return answerButtons(question, question, record, reveal, mode);
  const value = record.selected[0] || '';
  const inputType = question.type === 'numeric' ? 'number' : 'text';
  return `<div class="text-answer">
    <input id="text-answer" type="${inputType}" value="${esc(value)}" placeholder="Type your answer" ${record.submitted && reveal ? 'disabled' : ''}>
    ${(!record.submitted || !reveal) ? `<button class="btn primary" data-action="submit-text-answer" data-question="${esc(question.id)}">${mode === 'exam' ? 'Save answer' : 'Check answer'}</button>` : ''}
  </div>`;
}

function answerButtons(originalQuestion, question, record, reveal, mode) {
  const multiple = originalQuestion.type === 'multiple-select';
  const optionsHtml = question.options.map((option, index) => {
    const selected = record.selected.includes(option.id);
    const correct = originalQuestion.type === 'true-false'
      ? String(originalQuestion.correctAnswer) === option.id
      : (Array.isArray(originalQuestion.correctAnswer) ? originalQuestion.correctAnswer.includes(option.id) : originalQuestion.correctAnswer === option.id);
    let className = selected ? 'selected' : '';
    let stateLabel = selected ? 'Selected' : '';
    if (reveal) {
      if (correct) { className = 'correct'; stateLabel = 'Correct'; }
      else if (selected) { className = 'incorrect'; stateLabel = 'Your answer'; }
    }
    return `<button class="answer ${className}" data-action="select-answer" data-question="${esc(originalQuestion.id)}" data-option="${esc(option.id)}" ${record.submitted && reveal ? 'disabled' : ''} aria-pressed="${selected}">
      <span class="answer-key">${letters[index]}</span><span>${esc(option.text)}</span><span class="answer-state">${esc(stateLabel)}</span>
    </button>`;
  }).join('');
  return `<div class="answers">${optionsHtml}</div>${multiple && (!record.submitted || !reveal) ? `<button class="btn primary" style="margin-top:12px" data-action="submit-multiple" data-question="${esc(originalQuestion.id)}" ${record.selected.length ? '' : 'disabled'}>${mode === 'exam' ? 'Save selected answers' : 'Check selected answers'}</button>` : ''}`;
}

function renderFeedback(question, record, reveal) {
  if (!reveal || record.correct === null) return '';
  const explanation = question.explanation || {};
  const options = question.options || [];
  const optionNotes = explanation.whyOthersIncorrect || {};
  return `<section class="feedback ${record.correct ? 'correct' : 'incorrect'}">
    <div class="feedback-title">${record.correct ? '✓ Correct' : '✕ Incorrect'}</div>
    <p><strong>Correct answer:</strong> ${esc(correctAnswerLabel(question))}</p>
    ${explanation.summary ? `<p>${esc(explanation.summary)}</p>` : ''}
    ${explanation.whyCorrect ? `<h3>Why it is correct</h3><p>${esc(explanation.whyCorrect)}</p>` : ''}
    ${Object.keys(optionNotes).length ? `<h3>Why the other choices are not best</h3><div class="option-explanations">${Object.entries(optionNotes).map(([id, text]) => `<div><strong>${esc(options.find(option => option.id === id)?.text || id)}:</strong> ${esc(text)}</div>`).join('')}</div>` : ''}
    ${explanation.clinicalConnection ? `<h3>Clinical connection</h3><p>${esc(explanation.clinicalConnection)}</p>` : ''}
    ${explanation.keyTakeaway ? `<div class="key-takeaway"><strong>Key takeaway</strong><br>${esc(explanation.keyTakeaway)}</div>` : ''}
    <button class="btn secondary small" style="margin-top:14px" data-action="retry-question" data-question="${esc(question.id)}">Retry question</button>
  </section>`;
}

async function renderQuiz(bankId) {
  renderLoading('Loading quiz…');
  try {
    const bank = await loadBank(bankId);
    const state = ensureBankState(bank);
    if (state.reviewFilter === 'low') state.reviewFilter = 'all';
    const { question, ids, index } = currentQuestion(bank, state);
    if (!question) {
      const content = `<section class="card"><h1>No questions match this review filter.</h1><button class="btn primary" data-action="review-filter" data-bank="${esc(bankId)}" data-filter="all">Return to all questions</button></section>`;
      app.innerHTML = layout(content, state.mode === 'exam' ? 'Exam mode' : 'Study mode');
      return;
    }
    const record = recordFor(state, question.id);
    const stats = bankStats(bank, state);
    const reveal = state.mode === 'study' ? record.submitted : state.examSubmitted;
    const figure = question.image?.src ? `<figure class="figure-box"><img src="${esc(question.image.src)}" alt="${esc(question.image.alt || '')}" loading="lazy">${question.image.caption ? `<figcaption>${esc(question.image.caption)}</figcaption>` : ''}</figure>` : '';
    const navigator = ids.map((id, position) => {
      const r = recordFor(state, id);
      const classes = [id === question.id ? 'current' : '', r.correct === true ? 'correct' : '', r.correct === false ? 'incorrect' : '', r.flagged ? 'flagged' : ''].filter(Boolean).join(' ');
      return `<button class="qnum ${classes}" data-action="goto-question" data-question="${esc(id)}" aria-label="Question ${position + 1}">${position + 1}</button>`;
    }).join('');
    const activeMode = `${state.mode === 'exam' ? 'Exam' : 'Study'} · ${state.reviewFilter === 'all' ? 'All questions' : state.reviewFilter}${state.randomizeQuestions ? ' · Randomized' : ''}`;
    const content = `
      <div class="quiz-layout">
        <section class="quiz-main">
          <article class="card question-card">
            ${reviewNavigation(bank, index, ids.length, 'top', question, record, stats)}
            <div class="question-meta"><span class="badge blue">Question ${state.randomizeQuestions ? index + 1 : bank.questions.findIndex(item => item.id === question.id) + 1}</span><span class="badge">${esc(question.type.replaceAll('-', ' '))}</span><span class="badge ${question.difficulty === 'hard' ? 'red' : question.difficulty === 'easy' ? 'green' : 'amber'}">${esc(question.difficulty || 'medium')}</span>${question.topic ? `<span class="badge">${esc(question.topic)}</span>` : ''}${question.reviewSource ? `<span class="badge purple">From ${esc(question.reviewSource.sessionTitle)}</span>` : ''}</div>
            <h2>${esc(question.stem)}</h2>
            ${question.instruction ? `<p class="question-instruction">${esc(question.instruction)}</p>` : ''}
            ${figure}
            ${renderQuestionInput(question, record, reveal, state.mode)}
            ${reviewNavigation(bank, index, ids.length, 'bottom', question, record, stats)}
            ${renderFeedback(question, record, reveal)}
          </article>
        </section>
        <aside class="quiz-side ${settings.quizToolsHidden ? 'is-hidden' : ''}">
          <div class="quiz-side-toolbar"><strong>Study tools</strong><button class="btn secondary small" data-action="toggle-quiz-tools">Hide all</button></div>
          <details class="panel collapsible-panel" open><summary>Session statistics</summary><div class="collapsible-content"><div class="stat-grid"><div><strong>${stats.answered}</strong><span>Answered</span></div><div><strong>${stats.correct}</strong><span>Correct</span></div><div><strong>${stats.incorrect}</strong><span>Incorrect</span></div><div><strong>${stats.flagged}</strong><span>Flagged</span></div></div></div></details>
          <details class="panel navigator-panel collapsible-panel" open><summary>Question navigator</summary><div class="collapsible-content"><div class="navigator-tools"><select id="navigator-filter"><option value="all" ${state.reviewFilter === 'all' ? 'selected' : ''}>All questions</option><option value="incorrect" ${state.reviewFilter === 'incorrect' ? 'selected' : ''}>Incorrect</option><option value="flagged" ${state.reviewFilter === 'flagged' ? 'selected' : ''}>Flagged</option><option value="unanswered" ${state.reviewFilter === 'unanswered' ? 'selected' : ''}>Unanswered</option></select></div><div class="question-grid">${navigator}</div></div></details>
          <details class="panel note-box collapsible-panel"><summary>Personal note</summary><div class="collapsible-content"><textarea id="question-note" data-question="${esc(question.id)}" placeholder="Private note saved with this question">${esc(record.note || '')}</textarea></div></details>
          <details class="panel collapsible-panel"><summary>Session actions</summary><div class="collapsible-content"><div class="review-list">
            ${state.mode === 'exam' && !state.examSubmitted ? `<button class="btn success" data-action="submit-exam" data-bank="${esc(bankId)}">Submit exam</button>` : ''}
            ${state.mode === 'exam' && state.examSubmitted ? `<button class="btn primary" data-action="show-results" data-bank="${esc(bankId)}">View results</button>` : ''}
            <button class="btn secondary" data-action="reshuffle-session" data-bank="${esc(bankId)}">${state.randomizeQuestions ? 'Reshuffle questions' : 'Randomize questions'}</button>
            ${bank.kind === 'course-review'
              ? `<button class="btn secondary" data-action="open-course" data-course="${esc(bank.originCourseId)}">Exit review</button>`
              : `<button class="btn secondary" data-action="open-session" data-bank="${esc(bankId)}">Exit session</button>`}
            <button class="btn secondary" data-action="export-progress">Export backup</button>
          </div></div></details>
        </aside>
        ${settings.quizToolsHidden ? `<button class="quiz-tools-reopen" data-action="toggle-quiz-tools">Show study tools</button>` : ''}
      </div>`;
    app.innerHTML = layout(content, '', 'quiz-page', { hideHeader: true });
  } catch (error) {
    renderError(error.message);
  }
}

async function renderResults(bankId) {
  renderLoading('Calculating results…');
  try {
    const bank = await loadBank(bankId);
    const state = ensureBankState(bank);
    const stats = bankStats(bank, state);
    const topicMap = new Map();
    for (const question of bank.questions) {
      const record = recordFor(state, question.id);
      const key = question.topic || 'Uncategorized';
      const item = topicMap.get(key) || { total: 0, correct: 0 };
      item.total += 1;
      if (record.correct) item.correct += 1;
      topicMap.set(key, item);
    }
    const topicRows = [...topicMap.entries()].map(([topic, item]) => `<div class="review-item"><div class="review-item-top"><span class="badge">${esc(topic)}</span><span class="badge ${pct(item.correct,item.total) >= 70 ? 'green' : 'red'}">${pct(item.correct,item.total)}%</span></div><div class="progress-track"><div style="width:${pct(item.correct,item.total)}%"></div></div></div>`).join('');
    const content = `
      <button class="btn link" data-action="open-session" data-bank="${esc(bankId)}">← Session</button>
      <section class="card">
        <div class="results-hero"><div class="results-score">${stats.accuracy}%</div><div><h1>Session results</h1><p>${esc(bank.sessionTitle || bank.title || bank.bankId)}</p></div></div>
        <div class="results-grid"><div><strong>${stats.correct}</strong><span>Correct</span></div><div><strong>${stats.incorrect}</strong><span>Incorrect</span></div><div><strong>${stats.total - stats.answered}</strong><span>Unanswered</span></div><div><strong>${stats.flagged}</strong><span>Flagged</span></div></div>
        <div class="hero-actions"><button class="btn primary" data-action="review-filter" data-bank="${esc(bankId)}" data-filter="incorrect" ${stats.incorrect ? '' : 'disabled'}>Review incorrect</button><button class="btn secondary" data-action="review-filter" data-bank="${esc(bankId)}" data-filter="flagged" ${stats.flagged ? '' : 'disabled'}>Review flagged</button><button class="btn secondary" data-action="export-results" data-bank="${esc(bankId)}">Export CSV</button><button class="btn secondary" data-action="open-session" data-bank="${esc(bankId)}">Return to session</button></div>
      </section>
      <section class="card"><h2>Performance by topic</h2><div class="review-list">${topicRows}</div></section>`;
    app.innerHTML = layout(content, 'Results');
  } catch (error) {
    renderError(error.message);
  }
}

function reviewTakeawayMarkup(question) {
  const explanation = question.explanation;
  if (!explanation) return '<p>No takeaway was supplied for this question.</p>';
  if (typeof explanation === 'string') return `<p>${esc(explanation)}</p>`;
  const parts = [];
  if (explanation.keyTakeaway) parts.push(`<div><strong>Key takeaway</strong><p>${esc(explanation.keyTakeaway)}</p></div>`);
  if (explanation.summary) parts.push(`<div><strong>Summary</strong><p>${esc(explanation.summary)}</p></div>`);
  if (explanation.clinicalConnection) parts.push(`<div><strong>Clinical connection</strong><p>${esc(explanation.clinicalConnection)}</p></div>`);
  if (!parts.length && explanation.whyCorrect) parts.push(`<div><strong>Why it is correct</strong><p>${esc(explanation.whyCorrect)}</p></div>`);
  return parts.join('') || '<p>No takeaway was supplied for this question.</p>';
}

async function collectReviewItems(filter = 'all') {
  const items = [];
  for (const session of allSessions()) {
    let bank;
    try { bank = await loadBank(session.bankId); } catch { continue; }
    const state = progress.banks[session.bankId] || ensureBankState(bank, 'study');
    for (const question of bank.questions) {
      const record = recordFor(state, question.id);
      const answered = record.submitted || record.selected?.length;
      const matches = filter === 'all'
        || (filter === 'correct' && record.correct === true)
        || (filter === 'incorrect' && record.correct === false)
        || (filter === 'unanswered' && !answered)
        || (filter === 'flagged' && record.flagged);
      if (!matches) continue;
      items.push({ session, bank, question, record });
    }
  }
  return items;
}

async function renderGlobalReview(filter = 'all') {
  const supportedFilters = ['all', 'correct', 'incorrect', 'unanswered', 'flagged'];
  if (!supportedFilters.includes(filter)) filter = 'all';
  renderLoading('Building review center…');
  const items = await collectReviewItems(filter);
  const allCount = allSessions().reduce((sum, session) => sum + (sessionStats(session.bankId, session.questionCount).total || session.questionCount || 0), 0);
  const labels = { all: 'All', correct: 'Correct', incorrect: 'Incorrect', unanswered: 'Unanswered', flagged: 'Flagged' };
  const tabs = Object.entries(labels).map(([key, label]) => `<button class="review-filter-tab ${filter === key ? 'active' : ''}" data-action="global-review-filter" data-filter="${key}">${label}</button>`).join('');
  const rows = items.map((item, index) => {
    const status = item.record.correct === true ? 'Correct' : item.record.correct === false ? 'Incorrect' : item.record.selected?.length ? 'Saved' : 'Unanswered';
    return `<article class="global-review-item">
      <span class="review-number">${index + 1}</span>
      <div class="review-question-copy"><div class="review-badges"><span>${esc(item.session.course?.title || item.bank.courseTitle || 'Course')}</span><span>${esc(item.bank.sessionTitle || item.session.title)}</span>${item.question.topic ? `<span>${esc(item.question.topic)}</span>` : ''}<span>${esc(item.question.difficulty || 'medium')}</span><span>${esc(item.question.type.replaceAll('-', ' '))}</span></div><h3>${esc(item.question.stem)}</h3><details class="review-answer-disclosure"><summary>Show answer and feedback</summary><div class="review-answer-panel"><div class="review-record-grid"><div><small>Your answer</small><span>${esc(answerLabel(item.question, item.record.selected))}</span></div><div><small>Status</small><span class="status-${status.toLowerCase()}">${status}</span></div><div class="correct-answer-cell"><small>Correct answer</small><span>${esc(correctAnswerLabel(item.question))}</span></div></div><div class="review-feedback-content">${reviewTakeawayMarkup(item.question)}</div></div></details></div>
      <div class="review-row-actions"><button class="btn secondary small" data-action="open-review-question" data-bank="${esc(item.bank.bankId)}" data-question="${esc(item.question.id)}">Open</button><button class="btn ${item.record.flagged ? 'warning' : 'secondary'} small" data-action="toggle-review-flag" data-bank="${esc(item.bank.bankId)}" data-question="${esc(item.question.id)}">${item.record.flagged ? 'Unflag' : 'Flag'}</button></div>
    </article>`;
  }).join('');
  const content = `<section class="review-center-head"><div><span class="eyebrow">Review center</span><h1>Turn results into mastery</h1><p>Answers, status, correct answers, takeaways, and summaries stay together in one dropdown for each question.</p></div><div class="review-total"><strong>${items.length}</strong><span>shown of ${allCount}</span></div></section><div class="review-filter-tabs">${tabs}</div><section class="global-review-list">${rows || `<div class="empty">No ${esc(labels[filter].toLowerCase())} questions are available yet.</div>`}</section>`;
  app.innerHTML = layout(content, filter === 'flagged' ? 'Flagged' : 'Review', 'review-page');
}

function renderProgressPage() {
  const stats = overallStats();
  const courseRows = catalog.courses.map(course => {
    const totals = (course.sessions || []).reduce((acc, session) => {
      const s = sessionStats(session.bankId, session.questionCount);
      acc.total += s.total || session.questionCount || 0; acc.answered += s.answered; acc.correct += s.correct; acc.flagged += s.flagged; return acc;
    }, { total: 0, answered: 0, correct: 0, flagged: 0 });
    const completion = pct(totals.answered, totals.total);
    return `<article class="progress-course-row"><div class="progress-course-art">${courseVisual(course, 0, 'progress')}</div><div><h3>${esc(course.title)}</h3><p>${totals.answered} of ${totals.total} answered · ${totals.correct} correct · ${totals.flagged} flagged</p><div class="progress-track"><div style="width:${completion}%"></div></div></div><strong>${completion}%</strong><button class="btn secondary small" data-action="open-course" data-course="${esc(course.id)}">Open</button></article>`;
  }).join('');
  const content = `<section class="library-head"><span class="eyebrow">Learning analytics</span><div class="library-title-row"><div><h1>Your progress</h1><p>A course-by-course view of saved answers, completion, and review priorities.</p></div><button class="btn primary" data-action="export-progress">${uiIcon('download')} Export backup</button></div></section><section class="progress-kpi-grid"><div><strong>${pct(stats.answered, stats.totalQuestions)}%</strong><span>Overall completion</span></div><div><strong>${stats.answered}</strong><span>Answers saved</span></div><div><strong>${stats.flagged}</strong><span>Flagged questions</span></div><div><strong>${stats.completed}</strong><span>Completed sessions</span></div></section><section class="progress-course-list">${courseRows || '<div class="empty">No courses are available.</div>'}</section>`;
  app.innerHTML = layout(content, 'Progress', 'progress-page');
}

function renderSettings() {
  const content = `
    <button class="btn link" data-action="home">← Dashboard</button>
    <section class="card">
      <h1>Settings</h1>
      <p class="muted">These preferences are saved only in your browser.</p>
      <div class="settings-grid">
        <div class="field"><label for="setting-theme">Theme</label><select id="setting-theme"><option value="system" ${settings.theme === 'system' ? 'selected' : ''}>System</option><option value="light" ${settings.theme === 'light' ? 'selected' : ''}>Light</option><option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Dark</option></select></div>
        <div class="field"><label for="setting-font">Font size</label><select id="setting-font"><option value="0.9" ${settings.fontScale === .9 ? 'selected' : ''}>Small</option><option value="1" ${settings.fontScale === 1 ? 'selected' : ''}>Default</option><option value="1.1" ${settings.fontScale === 1.1 ? 'selected' : ''}>Large</option><option value="1.2" ${settings.fontScale === 1.2 ? 'selected' : ''}>Extra large</option></select></div>
        <div class="field"><label for="setting-mode">Default quiz mode</label><select id="setting-mode"><option value="study" ${settings.defaultMode === 'study' ? 'selected' : ''}>Study mode</option><option value="exam" ${settings.defaultMode === 'exam' ? 'selected' : ''}>Exam mode</option></select></div>
        <div class="field"><label for="setting-profile">Local profile name</label><input id="setting-profile" value="${esc(settings.profileName || '')}"></div>
      </div>
      <div class="hero-actions"><button class="btn primary" data-action="save-settings">Save settings</button><button class="btn secondary" data-action="export-progress">Export all progress</button><button class="btn secondary" data-action="import-progress">Import progress</button><button class="btn danger" data-action="clear-all-progress">Clear all progress</button></div>
    </section>`;
  app.innerHTML = layout(content, 'Settings', 'narrow');
}

function renderHelp() {
  const content = `
    <button class="btn link" data-action="home">← Dashboard</button>
    <section class="card">
      <h1>Manage the site from the dashboard</h1>
      <div class="alert info"><strong>Deployment:</strong> this build is configured for your Amin's Dent Study site at <a href="https://aminkhormali.github.io/DDS/">https://aminkhormali.github.io/DDS/</a>.</div>
      <h2>Add, customize, and sort courses</h2>
      <p>Choose <strong>Add course</strong> to create one. Drag a course card itself to reorder it. Use the single image button on the thumbnail to upload or replace its picture; full course details remain editable from the course page. The order and thumbnail are included in backups and private synchronization.</p>
      <h2>Add a session</h2>
      <p>Choose <strong>Add session</strong>, select a course, enter the session details, and upload a compatible JSON question bank. The uploaded bank and catalog entry are stored with your browser data and are included when you use Export progress or private synchronization.</p>
      <div class="hero-actions"><button class="btn secondary" data-action="download-bank-template">Download question-bank template</button></div>
      <h2>Arrange sessions</h2>
      <p>Open a course and drag its session cards into the order you prefer. Use the <strong>Session order</strong> menu to switch between your saved manual arrangement, alphabetical order, date added, and date modified. The same sorting choices are available for courses on the dashboard and Course Library.</p>
      <h2>Build a cross-session review</h2>
      <p>Open a course, select the sessions you want, choose Flagged, Incorrect, or both, and select <strong>Build custom retest</strong>. The retest starts with previous answers hidden. On the Review page, each question has one collapsed <strong>Show answer and feedback</strong> panel containing your answer, status, correct answer, takeaway, and summary.</p>
      <h2>Randomized sessions</h2>
      <p>Open a session and enable <strong>Randomize question order</strong>. The shuffled order is saved locally and through Private sync. Use <strong>Reshuffle now</strong> whenever you want a new order, or turn the switch off to restore the source-bank order.</p>
      <h2>Image questions</h2>
      <p>Each image is referenced from the JSON through <code>question.image.src</code>. Repository-managed banks should store the image as a separate file and use a relative path. When adding a session from the webpage, select the matching image files in the same dialog; the app embeds compressed copies into the private synced bank. Full HTTPS URLs and data URLs are also supported.</p>
      <h2>Cross-device content and progress</h2>
      <p>The optional Cloud sync screen saves the complete data package—including browser-added courses, uploaded sessions, progress, flags, and notes—to a separate private Private storage repository.</p>
      <div class="alert warning"><strong>Security:</strong> use a fine-grained token restricted to the private progress repository with only “Contents: Read and write.” Never place a token in public source code.</div>
      <h2>Repository-managed content</h2>
      <p>The original <code>courses.json</code> and <code>questions/</code> files still work. Browser-added content overlays the repository catalog, so you can use either workflow.</p>
    </section>`;
  app.innerHTML = layout(content, 'Help', 'narrow');
}

function renderLoading(message) {
  app.innerHTML = layout(`<section class="loading"><div><div class="spinner"></div><p>${esc(message)}</p></div></section>`);
}

function renderError(message) {
  app.innerHTML = layout(`<section class="card"><h1>Unable to open this page</h1><div class="alert error">${esc(message)}</div><div class="hero-actions"><button class="btn primary" data-action="home">Return to dashboard</button></div></section>`, '', 'narrow');
}

function renderModal() {
  if (!modal) return '';
  if (modal.type === 'course') {
    const existing = modal.courseId ? findCourse(modal.courseId) : null;
    const title = existing ? 'Customize course' : 'Add a course';
    return `<div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="${title}"><section class="modal">
      <div class="modal-head"><h2>${title}</h2><button class="modal-close" data-action="modal-close" aria-label="Close">×</button></div>
      <div class="settings-grid">
        <div class="field"><label for="new-course-title">Course title</label><input id="new-course-title" value="${esc(existing?.title || '')}" placeholder="DENT 602"></div>
        <div class="field"><label for="new-course-id">Course ID</label><input id="new-course-id" value="${esc(existing?.id || '')}" ${existing ? 'disabled' : ''} placeholder="Auto-generated from title"><small>${existing ? 'Course IDs stay fixed so session links and progress remain intact.' : 'Use letters, numbers, and hyphens.'}</small></div>
        <div class="field full"><label for="new-course-description">Description</label><textarea id="new-course-description" rows="3" placeholder="What this course covers">${esc(existing?.description || '')}</textarea></div>
        <div class="field full"><label for="new-course-tags">Tags</label><input id="new-course-tags" value="${esc((existing?.tags || []).join(', '))}" placeholder="Anatomy, Physiology, Dental school"><small>Separate tags with commas.</small></div>
        <div class="field full course-thumbnail-field"><label for="course-thumbnail-file">Course thumbnail</label><div class="thumbnail-editor"><div id="course-thumbnail-preview" class="thumbnail-preview">${existing?.thumbnail ? `<img src="${esc(existing.thumbnail)}" alt="Current course thumbnail">` : `<div class="thumbnail-placeholder">${courseArt(existing || { title: 'Dental course' })}</div>`}</div><div><input id="course-thumbnail-file" type="file" accept="image/*"><small>Upload JPG, PNG, WEBP, or SVG. The image is resized and stored with your synced course data.</small>${existing?.thumbnail ? '<label class="remove-thumbnail-option"><input id="remove-course-thumbnail" type="checkbox"> Remove current thumbnail</label>' : ''}</div></div></div>
      </div>
      <div class="modal-actions"><button class="btn secondary" data-action="modal-close">Cancel</button><button class="btn primary" data-action="save-new-course">${existing ? 'Save changes' : 'Add course'}</button></div>
    </section></div>`;
  }
  if (modal.type === 'session') {
    const courseOptions = catalog.courses.map(course => `<option value="${esc(course.id)}" ${modal.courseId === course.id ? 'selected' : ''}>${esc(course.title)}</option>`).join('');
    return `<div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add session"><section class="modal">
      <div class="modal-head"><h2>Add a session</h2><button class="modal-close" data-action="modal-close" aria-label="Close">×</button></div>
      <div class="alert info">Upload a JSON question bank and, when needed, the image files referenced by its questions. Metadata will be updated to match the selected course and session.</div>
      <div class="settings-grid" style="margin-top:14px">
        <div class="field"><label for="new-session-course">Course</label><select id="new-session-course">${courseOptions}</select></div>
        <div class="field"><label for="new-session-title">Session title</label><input id="new-session-title" placeholder="Session 3 — Development"></div>
        <div class="field"><label for="new-session-id">Session ID</label><input id="new-session-id" placeholder="Auto-generated from title"></div>
        <div class="field"><label for="new-session-category">Category</label><input id="new-session-category" placeholder="Foundations"></div>
        <div class="field full"><label for="new-session-description">Description</label><textarea id="new-session-description" rows="3" placeholder="What this session covers"></textarea></div>
        <div class="field full"><label for="managed-bank-file">Question-bank JSON file</label><input id="managed-bank-file" type="file" accept="application/json,.json"><small>The file must contain a questions array and valid question IDs.</small></div>
        <div class="field full"><label for="managed-bank-images">Question images (optional)</label><input id="managed-bank-images" type="file" accept="image/*" multiple><small>For browser-added sessions, select every local image referenced by <code>question.image.src</code>. Matching filenames are compressed and embedded into the private synced bank. Full HTTPS URLs and data URLs do not require a separate upload.</small></div>
      </div>
      <div class="modal-actions"><button class="btn secondary" data-action="download-bank-template">Standard template</button><button class="btn secondary" data-action="download-image-bank-template">Image-bank template</button><button class="btn secondary" data-action="modal-close">Cancel</button><button class="btn primary" data-action="save-new-session">Add session</button></div>
    </section></div>`;
  }
  if (modal.type === 'cloud') {
    const token = getSessionToken();
    return `<div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Private synchronization"><section class="modal">
      <div class="modal-head"><h2>Private study synchronization</h2><button class="modal-close" data-action="modal-close" aria-label="Close">×</button></div>
      <div class="alert info">Use a separate private repository for progress. For security, the access token is stored only in this browser tab and must be entered separately in every browser or device.</div>
      ${modal.cloudError ? `<div class="alert error"><strong>Synchronization failed:</strong> ${esc(modal.cloudError)}</div>` : ''}
      ${modal.cloudSuccess ? `<div class="alert success">${esc(modal.cloudSuccess)}</div>` : ''}
      <div class="settings-grid" style="margin-top:14px">
        <div class="field"><label>Storage account</label><input id="cloud-owner" value="${esc(cloudSettings.owner)}" placeholder="Aminkhormali"></div>
        <div class="field"><label>Repository</label><input id="cloud-repo" value="${esc(cloudSettings.repo)}" placeholder="DDS-progress"></div>
        <div class="field"><label>Branch</label><input id="cloud-branch" value="${esc(cloudSettings.branch || 'main')}"></div>
        <div class="field"><label>Progress file path</label><input id="cloud-path" value="${esc(cloudSettings.path || 'progress/dental-study-progress.json')}"></div>
        <div class="field full"><label>Private repository access token</label><input id="cloud-token" type="password" value="${esc(token)}" autocomplete="off" placeholder="Paste token for this session"><small>Use a token restricted to the private progress repository with only Contents read/write access.</small></div>
      </div>
      <div class="modal-actions"><button class="btn secondary" data-action="cloud-load">Load saved study data</button><button class="btn primary" data-action="cloud-save">Save study data</button></div>
    </section></div>`;
  }
  return '';
}

function refreshModal() {
  const existing = document.querySelector('.modal-backdrop');
  if (existing) existing.remove();
  if (modal) document.body.insertAdjacentHTML('beforeend', renderModal());
}

async function route() {
  const value = idFromHash();
  const [section, arg1] = value.split('/');
  if (section === 'home' || !section) return renderHome();
  if (section === 'courses') return renderCourseLibrary();
  if (section === 'course') return renderCourse(arg1);
  if (section === 'session') return renderSession(arg1);
  if (section === 'quiz') return renderQuiz(arg1);
  if (section === 'results') return renderResults(arg1);
  if (section === 'review') return renderGlobalReview(arg1 || 'all');
  if (section === 'flagged') return renderGlobalReview('flagged');
  if (section === 'progress') return renderProgressPage();
  if (section === 'settings') return renderSettings();
  if (section === 'help') return renderHelp();
  renderHome();
}

function moveQuestion(direction) {
  const [, bankId] = idFromHash().split('/');
  const bank = loadedBanks.get(bankId);
  const state = progress.banks[bankId];
  if (!bank || !state) return;
  const { ids, index } = currentQuestion(bank, state);
  const next = index + direction;
  if (next < 0 || next >= ids.length) return;
  state.currentQuestionId = ids[next];
  state.updatedAt = now();
  persist();
  renderQuiz(bankId);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function selectAnswer(questionId, optionId) {
  const [, bankId] = idFromHash().split('/');
  const bank = loadedBanks.get(bankId);
  const state = progress.banks[bankId];
  const question = bank.questions.find(item => item.id === questionId);
  const record = recordFor(state, questionId);
  const reveal = state.mode === 'study' ? record.submitted : state.examSubmitted;
  if (reveal) return;
  if (question.type === 'multiple-select') {
    record.selected = record.selected.includes(optionId) ? record.selected.filter(id => id !== optionId) : [...record.selected, optionId];
  } else {
    record.selected = [optionId];
    if (state.mode === 'study') submitQuestion(bank, state, question, record);
  }
  record.updatedAt = now();
  syncReviewRecord(question, record);
  state.updatedAt = now();
  persist();
  renderQuiz(bankId);
}

function submitQuestion(bank, state, question, record) {
  record.submitted = true;
  record.correct = isCorrect(question, record.selected);
  record.attempts = (record.attempts || 0) + 1;
  if (record.firstCorrect === null) record.firstCorrect = record.correct;
  record.updatedAt = now();
  syncReviewRecord(question, record);
  markCompleteIfNeeded(bank, state);
}

function submitExam(bank, state) {
  for (const question of bank.questions) {
    const record = recordFor(state, question.id);
    if (record.selected.length) {
      record.submitted = true;
      record.correct = isCorrect(question, record.selected);
      record.attempts = (record.attempts || 0) + 1;
      if (record.firstCorrect === null) record.firstCorrect = record.correct;
      syncReviewRecord(question, record);
    }
  }
  state.examSubmitted = true;
  state.completedAt = now();
  state.updatedAt = now();
  persist();
}

function retryQuestion(questionId) {
  const [, bankId] = idFromHash().split('/');
  const state = progress.banks[bankId];
  const record = recordFor(state, questionId);
  record.selected = [];
  record.submitted = false;
  record.correct = null;
  record.updatedAt = now();
  const bank = loadedBanks.get(bankId);
  const question = bank?.questions.find(item => item.id === questionId);
  if (question) syncReviewRecord(question, record);
  state.examSubmitted = state.mode === 'exam' ? false : state.examSubmitted;
  state.completedAt = null;
  persist();
  renderQuiz(bankId);
}

function exportResults(bankId) {
  const bank = loadedBanks.get(bankId);
  const state = progress.banks[bankId];
  if (!bank || !state) return;
  const rows = [['Question ID','Topic','Question','User answer','Correct answer','Correct','Flagged','Confidence','Attempts']];
  for (const question of bank.questions) {
    const record = recordFor(state, question.id);
    rows.push([
      question.id,
      question.topic || '',
      question.stem,
      answerLabel(question, record.selected),
      correctAnswerLabel(question),
      record.correct === null ? '' : record.correct ? 'Yes' : 'No',
      record.flagged ? 'Yes' : 'No',
      record.confidence || '',
      record.attempts || 0
    ]);
  }
  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');
  downloadText(csv, `${bankId}-results.csv`, 'text/csv');
}

async function replaceCourseThumbnail(courseId, file) {
  if (!file) return;
  const overlay = ensureManagedCourse(courseId);
  overlay.thumbnail = await prepareCourseThumbnail(file);
  overlay.addedAt ||= courseLayoutState().items?.[courseId]?.addedAt || now();
  overlay.modifiedAt = now();
  touchCourseLayoutItem(courseId, { addedAt: overlay.addedAt, modifiedAt: overlay.modifiedAt });
  persist();
  rebuildCatalog();
  showToast('Course thumbnail updated.', 'success');
  route();
}

async function saveNewCourse() {
  const existingId = modal?.courseId || '';
  const existing = existingId ? findCourse(existingId) : null;
  const title = document.querySelector('#new-course-title')?.value.trim() || '';
  const requestedId = document.querySelector('#new-course-id')?.value.trim() || '';
  const description = document.querySelector('#new-course-description')?.value.trim() || '';
  const tags = (document.querySelector('#new-course-tags')?.value || '').split(',').map(tag => tag.trim()).filter(Boolean);
  const thumbnailFile = document.querySelector('#course-thumbnail-file')?.files?.[0];
  const removeThumbnail = Boolean(document.querySelector('#remove-course-thumbnail')?.checked);
  if (!title) throw new Error('Enter a course title.');
  const id = existingId || slugify(requestedId || title);
  if (!existing && findCourse(id)) throw new Error('A course with that ID already exists.');
  let overlay = managedCourse(id);
  if (!overlay) {
    overlay = { id, sessions: [], managed: !baseCatalog.courses?.some(course => course.id === id), addedAt: now(), modifiedAt: now() };
    managedContent().courses.push(overlay);
  }
  overlay.title = title;
  overlay.description = description;
  overlay.addedAt ||= courseLayoutState().items?.[id]?.addedAt || existing?.addedAt || now();
  overlay.modifiedAt = now();
  overlay.tags = tags;
  overlay.sessions ||= [];
  for (const session of existing?.sessions || []) {
    if (progress.customBanks?.[session.bankId]) {
      progress.customBanks[session.bankId].courseTitle = title;
      await saveCustomBankDurable(progress.customBanks[session.bankId]);
    }
  }
  if (removeThumbnail) overlay.thumbnail = '';
  if (thumbnailFile) overlay.thumbnail = await prepareCourseThumbnail(thumbnailFile);
  const courseState = courseLayoutState();
  if (!courseState.order.includes(id)) courseState.order.push(id);
  upsertLayoutItem(courseState.items, id, { addedAt: overlay.addedAt, modifiedAt: overlay.modifiedAt });
  saveContentLayoutNow({ mirror: false });
  persist();
  rebuildCatalog();
  modal = null;
  refreshModal();
  showToast(existing ? 'Course updated.' : 'Course added.', 'success');
  go(`course/${id}`);
}

async function saveNewSession() {
  const courseId = document.querySelector('#new-session-course')?.value || '';
  const title = document.querySelector('#new-session-title')?.value.trim() || '';
  const requestedSessionId = document.querySelector('#new-session-id')?.value.trim() || '';
  const category = document.querySelector('#new-session-category')?.value.trim() || 'Session';
  const description = document.querySelector('#new-session-description')?.value.trim() || '';
  const file = document.querySelector('#managed-bank-file')?.files?.[0];
  const imageFiles = [...(document.querySelector('#managed-bank-images')?.files || [])];
  const course = findCourse(courseId);
  if (!course) throw new Error('Choose a course.');
  if (!title) throw new Error('Enter a session title.');
  if (!file) throw new Error('Choose a JSON question-bank file.');
  if (file.size > 100 * 1024 * 1024) throw new Error('Question bank is larger than 100 MB. Use separate image files or split the bank into sessions.');
  const bank = JSON.parse(await file.text());
  bank.questions ||= [];
  await embedUploadedQuestionImages(bank, imageFiles);
  const sessionId = slugify(requestedSessionId || bank.sessionId || title);
  const proposedBankId = slugify(bank.bankId || `${courseId}-${sessionId}`);
  if (findSession(proposedBankId) || progress.customBanks?.[proposedBankId]) throw new Error(`A session using bank ID “${proposedBankId}” already exists.`);
  bank.schemaVersion ||= 1;
  bank.bankId = proposedBankId;
  bank.courseId = courseId;
  bank.courseTitle = course.title;
  bank.sessionId = sessionId;
  bank.sessionTitle = title;
  bank.description = description || bank.description || '';
  bank.version ||= '1.0.0';
  bank.lastUpdated = new Date().toISOString().slice(0, 10);
  const errors = validateBank(bank);
  if (errors.length) throw new Error(errors.slice(0, 5).join(' '));
  progress.customBanks ||= {};
  progress.customBanks[bank.bankId] = bank;
  await saveCustomBankDurable(bank);
  loadedBanks.set(bank.bankId, bank);
  ensureBankState(bank);
  const overlay = ensureManagedCourse(courseId);
  const addedAt = now();
  overlay.sessions.push({
    id: sessionId,
    bankId: bank.bankId,
    title,
    description: bank.description,
    path: '',
    category,
    questionCount: bank.questions.length,
    version: bank.version,
    lastUpdated: bank.lastUpdated,
    addedAt,
    modifiedAt: addedAt,
    tags: [],
    managed: true
  });
  overlay.addedAt ||= courseLayoutState().items?.[courseId]?.addedAt || addedAt;
  overlay.modifiedAt = addedAt;
  const sessionState = sessionLayoutState(courseId);
  if (!sessionState.order.includes(itemKey(bank.bankId))) sessionState.order.push(itemKey(bank.bankId));
  upsertLayoutItem(sessionState.items, bank.bankId, { addedAt, modifiedAt: addedAt });
  upsertLayoutItem(courseLayoutState().items, courseId, { addedAt: overlay.addedAt, modifiedAt: overlay.modifiedAt });
  saveContentLayoutNow({ mirror: false });
  persist();
  rebuildCatalog();
  modal = null;
  refreshModal();
  showToast('Session added to the course.', 'success');
  if (idFromHash() === `course/${courseId}`) renderCourse(courseId);
  else go(`course/${courseId}`);
}

async function removeManagedSession(courseId, bankId) {
  const overlay = managedCourse(courseId);
  if (!overlay) return;
  overlay.sessions = (overlay.sessions || []).filter(session => session.bankId !== bankId);
  delete progress.customBanks?.[bankId];
  await deleteCustomBankDurable(bankId);
  delete progress.banks?.[bankId];
  loadedBanks.delete(bankId);
  const sessionState = sessionLayoutState(courseId);
  sessionState.order = sessionState.order.filter(id => id !== itemKey(bankId));
  delete sessionState.items?.[itemKey(bankId)];
  overlay.modifiedAt = now();
  upsertLayoutItem(courseLayoutState().items, courseId, { addedAt: overlay.addedAt, modifiedAt: overlay.modifiedAt });
  saveContentLayoutNow({ mirror: false });
  const hasCourseCustomization = ['title', 'description', 'tags', 'thumbnail']
    .some(key => Object.prototype.hasOwnProperty.call(overlay, key));
  if (!overlay.managed && !overlay.sessions.length && !hasCourseCustomization) {
    managedContent().courses = managedContent().courses.filter(course => course !== overlay);
  }
  persist();
  rebuildCatalog();
}

async function removeManagedCourse(courseId) {
  const overlay = managedCourse(courseId);
  if (!overlay) return;
  for (const session of overlay.sessions || []) {
    delete progress.customBanks?.[session.bankId];
    await deleteCustomBankDurable(session.bankId);
    delete progress.banks?.[session.bankId];
    loadedBanks.delete(session.bankId);
  }
  managedContent().courses = managedContent().courses.filter(course => course.id !== courseId);
  managedContent().courseOrder = (managedContent().courseOrder || []).filter(id => id !== courseId);
  delete managedContent().sessionOrders[courseId];
  delete managedContent().sessionSortModes[courseId];
  delete contentLayout.sessions?.[courseId];
  delete courseLayoutState().items?.[courseId];
  courseLayoutState().order = courseLayoutState().order.filter(id => id !== itemKey(courseId));
  saveContentLayoutNow({ mirror: false });
  persist();
  rebuildCatalog();
}

function bankTemplate() {
  return {
    schemaVersion: 1,
    bankId: 'replace-me',
    courseId: 'replace-me',
    courseTitle: 'Course title',
    sessionId: 'session-1',
    sessionTitle: 'Session 1',
    description: 'Session description',
    version: '1.0.0',
    questions: [{
      id: 'unique-question-id',
      type: 'single-choice',
      topic: 'Topic',
      difficulty: 'medium',
      stem: 'Question text',
      options: [
        { id: 'a', text: 'Option A' },
        { id: 'b', text: 'Option B' },
        { id: 'c', text: 'Option C' },
        { id: 'd', text: 'Option D' }
      ],
      correctAnswer: 'b',
      explanation: {
        summary: 'Concise explanation.',
        whyCorrect: 'Why the correct answer is best.',
        whyOthersIncorrect: { a: 'Why A is incorrect.', c: 'Why C is incorrect.', d: 'Why D is incorrect.' },
        clinicalConnection: 'Optional clinical connection.',
        keyTakeaway: 'One key learning point.',
        source: 'Source document and page'
      }
    }]
  };
}

function imageBankTemplate() {
  const template = bankTemplate();
  template.bankId = 'replace-me-image-bank';
  template.sessionTitle = 'Session 1 — Image questions';
  template.description = 'Question bank containing source-linked images.';
  template.questions[0].stem = 'Which interpretation best matches the image?';
  template.questions[0].image = {
    src: 'radiograph-01.jpg',
    alt: 'Accessible description of the diagnostic image',
    caption: 'Optional image caption'
  };
  return template;
}

async function buildCourseReview(courseId) {
  const course = findCourse(courseId);
  if (!course) throw new Error('Course not found.');
  const selectedBanks = [...document.querySelectorAll('[data-review-session]:checked')].map(input => input.value);
  const includeFlagged = document.querySelector('#review-include-flagged')?.checked;
  const includeIncorrect = document.querySelector('#review-include-incorrect')?.checked;
  if (!selectedBanks.length) throw new Error('Select at least one session.');
  if (!includeFlagged && !includeIncorrect) throw new Error('Choose flagged questions, incorrect questions, or both.');
  const refs = [];
  for (const bankId of selectedBanks) {
    const bank = await loadBank(bankId);
    const state = ensureBankState(bank, 'study');
    for (const question of bank.questions) {
      const record = recordFor(state, question.id);
      if ((includeFlagged && record.flagged) || (includeIncorrect && record.correct === false)) {
        refs.push({ bankId, questionId: question.id, sessionTitle: bank.sessionTitle || bank.title || bankId });
      }
    }
  }
  const unique = [...new Map(refs.map(ref => [`${ref.bankId}::${ref.questionId}`, ref])).values()];
  if (!unique.length) throw new Error('No questions match the selected sessions and review types.');
  const reviewId = `course-review-${slugify(courseId)}-${Date.now()}`;
  const filters = [includeFlagged ? 'flagged' : '', includeIncorrect ? 'incorrect' : ''].filter(Boolean).join(' and ');
  const config = {
    bankId: reviewId,
    courseId,
    courseTitle: course.title,
    title: `${course.title} — Custom ${filters} retest`,
    description: `${unique.length} selected questions from ${selectedBanks.length} session${selectedBanks.length === 1 ? '' : 's'}. Previous answers are hidden until each question is answered again.`,
    version: `1.0.${unique.length}`,
    createdAt: now(),
    questionRefs: unique
  };
  progress.customReviews ||= {};
  progress.customReviews[reviewId] = config;
  const reviewBank = await buildReviewBank(config);
  loadedBanks.set(reviewId, reviewBank);
  const questions = {};
  for (const question of reviewBank.questions) {
    const source = sourceRecordFor(question);
    questions[question.id] = retestRecordFromSource(source);
  }
  progress.banks[reviewId] = {
    bankId: reviewId,
    bankVersion: reviewBank.version,
    courseId,
    sessionId: 'custom-course-review',
    title: reviewBank.sessionTitle,
    mode: 'study',
    examSubmitted: false,
    randomizeQuestions: false,
    currentQuestionId: reviewBank.questions[0]?.id || null,
    questionIds: reviewBank.questions.map(question => question.id),
    reviewFilter: 'all',
    startedAt: now(),
    updatedAt: now(),
    completedAt: null,
    questions
  };
  persist();
  go(`quiz/${reviewId}`);
}

function readCloudForm() {
  const next = {
    owner: document.querySelector('#cloud-owner')?.value.trim() || '',
    repo: document.querySelector('#cloud-repo')?.value.trim() || '',
    branch: document.querySelector('#cloud-branch')?.value.trim() || 'main',
    path: document.querySelector('#cloud-path')?.value.trim() || 'progress/dental-study-progress.json'
  };
  const token = document.querySelector('#cloud-token')?.value.trim() || '';
  if (!next.owner || !next.repo || !token) throw new Error('Storage account, repository, and access token are required.');
  cloudSettings = saveCloudSettings(next);
  setSessionToken(token);
  return { settings: next, token };
}

async function cloudSave() {
  try {
    flushPendingContentOrder();
    mirrorContentLayoutToProgress();
    const data = readCloudForm();
    setSaveStatus('Saving study data…', 'busy');
    await writeGitHubProgress(data.settings, data.token, progress);
    setSaveStatus('Cloud saved', 'ok');
    modal = { type: 'cloud', cloudSuccess: 'Study data was saved successfully as an immutable synchronization snapshot. You can now load it from another browser after entering the same private storage settings and a valid token.', cloudError: '' };
    refreshModal();
    showToast('Study data saved to private storage.', 'success');
  } catch (error) {
    setSaveStatus('Cloud save failed', 'error');
    modal = { type: 'cloud', cloudError: error.message, cloudSuccess: '' };
    refreshModal();
    showToast(error.message, 'error');
  }
}

async function cloudLoad() {
  try {
    const data = readCloudForm();
    setSaveStatus('Loading study data…', 'busy');
    const remote = await readGitHubProgress(data.settings, data.token);
    if (!remote.exists || !remote.data?.progress) throw new Error('No synchronized study data exists for these settings yet.');
    if (!confirm('Replace local progress with the saved study data from private storage?')) return;
    const incoming = remote.data.progress;
    if (!incoming || typeof incoming !== 'object' || typeof incoming.banks !== 'object') {
      throw new Error('The downloaded file does not contain a compatible study progress database.');
    }
    incoming.customBanks ||= {};
    incoming.customReviews ||= {};
    incoming.managedContent ||= { courses: [], courseOrder: [], sessionOrders: {}, sessionSortModes: {} };
    incoming.managedContent.courses ||= [];
    incoming.managedContent.courseOrder ||= [];
    incoming.managedContent.sessionOrders ||= {};
    incoming.managedContent.sessionSortModes ||= {};
    await replaceProgressDurable(incoming);
    progress = incoming;
    reconcileContentLayoutFromProgress({ replace: true });
    persist();
    await flushLocalSave();
    loadedBanks.clear();
    rebuildCatalog();
    setSaveStatus('Cloud loaded', 'ok');
    modal = null;
    refreshModal();
    showToast('Study data loaded from private storage.', 'success');
    route();
  } catch (error) {
    setSaveStatus('Cloud load failed', 'error');
    modal = { type: 'cloud', cloudError: error.message, cloudSuccess: '' };
    refreshModal();
    showToast(error.message, 'error');
  }
}

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'toggle-sidebar') {
    settings = saveSettings({ ...settings, sidebarCollapsed: !settings.sidebarCollapsed });
    applySettings();
    return route();
  }
  if (action === 'toggle-quiz-tools') {
    settings = saveSettings({ ...settings, quizToolsHidden: !settings.quizToolsHidden });
    applySettings();
    const [, bankId] = idFromHash().split('/');
    return bankId ? renderQuiz(bankId) : route();
  }
  if (action === 'home') return go('home');
  if (action === 'settings') return go('settings');
  if (action === 'help') return go('help');
  if (action === 'global-review') return go('review/all');
  if (action === 'global-flagged') return go('flagged');
  if (action === 'progress') return go('progress');
  if (action === 'add-course') { modal = { type: 'course', courseId: '' }; return refreshModal(); }
  if (action === 'edit-course') { modal = { type: 'course', courseId: target.dataset.course }; return refreshModal(); }
  if (action === 'replace-course-thumbnail') {
    const input = document.querySelector(`.course-thumbnail-quick-input[data-course="${CSS.escape(target.dataset.course)}"]`);
    return input?.click();
  }
  if (action === 'add-session') { modal = { type: 'session', courseId: target.dataset.course || catalog.courses[0]?.id || '' }; return refreshModal(); }
  if (action === 'save-new-course') {
    try { return await saveNewCourse(); } catch (error) { return showToast(error.message, 'error'); }
  }
  if (action === 'save-new-session') {
    try { return await saveNewSession(); } catch (error) { return showToast(error.message, 'error'); }
  }
  if (action === 'download-bank-template') return downloadJson(bankTemplate(), 'dental-question-bank-template.json');
  if (action === 'download-image-bank-template') return downloadJson(imageBankTemplate(), 'dental-image-question-bank-template.json');
  if (action === 'remove-session') {
    if (!confirm('Delete this browser-added session and its locally saved progress?')) return;
    await removeManagedSession(target.dataset.course, target.dataset.bank);
    showToast('Session deleted.', 'success');
    return renderCourse(target.dataset.course);
  }
  if (action === 'remove-course') {
    if (!confirm('Delete this browser-added course, all of its sessions, and their locally saved progress?')) return;
    await removeManagedCourse(target.dataset.course);
    showToast('Course deleted.', 'success');
    return go('home');
  }
  if (action === 'build-course-review') {
    try { return await buildCourseReview(target.dataset.course); } catch (error) { return showToast(error.message, 'error'); }
  }
  if (action === 'browse-courses') return go('courses');
  if (action === 'open-course') {
    if (Date.now() < suppressCourseOpenUntil) return;
    return go(`course/${target.dataset.course}`);
  }
  if (action === 'open-session') {
    if (Date.now() < suppressSessionOpenUntil) return;
    return go(`session/${target.dataset.bank}`);
  }
  if (action === 'resume-bank') return go(`quiz/${target.dataset.bank}`);
  if (action === 'show-results') return go(`results/${target.dataset.bank}`);
  if (action === 'bank-import') return bankImport.click();
  if (action === 'import-progress') return progressImport.click();
  if (action === 'export-progress') {
    flushPendingContentOrder();
    mirrorContentLayoutToProgress();
    return downloadJson({ schemaVersion: 1, exportedAt: now(), app: "Amin's Dent Study", profileName: settings.profileName, progress, settings }, `dental-study-progress-${new Date().toISOString().slice(0,10)}.json`);
  }
  if (action === 'start-mode') {
    const bank = await loadBank(target.dataset.bank);
    const currentState = ensureBankState(bank, target.dataset.mode === 'exam' ? 'exam' : 'study');
    if (target.dataset.mode === 'exam') {
      if (progress.banks[bank.bankId] && !confirm('Start a new exam and replace the current session attempt?')) return;
      resetBank(bank, 'exam', currentState.randomizeQuestions);
    } else {
      currentState.mode = 'study';
      currentState.examSubmitted = false;
      persist();
    }
    return go(`quiz/${bank.bankId}`);
  }
  if (action === 'reshuffle-session') {
    const bank = await loadBank(target.dataset.bank);
    const state = ensureBankState(bank, 'study');
    setQuestionOrder(bank, state, true, true);
    persist();
    showToast('Question order randomized.', 'success');
    return idFromHash().startsWith('quiz/') ? renderQuiz(bank.bankId) : renderSession(bank.bankId);
  }
  if (action === 'reset-bank') {
    const bank = await loadBank(target.dataset.bank);
    if (!confirm('Reset all answers, flags, and notes for this session?')) return;
    resetBank(bank, 'study');
    showToast('Session reset.', 'success');
    return renderSession(bank.bankId);
  }
  if (action === 'review-filter') {
    const bank = await loadBank(target.dataset.bank);
    const state = ensureBankState(bank, 'study');
    state.mode = 'study';
    state.reviewFilter = target.dataset.filter;
    const ids = filteredQuestionIds(bank, state);
    state.currentQuestionId = ids[0] || bank.questions[0]?.id;
    persist();
    return go(`quiz/${bank.bankId}`);
  }

  if (action === 'global-review-filter') return go(`review/${target.dataset.filter}`);
  if (action === 'open-review-question') {
    const bank = await loadBank(target.dataset.bank);
    const state = ensureBankState(bank, 'study');
    state.mode = 'study';
    state.reviewFilter = 'all';
    state.currentQuestionId = target.dataset.question;
    persist();
    return go(`quiz/${bank.bankId}`);
  }
  if (action === 'toggle-review-flag') {
    const bank = await loadBank(target.dataset.bank);
    const state = ensureBankState(bank, 'study');
    const record = recordFor(state, target.dataset.question);
    record.flagged = !record.flagged;
    record.updatedAt = now();
    persist();
    const [, filter = 'all'] = idFromHash().split('/');
    return renderGlobalReview(filter);
  }
  if (action === 'goto-question') {
    const [, bankId] = idFromHash().split('/');
    progress.banks[bankId].currentQuestionId = target.dataset.question;
    persist();
    return renderQuiz(bankId);
  }
  if (action === 'previous-question') return moveQuestion(-1);
  if (action === 'next-question') return moveQuestion(1);
  if (action === 'select-answer') return selectAnswer(target.dataset.question, target.dataset.option);
  if (action === 'submit-multiple') {
    const [, bankId] = idFromHash().split('/');
    const bank = loadedBanks.get(bankId);
    const state = progress.banks[bankId];
    const question = bank.questions.find(item => item.id === target.dataset.question);
    const record = recordFor(state, question.id);
    if (!record.selected.length) return;
    if (state.mode === 'study') submitQuestion(bank, state, question, record);
    syncReviewRecord(question, record);
    persist();
    return renderQuiz(bankId);
  }
  if (action === 'submit-text-answer') {
    const [, bankId] = idFromHash().split('/');
    const bank = loadedBanks.get(bankId);
    const state = progress.banks[bankId];
    const question = bank.questions.find(item => item.id === target.dataset.question);
    const record = recordFor(state, question.id);
    const value = document.querySelector('#text-answer')?.value ?? '';
    record.selected = [value];
    if (!value.trim()) return showToast('Enter an answer first.', 'error');
    if (state.mode === 'study') submitQuestion(bank, state, question, record);
    syncReviewRecord(question, record);
    persist();
    return renderQuiz(bankId);
  }
  if (action === 'toggle-flag') {
    const [, bankId] = idFromHash().split('/');
    const bank = loadedBanks.get(bankId);
    const question = bank?.questions.find(item => item.id === target.dataset.question);
    const record = recordFor(progress.banks[bankId], target.dataset.question);
    record.flagged = !record.flagged;
    record.updatedAt = now();
    if (question) syncReviewRecord(question, record);
    persist();
    return renderQuiz(bankId);
  }
  if (action === 'retry-question') return retryQuestion(target.dataset.question);
  if (action === 'submit-exam') {
    const bank = loadedBanks.get(target.dataset.bank);
    const state = progress.banks[target.dataset.bank];
    if (!confirm('Submit this exam? Answers will be graded and explanations will become visible.')) return;
    submitExam(bank, state);
    return go(`results/${bank.bankId}`);
  }
  if (action === 'export-results') return exportResults(target.dataset.bank);
  if (action === 'save-settings') {
    settings = saveSettings({
      ...settings,
      theme: document.querySelector('#setting-theme').value,
      fontScale: Number(document.querySelector('#setting-font').value),
      defaultMode: document.querySelector('#setting-mode').value,
      profileName: document.querySelector('#setting-profile').value.trim() || 'Amin'
    });
    applySettings();
    showToast('Settings saved.', 'success');
    return renderSettings();
  }
  if (action === 'clear-all-progress') {
    if (!confirm('Permanently delete all locally saved progress and imported banks?')) return;
    await clearProgressDurable();
    clearContentLayout();
    contentLayout = loadContentLayout();
    progress = await loadProgressDurable();
    loadedBanks.clear();
    rebuildCatalog();
    showToast('All local progress was cleared.', 'success');
    return go('home');
  }
  if (action === 'cloud-open') { modal = { type: 'cloud' }; return refreshModal(); }
  if (action === 'modal-close') { modal = null; return refreshModal(); }
  if (action === 'cloud-save') return cloudSave();
  if (action === 'cloud-load') return cloudLoad();
});

app.addEventListener('change', async event => {
  if (event.target.classList?.contains('course-thumbnail-quick-input')) {
    const file = event.target.files?.[0];
    const courseId = event.target.dataset.course;
    event.target.value = '';
    if (!file || !courseId) return;
    try { return await replaceCourseThumbnail(courseId, file); }
    catch (error) { return showToast(error.message, 'error'); }
  }
  if (event.target.id === 'session-randomize') {
    const bank = loadedBanks.get(event.target.dataset.bank);
    if (!bank) return;
    const state = ensureBankState(bank, 'study');
    setQuestionOrder(bank, state, event.target.checked, event.target.checked);
    persist();
    showToast(event.target.checked ? 'Questions randomized.' : 'Original question order restored.', 'success');
    return renderSession(bank.bankId);
  }
  if (event.target.id === 'course-thumbnail-file') {
    const file = event.target.files?.[0];
    const preview = document.querySelector('#course-thumbnail-preview');
    if (!file || !preview) return;
    if (!file.type.startsWith('image/')) return showToast('Choose an image file.', 'error');
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${url}" alt="Selected course thumbnail preview">`;
    const remove = document.querySelector('#remove-course-thumbnail');
    if (remove) remove.checked = false;
  }
  if (event.target.id === 'course-filter') {
    courseFilter = event.target.value;
    if (idFromHash() === 'courses') renderCourseLibrary(); else renderHome();
  }
  if (event.target.id === 'course-sort') {
    setCourseSortMode(event.target.value);
    showToast(sortModeLabel(event.target.value, 'courses'), 'success');
    if (idFromHash() === 'courses') return renderCourseLibrary();
    return renderHome();
  }
  if (event.target.id === 'session-sort') {
    const courseId = event.target.dataset.course;
    if (!courseId) return;
    setSessionSortMode(courseId, event.target.value);
    showToast(sortModeLabel(event.target.value, 'sessions'), 'success');
    return renderCourse(courseId);
  }
  if (event.target.id === 'navigator-filter') {
    const [, bankId] = idFromHash().split('/');
    const bank = loadedBanks.get(bankId);
    const state = progress.banks[bankId];
    state.reviewFilter = event.target.value;
    state.currentQuestionId = filteredQuestionIds(bank, state)[0] || bank.questions[0]?.id;
    persist();
    renderQuiz(bankId);
  }
});

app.addEventListener('input', event => {
  if (event.target.id === 'course-search' || event.target.id === 'global-search') {
    searchTerm = event.target.value;
    const position = event.target.selectionStart;
    const current = idFromHash();
    if (current === 'courses') renderCourseLibrary();
    else if (current === 'home') renderHome();
    const input = document.querySelector(`#${event.target.id}`);
    input?.focus();
    input?.setSelectionRange(position, position);
  }
  if (event.target.id === 'question-note') {
    const [, bankId] = idFromHash().split('/');
    const record = recordFor(progress.banks[bankId], event.target.dataset.question);
    record.note = event.target.value;
    record.updatedAt = now();
    const bank = loadedBanks.get(bankId);
    const question = bank?.questions.find(item => item.id === event.target.dataset.question);
    if (question) syncReviewRecord(question, record);
    persist();
  }
  if (event.target.id === 'text-answer') {
    const [, bankId] = idFromHash().split('/');
    const state = progress.banks[bankId];
    if (!state) return;
    const record = recordFor(state, state.currentQuestionId);
    record.selected = [event.target.value];
    record.updatedAt = now();
    const bank = loadedBanks.get(bankId);
    const question = bank?.questions.find(item => item.id === state.currentQuestionId);
    if (question) syncReviewRecord(question, record);
    persist();
  }
});


app.addEventListener('keydown', event => {
  if (event.target.id === 'global-search' && event.key === 'Enter') {
    event.preventDefault();
    go('courses');
  }
});

progressImport.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 250 * 1024 * 1024) return showToast('Backup file is larger than 250 MB and cannot be imported safely in this browser.', 'error');
  try {
    const data = JSON.parse(await file.text());
    if (!data.progress?.banks || data.schemaVersion !== 1) throw new Error('This is not a compatible progress export.');
    const merge = confirm('Press OK to merge this progress with local data. Press Cancel to replace local data.');
    if (merge) {
      progress = {
        ...progress,
        ...data.progress,
        banks: { ...progress.banks, ...data.progress.banks },
        customBanks: { ...progress.customBanks, ...data.progress.customBanks },
        customReviews: { ...progress.customReviews, ...data.progress.customReviews },
        managedContent: data.progress.managedContent || progress.managedContent
      };
    } else {
      if (!confirm('Replace all local progress with the imported file?')) return;
      progress = data.progress;
    }
    if (data.settings) settings = saveSettings({ ...settings, ...data.settings });
    applySettings();
    await replaceProgressDurable(progress);
    reconcileContentLayoutFromProgress({ replace: true });
    persist();
    await flushLocalSave();
    loadedBanks.clear();
    rebuildCatalog();
    showToast('Progress imported.', 'success');
    route();
  } catch (error) {
    showToast(error.message, 'error');
  }
});

bankImport.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  modal = { type: 'session', courseId: catalog.courses[0]?.id || '' };
  refreshModal();
  showToast('Use the Add session form to attach the bank to a course.', 'success');
});

document.addEventListener('dragstart', event => {
  const sessionCard = event.target.closest?.('[data-session-drag-id]');
  if (sessionCard) {
    if (event.target.closest?.('input, select, textarea, .session-review-check, .session-tile-actions')) {
      event.preventDefault();
      return;
    }
    draggedSessionId = itemKey(sessionCard.dataset.sessionDragId);
    draggedSessionCourseId = itemKey(sessionCard.dataset.sessionCourseId);
    sessionDragMoved = false;
    clearTimeout(sessionDragSaveTimer);
    sessionCard.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedSessionId);
    return;
  }

  const courseCard = event.target.closest?.('[data-course-drag-id]');
  if (!courseCard) return;
  if (event.target.closest?.('button, a, input, select, textarea')) { event.preventDefault(); return; }
  draggedCourseId = itemKey(courseCard.dataset.courseDragId);
  courseDragMoved = false;
  clearTimeout(courseDragSaveTimer);
  courseCard.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedCourseId);
});

document.addEventListener('dragover', event => {
  if (draggedSessionId) {
    const grid = event.target.closest?.('.session-tile-grid');
    const targetCard = event.target.closest?.('[data-session-drag-id]');
    const dragging = document.querySelector(`[data-session-drag-id="${CSS.escape(draggedSessionId)}"]`);
    if (!grid || !targetCard || !dragging || targetCard === dragging || grid.dataset.sessionCourse !== draggedSessionCourseId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = targetCard.getBoundingClientRect();
    const sameRow = Math.abs(event.clientY - (rect.top + rect.height / 2)) < rect.height / 2;
    const before = sameRow ? event.clientX < rect.left + rect.width / 2 : event.clientY < rect.top + rect.height / 2;
    grid.insertBefore(dragging, before ? targetCard : targetCard.nextSibling);
    sessionDragMoved = true;
    scheduleSessionOrderSave(draggedSessionCourseId);
    return;
  }

  if (!draggedCourseId) return;
  const grid = event.target.closest?.('.course-grid');
  const targetCard = event.target.closest?.('[data-course-drag-id]');
  const dragging = document.querySelector(`[data-course-drag-id="${CSS.escape(draggedCourseId)}"]`);
  if (!grid || !targetCard || !dragging || targetCard === dragging) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const rect = targetCard.getBoundingClientRect();
  const sameRow = Math.abs(event.clientY - (rect.top + rect.height / 2)) < rect.height / 2;
  const before = sameRow ? event.clientX < rect.left + rect.width / 2 : event.clientY < rect.top + rect.height / 2;
  grid.insertBefore(dragging, before ? targetCard : targetCard.nextSibling);
  courseDragMoved = true;
  scheduleCourseOrderSave();
});

document.addEventListener('drop', event => {
  if (draggedSessionId) {
    const grid = event.target.closest?.('.session-tile-grid');
    if (!grid || grid.dataset.sessionCourse !== draggedSessionCourseId) return;
    event.preventDefault();
    clearTimeout(sessionDragSaveTimer);
    const courseId = draggedSessionCourseId;
    commitSessionOrderFromGrid(courseId);
    suppressSessionOpenUntil = Date.now() + 500;
    draggedSessionId = null;
    draggedSessionCourseId = null;
    sessionDragMoved = false;
    showToast('Session order saved and will stay in this arrangement.', 'success');
    return renderCourse(courseId);
  }

  if (!draggedCourseId) return;
  const grid = event.target.closest?.('.course-grid');
  if (!grid) return;
  event.preventDefault();
  clearTimeout(courseDragSaveTimer);
  commitCourseOrderFromGrid();
  suppressCourseOpenUntil = Date.now() + 500;
  draggedCourseId = null;
  courseDragMoved = false;
  showToast('Course order saved and will stay in this arrangement.', 'success');
  const current = idFromHash();
  if (current === 'courses') renderCourseLibrary();
  else if (current === 'home') renderHome();
});

document.addEventListener('dragend', event => {
  event.target.closest?.('[data-course-drag-id], [data-session-drag-id]')?.classList.remove('dragging');
  if (draggedSessionId && draggedSessionCourseId && sessionDragMoved) {
    clearTimeout(sessionDragSaveTimer);
    const courseId = draggedSessionCourseId;
    commitSessionOrderFromGrid(courseId);
    suppressSessionOpenUntil = Date.now() + 500;
    showToast('Session order saved and will stay in this arrangement.', 'success');
  }
  if (draggedCourseId && courseDragMoved) {
    clearTimeout(courseDragSaveTimer);
    commitCourseOrderFromGrid();
    suppressCourseOpenUntil = Date.now() + 500;
    showToast('Course order saved and will stay in this arrangement.', 'success');
  }
  clearTimeout(courseDragSaveTimer);
  clearTimeout(sessionDragSaveTimer);
  draggedCourseId = null;
  courseDragMoved = false;
  draggedSessionId = null;
  draggedSessionCourseId = null;
  sessionDragMoved = false;
});

window.addEventListener('hashchange', () => {
  flushPendingContentOrder();
  route();
});
window.addEventListener('pagehide', flushPendingContentOrder);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushPendingContentOrder();
});
window.addEventListener('keydown', event => {
  if (!idFromHash().startsWith('quiz/')) return;
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
  if (event.key === 'ArrowLeft') moveQuestion(-1);
  if (event.key === 'ArrowRight') moveQuestion(1);
});

async function init() {
  document.documentElement.dataset.build = '20';
  progress = await loadProgressDurable();
  requestPersistentStorage().catch(() => false);
  applySettings();
  renderLoading('Loading course catalog…');
  try {
    const response = await fetch('/DDS/courses.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load courses.json (${response.status}).`);
    baseCatalog = await response.json();
    if (!Array.isArray(baseCatalog.courses)) throw new Error('courses.json must contain a courses array.');
    reconcileContentLayoutFromProgress();
    rebuildCatalog();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('/DDS/service-worker.js', { scope: '/DDS/' })
        .then(registration => registration.update())
        .catch(error => console.warn('Service worker:', error));
    }
    if (!location.hash) location.hash = '#/home';
    else route();
  } catch (error) {
    renderError(`${error.message} Run the project through its hosted web address or a local web server; do not open index.html directly with file://.`);
  }
}

init();
