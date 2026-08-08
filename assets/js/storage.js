const PROGRESS_KEY = 'dental-study-hub-progress-v1'; // legacy localStorage key
const PROGRESS_META_KEY = 'amins-dent-study-progress-meta-v2';
const SETTINGS_KEY = 'dental-study-hub-settings-v1';
const CLOUD_KEY = 'dental-study-hub-cloud-v1';
const LEGACY_SESSION_LAYOUT_KEY = 'amins-dent-study-session-layout-v1';
const CONTENT_LAYOUT_KEY = 'amins-dent-study-content-layout-v2';

const DB_NAME = 'amins-dent-study-local-data';
const DB_VERSION = 1;
const CORE_STORE = 'core';
const BANK_STORE = 'custom-banks';
const CORE_RECORD = 'progress';

const defaultSettings = {
  theme: 'system',
  fontScale: 1,
  defaultMode: 'study',
  showSources: false,
  sidebarCollapsed: false,
  quizToolsHidden: false,
  autoAdvance: false,
  profileName: 'Amin'
};

function emptyContentLayout() {
  return {
    schemaVersion: 2,
    updatedAt: null,
    courses: { mode: 'manual', order: [], items: {} },
    sessions: {}
  };
}

function normalizeSortMode(value) {
  const allowed = new Set(['manual', 'alphabetical', 'added-desc', 'added-asc', 'modified-desc', 'modified-asc']);
  return allowed.has(value) ? value : 'manual';
}

function normalizeItemDates(items) {
  const next = {};
  for (const [id, value] of Object.entries(items || {})) {
    const key = String(id || '').trim();
    if (!key) continue;
    next[key] = {
      addedAt: typeof value?.addedAt === 'string' ? value.addedAt : '',
      modifiedAt: typeof value?.modifiedAt === 'string' ? value.modifiedAt : ''
    };
  }
  return next;
}

function normalizeContentLayout(layout) {
  const next = emptyContentLayout();
  if (!layout || typeof layout !== 'object') return next;
  next.updatedAt = typeof layout.updatedAt === 'string' ? layout.updatedAt : null;
  next.courses = {
    mode: normalizeSortMode(layout.courses?.mode),
    order: Array.isArray(layout.courses?.order) ? layout.courses.order.map(String).map(value => value.trim()).filter(Boolean) : [],
    items: normalizeItemDates(layout.courses?.items)
  };
  for (const [courseId, value] of Object.entries(layout.sessions || {})) {
    const key = String(courseId || '').trim();
    if (!key) continue;
    next.sessions[key] = {
      mode: normalizeSortMode(value?.mode),
      order: Array.isArray(value?.order) ? value.order.map(String).map(item => item.trim()).filter(Boolean) : [],
      items: normalizeItemDates(value?.items)
    };
  }
  return next;
}

function migrateLegacySessionLayout() {
  try {
    const raw = localStorage.getItem(LEGACY_SESSION_LAYOUT_KEY);
    if (!raw) return emptyContentLayout();
    const parsed = JSON.parse(raw);
    const next = emptyContentLayout();
    for (const [courseId, value] of Object.entries(parsed?.courses || {})) {
      next.sessions[courseId] = {
        mode: value?.mode === 'alphabetical' ? 'alphabetical' : 'manual',
        order: Array.isArray(value?.order) ? value.order.map(String).filter(Boolean) : [],
        items: {}
      };
    }
    return next;
  } catch (error) {
    console.warn('Legacy session layout could not be migrated:', error);
    return emptyContentLayout();
  }
}

export function loadContentLayout() {
  try {
    const raw = localStorage.getItem(CONTENT_LAYOUT_KEY);
    if (raw) return normalizeContentLayout(JSON.parse(raw));
    const migrated = migrateLegacySessionLayout();
    if (Object.keys(migrated.sessions).length) saveContentLayout(migrated);
    return migrated;
  } catch (error) {
    console.warn('Course and session layout could not be loaded:', error);
    return emptyContentLayout();
  }
}

export function saveContentLayout(layout) {
  const next = normalizeContentLayout(layout);
  next.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(CONTENT_LAYOUT_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('Small layout preference could not be saved to localStorage:', error);
  }
  return next;
}

export function clearContentLayout() {
  try {
    localStorage.removeItem(CONTENT_LAYOUT_KEY);
    localStorage.removeItem(LEGACY_SESSION_LAYOUT_KEY);
  } catch {}
}

// Compatibility exports for older code and backups.
export function loadSessionLayout() {
  const content = loadContentLayout();
  const courses = {};
  for (const [courseId, layout] of Object.entries(content.sessions || {})) {
    courses[courseId] = { mode: layout.mode, order: [...layout.order], updatedAt: content.updatedAt };
  }
  return { schemaVersion: 1, updatedAt: content.updatedAt, courses };
}

