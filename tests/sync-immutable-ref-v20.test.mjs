import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

const blobs = new Map();
const trees = new Map([['tree-base', new Map()]]);
const commits = new Map([['commit-base', { tree: 'tree-base', parents: [] }]]);
const refs = new Map([['main', 'commit-base']]);
const requests = [];
let counter = 0;
const nextSha = prefix => `${prefix}-${++counter}`;

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
function emptyResponse(status = 204) { return new Response(null, { status }); }
function decodeBody(body) { return body ? JSON.parse(body) : {}; }
function branchFromRefPath(pathname) {
  const marker = '/git/ref/heads/';
  const idx = pathname.indexOf(marker);
  return idx >= 0 ? decodeURIComponent(pathname.slice(idx + marker.length)) : '';
}
function findEntry(branch, path) {
  const commitSha = refs.get(branch);
  const commit = commits.get(commitSha);
  const tree = trees.get(commit?.tree);
  return tree?.get(path) || null;
}

globalThis.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  const method = String(options.method || 'GET').toUpperCase();
  requests.push({ url: url.href, method });
  assert.equal(url.hostname, 'api.github.com', `Unexpected host: ${url.hostname}`);
  assert.notEqual(method, 'PATCH', 'Synchronization must never PATCH an existing ref.');

  const path = url.pathname;
  if (method === 'GET' && path.endsWith('/git/ref/heads/main')) {
    return jsonResponse({ ref: 'refs/heads/main', object: { sha: refs.get('main') } });
  }
  if (method === 'GET' && path.includes('/git/commits/')) {
    const sha = decodeURIComponent(path.split('/git/commits/')[1]);
    const commit = commits.get(sha);
    if (!commit) return jsonResponse({ message: 'Not Found' }, 404);
    return jsonResponse({ sha, tree: { sha: commit.tree }, parents: commit.parents.map(parent => ({ sha: parent })) });
  }
  if (method === 'POST' && path.endsWith('/git/blobs')) {
    const body = decodeBody(options.body);
    const sha = nextSha('blob');
    blobs.set(sha, body.content || '');
    return jsonResponse({ sha }, 201);
  }
  if (method === 'POST' && path.endsWith('/git/trees')) {
    const body = decodeBody(options.body);
    const base = new Map(trees.get(body.base_tree) || []);
    for (const entry of body.tree || []) base.set(entry.path, entry.sha);
    const sha = nextSha('tree');
    trees.set(sha, base);
    return jsonResponse({ sha }, 201);
  }
  if (method === 'POST' && path.endsWith('/git/commits')) {
    const body = decodeBody(options.body);
    const sha = nextSha('commit');
    commits.set(sha, { tree: body.tree, parents: body.parents || [] });
    return jsonResponse({ sha }, 201);
  }
  if (method === 'POST' && path.endsWith('/git/refs')) {
    const body = decodeBody(options.body);
    const branch = String(body.ref || '').replace(/^refs\/heads\//, '');
    if (refs.has(branch)) return jsonResponse({ message: 'Reference already exists' }, 422);
    refs.set(branch, body.sha);
    return jsonResponse({ ref: body.ref, object: { sha: body.sha } }, 201);
  }
  if (method === 'GET' && path.includes('/git/matching-refs/heads/')) {
    const prefix = decodeURIComponent(path.split('/git/matching-refs/heads/')[1]);
    const out = [...refs.entries()]
      .filter(([name]) => name.startsWith(prefix))
      .map(([name, sha]) => ({ ref: `refs/heads/${name}`, object: { sha } }));
    return jsonResponse(out);
  }
  if (method === 'DELETE' && path.includes('/git/refs/heads/')) {
    const branch = decodeURIComponent(path.split('/git/refs/heads/')[1]);
    refs.delete(branch);
    return emptyResponse(204);
  }
  if (method === 'GET' && path.includes('/contents/')) {
    const encodedPath = path.split('/contents/')[1];
    const filePath = encodedPath.split('/').map(decodeURIComponent).join('/');
    const branch = url.searchParams.get('ref') || 'main';
    const sha = findEntry(branch, filePath);
    if (!sha) return jsonResponse({ message: 'Not Found' }, 404);
    const b64 = blobs.get(sha) || '';
    const byteLength = Buffer.from(b64, 'base64').length;
    return jsonResponse({ type: 'file', sha, encoding: 'base64', content: byteLength > 1024 * 1024 ? '' : b64 });
  }
  if (method === 'GET' && path.includes('/git/blobs/')) {
    const sha = decodeURIComponent(path.split('/git/blobs/')[1]);
    if (!blobs.has(sha)) return jsonResponse({ message: 'Not Found' }, 404);
    return jsonResponse({ sha, encoding: 'base64', content: blobs.get(sha) });
  }
  if (method === 'GET' && path.endsWith('/releases')) return jsonResponse([]);
  if (method === 'GET' && path.includes('/releases?')) return jsonResponse([]);
  if (method === 'GET' && path.includes('/contents/progress/dental-study-progress.json')) return jsonResponse({ message: 'Not Found' }, 404);
  return jsonResponse({ message: `Unhandled ${method} ${path}` }, 500);
};

const mod = await import(`../assets/js/github-sync.js?v20test=${Date.now()}`);
const settings = { owner: 'Aminkhormali', repo: 'DDS-progress', branch: 'main', path: 'progress/dental-study-progress.json' };
const token = 'test-token';
const makeProgress = marker => ({
  schemaVersion: 1,
  updatedAt: new Date().toISOString(),
  banks: { sample: { marker, questions: {} } },
  customBanks: {
    huge: { bankId: 'huge', questions: [{ id: 'q1', stem: 'x'.repeat(5 * 1024 * 1024) }] }
  },
  customReviews: {},
  contentLayout: null,
  managedContent: { courses: [], courseOrder: [], sessionOrders: {}, sessionSortModes: {} }
});

const first = await mod.writeGitHubProgress(settings, token, makeProgress('first'));
assert.ok(first.snapshotBranch.startsWith('amins-sync-'));
assert.ok(first.chunks >= 2, 'Large data should be chunked into multiple blobs.');
assert.equal(requests.some(r => r.method === 'PUT'), false, 'New save should not use Contents PUT.');
assert.equal(requests.some(r => r.method === 'PATCH'), false, 'New save should not update a branch ref.');
assert.equal(requests.some(r => r.url.includes('uploads.github.com')), false, 'New save must not use uploads.github.com.');

await sleep(5);
const second = await mod.writeGitHubProgress(settings, token, makeProgress('second'));
assert.notEqual(second.snapshotBranch, first.snapshotBranch, 'Each save must create a unique snapshot ref.');

const loaded = await mod.readGitHubProgress(settings, token);
assert.equal(loaded.exists, true);
assert.equal(loaded.data.progress.banks.sample.marker, 'second', 'Loader should choose the newest valid snapshot.');
assert.equal(loaded.data.progress.customBanks.huge.questions[0].stem.length, 5 * 1024 * 1024);

console.log('PASS sync-immutable-ref-v20: chunked immutable sync round-trip, no ref updates, no uploads host, large payload restored.');
