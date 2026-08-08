import assert from 'node:assert/strict';
import fs from 'node:fs';
const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const storage = fs.readFileSync(new URL('../assets/js/storage.js', import.meta.url), 'utf8');
const sync = fs.readFileSync(new URL('../assets/js/github-sync.js', import.meta.url), 'utf8');

for (const needle of [
  "Amin's Dent Study",
  'data-action="add-course"',
  'data-action="add-session"',
  'id="course-sort"',
  'id="session-sort"',
  'Date added — newest first',
  'Date modified — newest first',
  'data-course-drag-id',
  'data-session-drag-id',
  'Randomize question order',
  'Show answer and feedback',
  'Correct answer',
  'Key takeaway',
  'toggle-sidebar',
  'toggle-quiz-tools',
  'Session statistics',
  'Question navigator',
  'Flag question'
]) assert.ok(app.includes(needle), `Missing feature marker: ${needle}`);

assert.ok(app.includes('replaceProgressDurable(incoming)'), 'Cloud restore must use atomic durable replacement.');
assert.ok(storage.includes("const DB_NAME = 'amins-dent-study-local-data'"), 'IndexedDB durable storage missing.');
assert.ok(storage.includes('db.transaction([CORE_STORE, BANK_STORE], \'readwrite\')'), 'Atomic core+bank transaction missing.');
assert.ok(sync.includes("POST") || sync.includes("method: 'POST'"));
assert.equal(sync.includes("method: 'PATCH'"), false, 'New sync implementation must not PATCH refs.');
assert.equal(/fetch\([^\n]*uploads\.github\.com/.test(sync), false, 'New sync implementation must not call uploads.github.com.');
assert.ok(sync.includes('/git/blobs'), 'Chunk blob upload endpoint missing.');
assert.ok(sync.includes('/git/trees'), 'Snapshot tree creation missing.');
assert.ok(sync.includes('/git/commits'), 'Snapshot commit creation missing.');
assert.ok(index.includes('/DDS/assets/js/app.js?v=21'));
assert.ok(index.includes('/DDS/assets/css/styles.css?v=21'));
assert.ok(sw.includes("dds-amins-dent-study-v21"));
assert.ok(!app.includes('<small>Source</small>'), 'Question explanation should not show a Source footer item.');
console.log('PASS feature-regression-v20: requested UI/data features and storage/sync architecture are present.');