export function saveSessionLayout(layout) {
  const content = loadContentLayout();
  content.sessions = {};
  for (const [courseId, value] of Object.entries(layout?.courses || {})) {
    content.sessions[courseId] = {
      mode: value?.mode === 'alphabetical' ? 'alphabetical' : 'manual',
      order: Array.isArray(value?.order) ? value.order.map(String).filter(Boolean) : [],
      items: {}
    };
  }
  saveContentLayout(content);
  return loadSessionLayout();
}

export function clearSessionLayout() {
  clearContentLayout();
}

export function emptyProgress() {
  return {
    schemaVersion: 1,
    updatedAt: null,
    banks: {},
    customBanks: {},
    customReviews: {},
    contentLayout: null,
    managedContent: {
      courses: [],
      courseOrder: [],
      sessionOrders: {},
      sessionSortModes: {}
    }
  };
}

function normalizeProgress(parsed) {
  if (!parsed || parsed.schemaVersion !== 1 || typeof parsed.banks !== 'object') return emptyProgress();
  parsed.customBanks ||= {};
  parsed.customReviews ||= {};
  parsed.contentLayout ||= null;
  parsed.managedContent ||= { courses: [], courseOrder: [], sessionOrders: {}, sessionSortModes: {} };
  parsed.managedContent.courses ||= [];
  parsed.managedContent.courseOrder ||= [];
  parsed.managedContent.sessionOrders ||= {};
  parsed.managedContent.sessionSortModes ||= {};
  return parsed;
}

// Legacy synchronous loader. Used only as a migration source.
export function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return emptyProgress();
    return normalizeProgress(JSON.parse(raw));
  } catch (error) {
    console.warn('Legacy progress could not be loaded:', error);
    return emptyProgress();
  }
}

// Legacy synchronous saver retained for compatibility. The application no longer
// uses this for the main database because localStorage is too small for question banks/images.
export function saveProgress(progress) {
  const next = normalizeProgress({ ...progress, schemaVersion: 1, updatedAt: new Date().toISOString() });
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
  return next;
}

export function clearProgress() {
  try { localStorage.removeItem(PROGRESS_KEY); } catch {}
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CORE_STORE)) db.createObjectStore(CORE_STORE);
      if (!db.objectStoreNames.contains(BANK_STORE)) db.createObjectStore(BANK_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local study storage.'));
    request.onblocked = () => reject(new Error('Local study storage is blocked by another open tab. Close other copies of the site and try again.'));
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Local storage operation failed.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Local storage transaction failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Local storage transaction was aborted.'));
  });
}

async function idbGet(storeName, key) {
  const db = await openDb();
  try {
    const tx = db.transaction(storeName, 'readonly');
    return await requestToPromise(tx.objectStore(storeName).get(key));
  } finally {
    db.close();
  }
}

async function idbGetAllEntries(storeName) {
  const db = await openDb();
  try {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const [keys, values] = await Promise.all([
      requestToPromise(store.getAllKeys()),
      requestToPromise(store.getAll())
    ]);
    return keys.map((key, index) => [String(key), values[index]]);
  } finally {
    db.close();
  }
}

function stripCustomBanks(progress) {
  const core = normalizeProgress({ ...progress, customBanks: {} });
  core.customBanks = {};
  return core;
}

function writeProgressMeta(updatedAt) {
  try {
    localStorage.setItem(PROGRESS_META_KEY, JSON.stringify({ storage: 'indexeddb', updatedAt }));
  } catch {}
}

function releaseLegacyProgressSpace() {
  try { localStorage.removeItem(PROGRESS_KEY); } catch {}
}

function friendlyStorageError(error) {
  const name = error?.name || '';
  if (name === 'QuotaExceededError') {
    return new Error('This browser has reached its local storage quota. Free some device/browser storage or remove very large embedded image banks, then try again. Your existing saved data has not been intentionally cleared.');
  }
  if (name === 'SecurityError' || name === 'InvalidStateError') {
    return new Error('Persistent browser storage is blocked for this site. Open the site normally (not a private/incognito tab) and allow website data/storage.');
  }
  return error instanceof Error ? error : new Error(String(error || 'Local storage operation failed.'));
}

export async function loadProgressDurable() {
  try {
    const storedCore = await idbGet(CORE_STORE, CORE_RECORD);
    if (storedCore) {
      const progress = normalizeProgress(storedCore);
      progress.customBanks = Object.fromEntries(await idbGetAllEntries(BANK_STORE));
      releaseLegacyProgressSpace();
      return progress;
    }
  } catch (error) {
    console.warn('IndexedDB progress could not be read; attempting legacy migration:', error);
  }

  const legacy = loadProgress();
  try {
    await replaceCustomBanksDurable(legacy.customBanks || {});
    await saveProgressDurable(legacy);
    releaseLegacyProgressSpace();
  } catch (error) {
    console.warn('Legacy progress migration to IndexedDB did not complete:', error);
  }
  return legacy;
}

