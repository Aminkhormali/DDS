import assert from 'node:assert/strict';
import { sortItemsByLayout, mergeVisibleLayoutOrder } from '../assets/js/layout-utils.js';
const items = [
  { id: 'c', title: 'Zulu' },
  { id: 'a', title: 'Alpha' },
  { id: 'b', title: 'Beta' }
];
const dates = {
  a: { addedAt: '2026-01-01T00:00:00Z', modifiedAt: '2026-02-01T00:00:00Z' },
  b: { addedAt: '2026-03-01T00:00:00Z', modifiedAt: '2026-01-01T00:00:00Z' },
  c: { addedAt: '2026-02-01T00:00:00Z', modifiedAt: '2026-03-01T00:00:00Z' }
};
const ids = arr => arr.map(x => x.id);
assert.deepEqual(ids(sortItemsByLayout(items, { mode: 'manual', order: ['b','c','a'], items: dates }, { id:x=>x.id, title:x=>x.title })), ['b','c','a']);
assert.deepEqual(ids(sortItemsByLayout(items, { mode: 'alphabetical', order: [], items: dates }, { id:x=>x.id, title:x=>x.title })), ['a','b','c']);
assert.deepEqual(ids(sortItemsByLayout(items, { mode: 'added-desc', order: [], items: dates }, { id:x=>x.id, title:x=>x.title })), ['b','c','a']);
assert.deepEqual(ids(sortItemsByLayout(items, { mode: 'modified-desc', order: [], items: dates }, { id:x=>x.id, title:x=>x.title })), ['c','a','b']);
assert.deepEqual(mergeVisibleLayoutOrder(['a','b','c'], ['c','a'], ['a','b','c']), ['c','b','a']);
console.log('PASS layout-v20: manual, alphabetical, added/modified date sorting and visible drag merge.');