export async function saveProgressDurable(progress) {
  const next = normalizeProgress({ ...progress, schemaVersion: 1, updatedAt: new Date().toISOString() });
  const core = stripCustomBanks(next);
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(CORE_STORE, 'readwrite');
      tx.objectStore(CORE_STORE).put(core, CORE_RECORD);
      await transactionDone(tx);
    } finally {
      db.close();
    }
    releaseLegacyProgressSpace();
    writeProgressMeta(next.updatedAt);
    return next;
  } catch (error) {
    throw friendlyStorageError(error);
  }
}

export async function replaceProgressDurable(progress) {
  const next = normalizeProgress({ ...progress, schemaVersion: 1, updatedAt: new Date().toISOString() });
  const core = stripCustomBanks(next);
  try {
    const db = await openDb();
    try {
      const tx = db.transaction([CORE_STORE, BANK_STORE], 'readwrite');
      const coreStore = tx.objectStore(CORE_STORE);
      const bankStore = tx.objectStore(BANK_STORE);
      bankStore.clear();
      for (const [bankId, bank] of Object.entries(next.customBanks || {})) {
        if (bank && typeof bank === 'object') bankStore.put(bank, String(bankId));
      }
      coreStore.put(core, CORE_RECORD);
      await transactionDone(tx);
    } finally {
      db.close();
    }
    releaseLegacyProgressSpace();
    writeProgressMeta(next.updatedAt);
    return next;
  } catch (error) {
    throw friendlyStorageError(error);
  }
}

export async function saveCustomBankDurable(bank) {
  if (!bank?.bankId) throw new Error('The custom question bank does not have a bankId.');
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(BANK_STORE, 'readwrite');
      tx.objectStore(BANK_STORE).put(bank, String(bank.bankId));
      await transactionDone(tx);
    } finally {
      db.close();
    }
  } catch (error) {
    throw friendlyStorageError(error);
  }
}

export async function deleteCustomBankDurable(bankId) {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(BANK_STORE, 'readwrite');
      tx.objectStore(BANK_STORE).delete(String(bankId));
      await transactionDone(tx);
    } finally {
      db.close();
    }
  } catch (error) {
    throw friendlyStorageError(error);
  }
}

export async function replaceCustomBanksDurable(customBanks = {}) {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(BANK_STORE, 'readwrite');
      const store = tx.objectStore(BANK_STORE);
      store.clear();
      for (const [bankId, bank] of Object.entries(customBanks || {})) {
        if (bank && typeof bank === 'object') store.put(bank, String(bankId));
      }
      await transactionDone(tx);
    } finally {
      db.close();
    }
  } catch (error) {
    throw friendlyStorageError(error);
  }
}

export async function clearProgressDurable() {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction([CORE_STORE, BANK_STORE], 'readwrite');
      tx.objectStore(CORE_STORE).clear();
      tx.objectStore(BANK_STORE).clear();
      await transactionDone(tx);
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn('IndexedDB could not be cleared:', error);
  }
  clearProgress();
  try { localStorage.removeItem(PROGRESS_META_KEY); } catch {}
}

export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return false;
    if (navigator.storage.persisted && await navigator.storage.persisted()) return true;
    return Boolean(await navigator.storage.persist());
  } catch {
    return false;
  }
}

export async function getStorageEstimate() {
  try {
    if (!navigator.storage?.estimate) return null;
    const estimate = await navigator.storage.estimate();
    return {
      usage: Number(estimate.usage || 0),
      quota: Number(estimate.quota || 0),
      percent: estimate.quota ? Math.round((estimate.usage / estimate.quota) * 100) : 0
    };
  } catch {
    return null;
  }
}

export function loadSettings() {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings) {
  const next = { ...defaultSettings, ...settings };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (error) { console.warn('Settings could not be saved:', error); }
  return next;
}

export function loadCloudSettings() {
  try {
    return {
      owner: 'Aminkhormali',
      repo: '',
      branch: 'main',
      path: 'progress/dental-study-progress.json',
      ...JSON.parse(localStorage.getItem(CLOUD_KEY) || '{}')
    };
  } catch {
    return { owner: 'Aminkhormali', repo: '', branch: 'main', path: 'progress/dental-study-progress.json' };
  }
}

export function saveCloudSettings(settings) {
  try { localStorage.setItem(CLOUD_KEY, JSON.stringify(settings)); } catch (error) { console.warn('Sync settings could not be saved:', error); }
  return settings;
}

export function setSessionToken(token) {
  try {
    if (token) sessionStorage.setItem('dental-study-hub-github-token', token);
    else sessionStorage.removeItem('dental-study-hub-github-token');
  } catch {}
}

export function getSessionToken() {
  try { return sessionStorage.getItem('dental-study-hub-github-token') || ''; }
  catch { return ''; }
}

export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text, filename, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
