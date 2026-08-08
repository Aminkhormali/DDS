const API_VERSION = '2026-03-10';
const SNAPSHOT_FORMAT = 'amins-dent-study-immutable-ref-v2';
const LEGACY_SNAPSHOT_BRANCH_FORMAT = 'amins-dent-study-snapshot-branch-v1';
const LEGACY_RELEASE_FORMAT = 'amins-dent-study-release-snapshot-v1';
const LEGACY_CLOUD_FORMAT = 'amins-dent-study-cloud-v2';
const LEGACY_SYNC_RELEASE_TAG = 'amins-dent-study-private-sync-v1';
const KEEP_SNAPSHOTS = 10;
const CHUNK_BYTES = 4 * 1024 * 1024;
const WRITE_CONCURRENCY = 1;
const READ_CONCURRENCY = 4;
const NETWORK_RETRIES = 3;

function repoBase(settings) {
  return `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}`;
}
function safePath(path) {
  return String(path || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
}
function contentsUrl(settings, path = settings.path) {
  return `${repoBase(settings)}/contents/${safePath(path)}`;
}
function blobUrl(settings, sha) {
  return `${repoBase(settings)}/git/blobs/${encodeURIComponent(sha)}`;
}
function headers(token, accept = 'application/vnd.github+json', includeContentType = false) {
  const result = {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': API_VERSION
  };
  if (includeContentType) result['Content-Type'] = 'application/json';
  return result;
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
async function githubError(response, operation) {
  const text = await response.text();
  let message = text.slice(0, 1000);
  try {
    const parsed = JSON.parse(text);
    message = parsed.message || message;
    if (parsed.documentation_url) message += ` (${parsed.documentation_url})`;
  } catch {
    // Preserve plain response text.
  }
  const error = new Error(`GitHub ${operation} failed (${response.status}): ${message || response.statusText}`);
  error.status = response.status;
  error.githubMessage = message || response.statusText;
  return error;
}
function browserNetworkError(error, operation) {
  const message = String(error?.message || error || 'Unknown network error');
  const next = new Error(
    `Could not reach the GitHub REST API while ${operation}. ` +
    `The browser reported: ${message}. Check the network connection, token, repository access, and any content blocker, then retry.`
  );
  next.cause = error;
  next.networkFailure = true;
  return next;
}
async function githubFetch(url, token, options = {}, operation = 'request', retries = NETWORK_RETRIES) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let delayMs = 500 * (2 ** attempt);
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers(token, options.accept || 'application/vnd.github+json', Boolean(options.body)),
          ...(options.headers || {})
        },
        cache: 'no-store'
      });
      if (response.ok) return response;
      const error = await githubError(response, operation);
      lastError = error;
      const retryAfter = Number(response.headers.get('retry-after') || 0);
      const rateLimited = response.status === 403 && (
        retryAfter > 0 ||
        response.headers.get('x-ratelimit-remaining') === '0' ||
        /rate limit|secondary rate|abuse/i.test(error.githubMessage || '')
      );
      const transient = response.status === 409 || response.status === 429 || rateLimited || response.status >= 500;
      if (retryAfter > 0) delayMs = Math.max(delayMs, retryAfter * 1000);
      if (!transient || attempt >= retries) throw error;
    } catch (error) {
      if (error?.status) throw error;
      lastError = browserNetworkError(error, operation);
      if (attempt >= retries) throw lastError;
    }
    await sleep(delayMs);
  }
  throw lastError || new Error(`GitHub ${operation} failed.`);
}
async function githubJson(url, token, options = {}, operation = 'request', retries = NETWORK_RETRIES) {
  const response = await githubFetch(url, token, options, operation, retries);
  return response.status === 204 ? null : response.json();
}
function parseJson(text, label) {
  const clean = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!clean) throw new Error(`${label} is empty.`);
  try {
    return JSON.parse(clean);
  } catch (error) {
    throw new Error(`${label} is not valid JSON. (${error.message})`);
  }
}
function simpleHash(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
function randomSuffix() {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    return [...values].map(value => value.toString(36)).join('').slice(0, 18);
  }
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`.slice(0, 18);
}
function timestampId() {
  return `${new Date().toISOString().replace(/\D/g, '')}-${randomSuffix()}`;
}
function namespaceFor(settings) {
  return simpleHash(`${settings.owner}/${settings.repo}/${settings.path || 'progress/dental-study-progress.json'}`);
}
function snapshotBranchPrefix(settings) {
  return `amins-sync-${namespaceFor(settings)}-`;
}
function snapshotBranchName(settings, snapshotId = timestampId()) {
  return `${snapshotBranchPrefix(settings)}${snapshotId}`;
}
function snapshotIdFromBranch(settings, branch) {
  const prefix = snapshotBranchPrefix(settings);
  return String(branch || '').startsWith(prefix) ? String(branch).slice(prefix.length) : '';
}
function snapshotDirectory(settings, snapshotId) {
  const base = String(settings.path || 'progress/dental-study-progress.json').split('/').filter(Boolean);
  base.pop();
  const parent = base.length ? base.join('/') : 'progress';
  return `${parent}/.amins-dent-study-sync/${namespaceFor(settings)}/${snapshotId}`;
}
function validateProgressEnvelope(value, label = 'Saved study data') {
  const envelope = value?.progress && typeof value.progress === 'object'
    ? value
    : (value?.banks && typeof value.banks === 'object'
      ? { schemaVersion: 1, updatedAt: value.updatedAt || null, app: "Amin's Dent Study", progress: value }
      : null);
  if (!envelope?.progress || typeof envelope.progress.banks !== 'object') {
    throw new Error(`${label} does not contain a compatible study progress database.`);
  }
  return envelope;
}
function decodeBase64Bytes(text) {
  const binary = atob(String(text || '').replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function decodeBase64(text) {
  return new TextDecoder().decode(decodeBase64Bytes(text));
}
function encodeBase64Bytes(bytes) {
  let binary = '';
  const step = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += step) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + step, bytes.length)));
  }
  return btoa(binary);
}
function encodeBase64Text(text) {
  return encodeBase64Bytes(new TextEncoder().encode(text));
}
async function sha256Hex(bytes) {
  if (!globalThis.crypto?.subtle) return '';
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}
async function mapLimit(values, limit, worker) {
  const results = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => run()));
  return results;
}
function joinBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

// ---------------------------------------------------------------------------
// Browser-safe immutable snapshot branches
// ---------------------------------------------------------------------------
async function getBranchSha(settings, token, branch) {
  let ref;
  try {
    ref = await githubJson(
      `${repoBase(settings)}/git/ref/heads/${safePath(branch)}`,
      token,
      {},
      `base branch “${branch}” lookup`
    );
  } catch (error) {
    if (error?.status === 404) {
      throw new Error(`The synchronization repository or base branch “${branch}” was not found. Make sure the private repository already has at least one commit (for example, a README), the branch name is correct, and the token can access it.`);
    }
    throw error;
  }
  const sha = ref?.object?.sha;
  if (!sha) throw new Error(`Could not determine the commit for branch “${branch}”.`);
  return sha;
}
async function getCommitTreeSha(settings, token, commitSha) {
  const commit = await githubJson(
    `${repoBase(settings)}/git/commits/${encodeURIComponent(commitSha)}`,
    token,
    {},
    'base commit lookup',
    2
  );
  const treeSha = commit?.tree?.sha;
  if (!treeSha) throw new Error('Could not determine the base repository tree.');
  return treeSha;
}

async function createGitBlob(settings, token, bytes, label = 'snapshot data') {
  const blob = await githubJson(`${repoBase(settings)}/git/blobs`, token, {
    method: 'POST',
    body: JSON.stringify({
      content: encodeBase64Bytes(bytes),
      encoding: 'base64'
    })
  }, `${label} blob creation`, 3);
  if (!blob?.sha) throw new Error(`GitHub did not return a blob identifier for ${label}.`);
  return blob.sha;
}

async function createGitTree(settings, token, baseTreeSha, entries) {
  const tree = await githubJson(`${repoBase(settings)}/git/trees`, token, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: entries.map(entry => ({
        path: entry.path,
        mode: '100644',
        type: 'blob',
        sha: entry.sha
      }))
    })
  }, 'snapshot tree creation', 3);
  if (!tree?.sha) throw new Error('GitHub did not return a tree identifier for the synchronization snapshot.');
  return tree.sha;
}

async function createGitCommit(settings, token, treeSha, parentSha, message) {
  const commit = await githubJson(`${repoBase(settings)}/git/commits`, token, {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: treeSha,
      parents: [parentSha]
    })
  }, 'snapshot commit creation', 3);
  if (!commit?.sha) throw new Error('GitHub did not return a commit identifier for the synchronization snapshot.');
  return commit.sha;
}

async function createSnapshotRef(settings, token, branch, commitSha) {
  await githubJson(`${repoBase(settings)}/git/refs`, token, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commitSha })
  }, 'snapshot reference creation', 2);
  return branch;
}

async function deleteSnapshotBranch(settings, token, branch) {
  return githubJson(
    `${repoBase(settings)}/git/refs/heads/${safePath(branch)}`,
    token,
    { method: 'DELETE' },
    'old snapshot cleanup',
    1
  );
}

async function getContentMetadata(settings, token, branch, path, operation = 'snapshot file load') {
  return githubJson(
    `${contentsUrl(settings, path)}?ref=${encodeURIComponent(branch)}`,
    token,
    {},
    operation,
    2
  );
}
async function readContentBytes(settings, token, branch, path, expectedSha = '') {
  // Snapshot manifests record each data blob SHA. When available, read the blob
  // directly and avoid the Contents API's >1 MB response behavior entirely.
  if (expectedSha) {
    const blob = await githubJson(blobUrl(settings, expectedSha), token, {}, `snapshot blob “${path.split('/').pop()}” load`, 2);
    if (!blob || blob.encoding !== 'base64' || typeof blob.content !== 'string') {
      throw new Error(`Snapshot blob “${path}” did not contain readable Base64 content.`);
    }
    return decodeBase64Bytes(blob.content);
  }
  const file = await getContentMetadata(settings, token, branch, path, `snapshot file “${path.split('/').pop()}” load`);
  if (file?.encoding === 'base64' && typeof file.content === 'string' && file.content.trim()) {
    return decodeBase64Bytes(file.content);
  }
  const sha = file?.sha;
  if (!sha) throw new Error(`Snapshot file “${path}” did not contain readable content.`);
  const blob = await githubJson(blobUrl(settings, sha), token, {}, `snapshot blob “${path.split('/').pop()}” load`, 2);
  if (!blob || blob.encoding !== 'base64' || typeof blob.content !== 'string') {
    throw new Error(`Snapshot blob “${path}” did not contain readable Base64 content.`);
  }
  return decodeBase64Bytes(blob.content);
}
async function listSnapshotRefs(settings, token) {
  const prefix = snapshotBranchPrefix(settings);
  const refs = await githubJson(
    `${repoBase(settings)}/git/matching-refs/heads/${encodeURIComponent(prefix)}`,
    token,
    {},
    'snapshot list',
    2
  );
  return (Array.isArray(refs) ? refs : [])
    .map(item => String(item?.ref || '').replace(/^refs\/heads\//, ''))
    .filter(branch => branch.startsWith(prefix))
    .sort((a, b) => b.localeCompare(a));
}
async function readSnapshotManifest(settings, token, branch) {
  const snapshotId = snapshotIdFromBranch(settings, branch);
  if (!snapshotId) throw new Error(`Unrecognized synchronization branch “${branch}”.`);
  const directory = snapshotDirectory(settings, snapshotId);
  const bytes = await readContentBytes(settings, token, branch, `${directory}/manifest.json`);
  const manifest = parseJson(new TextDecoder().decode(bytes), `Synchronization manifest on “${branch}”`);
  if (![SNAPSHOT_FORMAT, LEGACY_SNAPSHOT_BRANCH_FORMAT].includes(manifest?.format) || manifest?.schemaVersion !== 1 || !Array.isArray(manifest.chunks)) {
    throw new Error(`Synchronization manifest on “${branch}” is not a compatible snapshot.`);
  }
  return manifest;
}
async function readSnapshotBranch(settings, token, branch) {
  const manifest = await readSnapshotManifest(settings, token, branch);
  const chunks = [...manifest.chunks].sort((a, b) => Number(a.index || 0) - Number(b.index || 0));
  if (!chunks.length) throw new Error(`Synchronization snapshot “${branch}” has no data chunks.`);
  const parts = await mapLimit(chunks, READ_CONCURRENCY, chunk =>
    readContentBytes(settings, token, branch, chunk.path, chunk.sha || '')
  );
  const joined = joinBytes(parts);
  if (Number(manifest.byteLength || 0) && joined.length !== Number(manifest.byteLength)) {
    throw new Error(`Synchronization snapshot “${branch}” is incomplete (${joined.length} of ${manifest.byteLength} bytes).`);
  }
  if (manifest.checksum) {
    const actual = await sha256Hex(joined);
    if (actual && actual !== manifest.checksum) {
      throw new Error(`Synchronization snapshot “${branch}” failed its integrity check.`);
    }
  }
  const parsed = parseJson(new TextDecoder().decode(joined), `Synchronization snapshot “${branch}”`);
  return validateProgressEnvelope(parsed, `Synchronization snapshot “${branch}”`);
}
async function pruneSnapshotBranches(settings, token, keepBranch) {
  try {
    const branches = await listSnapshotRefs(settings, token);
    const keep = new Set(branches.slice(0, KEEP_SNAPSHOTS));
    keep.add(keepBranch);
    for (const branch of branches) {
      if (keep.has(branch)) continue;
      try {
        await deleteSnapshotBranch(settings, token, branch);
      } catch (error) {
        console.warn(`Old synchronization branch ${branch} could not be removed.`, error);
      }
    }
  } catch (error) {
    console.warn('Synchronization succeeded, but old snapshot cleanup did not complete.', error);
  }
}

// ---------------------------------------------------------------------------
// Legacy release-asset read support only. New saves NEVER use uploads.github.com.
// ---------------------------------------------------------------------------
async function listReleases(settings, token) {
  return githubJson(`${repoBase(settings)}/releases?per_page=100&page=1`, token, {}, 'legacy release list', 1);
}
async function findLegacySyncRelease(settings, token) {
  const releases = await listReleases(settings, token);
  return (Array.isArray(releases) ? releases : []).find(release => release?.tag_name === LEGACY_SYNC_RELEASE_TAG) || null;
}
async function listReleaseAssets(settings, token, releaseId) {
  const assets = [];
  for (let page = 1; page <= 20; page += 1) {
    const batch = await githubJson(`${repoBase(settings)}/releases/${encodeURIComponent(releaseId)}/assets?per_page=100&page=${page}`, token, {}, 'legacy snapshot list', 1);
    const rows = Array.isArray(batch) ? batch : [];
    assets.push(...rows);
    if (rows.length < 100) break;
  }
  return assets;
}
function legacyReleaseAssetsFor(settings, assets) {
  const prefix = `amins-dent-study-${namespaceFor(settings)}-`;
  return (Array.isArray(assets) ? assets : [])
    .filter(asset => asset?.state === 'uploaded' && String(asset.name || '').startsWith(prefix) && String(asset.name || '').endsWith('.json'))
    .sort((a, b) => {
      const at = Date.parse(a.created_at || a.updated_at || 0) || 0;
      const bt = Date.parse(b.created_at || b.updated_at || 0) || 0;
      return bt - at || Number(b.id || 0) - Number(a.id || 0);
    });
}
async function downloadLegacyReleaseAsset(settings, token, asset) {
  const response = await githubFetch(`${repoBase(settings)}/releases/assets/${encodeURIComponent(asset.id)}`, token, {
    method: 'GET',
    accept: 'application/octet-stream',
    headers: { Accept: 'application/octet-stream' },
    redirect: 'follow'
  }, 'legacy snapshot download', 1);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const parsed = parseJson(new TextDecoder().decode(bytes), `Legacy synchronization snapshot “${asset.name}”`);
  return validateProgressEnvelope(parsed, `Legacy synchronization snapshot “${asset.name}”`);
}

// ---------------------------------------------------------------------------
// Older branch-backed formats: read-only migration support.
// ---------------------------------------------------------------------------
async function getLegacyFileMetadata(settings, token) {
  const url = `${contentsUrl(settings)}?ref=${encodeURIComponent(settings.branch || 'main')}`;
  let response;
  try {
    response = await fetch(url, { headers: headers(token), cache: 'no-store' });
  } catch (error) {
    throw browserNetworkError(error, 'loading legacy synchronization metadata');
  }
  if (response.status === 404) return { exists: false, sha: null, file: null };
  if (!response.ok) throw await githubError(response, 'legacy metadata load');
  const file = await response.json();
  if (!file || file.type !== 'file') throw new Error(`The legacy synchronization path “${settings.path}” does not point to a file.`);
  return { exists: true, sha: file.sha, file };
}
async function readBlobBytes(settings, token, sha) {
  const blob = await githubJson(blobUrl(settings, sha), token, {}, 'legacy blob load', 2);
  if (!blob || blob.encoding !== 'base64' || typeof blob.content !== 'string') {
    throw new Error('The legacy synchronization blob did not contain readable Base64 content.');
  }
  return decodeBase64Bytes(blob.content);
}
async function readLegacyFileText(metadata, settings, token) {
  const file = metadata.file;
  if (file.encoding === 'base64' && typeof file.content === 'string' && file.content.trim()) return decodeBase64(file.content);
  return new TextDecoder().decode(await readBlobBytes(settings, token, metadata.sha));
}
async function readLegacySection(settings, token, section) {
  const chunks = [...(section?.chunks || [])].sort((a, b) => Number(a.index || 0) - Number(b.index || 0));
  if (!chunks.length) throw new Error(`The legacy synchronization section “${section?.key || 'unknown'}” has no data parts.`);
  const parts = await mapLimit(chunks, READ_CONCURRENCY, async chunk => {
    if (!chunk.sha) throw new Error(`A legacy data part for “${section.key}” is missing its SHA.`);
    return readBlobBytes(settings, token, chunk.sha);
  });
  const joined = joinBytes(parts);
  if (section.checksum) {
    const actual = await sha256Hex(joined);
    if (actual && actual !== section.checksum) throw new Error(`The legacy synchronization section “${section.key}” failed its integrity check.`);
  }
  return parseJson(new TextDecoder().decode(joined), `Legacy synchronization section “${section.key}”`);
}
function isLegacyManifest(value) {
  return Boolean(value && value.format === LEGACY_CLOUD_FORMAT && value.schemaVersion === 2 && Array.isArray(value.sections));
}
async function readLegacyManifestProgress(manifest, settings, token) {
  const sections = new Map(manifest.sections.map(section => [section.key, section]));
  const coreSection = sections.get('core');
  if (!coreSection) throw new Error('The legacy synchronization manifest is missing the core section.');
  const core = await readLegacySection(settings, token, coreSection);
  const managedSection = sections.get('managedContent');
  const managedContent = managedSection ? await readLegacySection(settings, token, managedSection) : (core.managedContent || {});
  const customBanks = {};
  const bankSections = manifest.sections.filter(section => String(section.key || '').startsWith('bank:'));
  const values = await mapLimit(bankSections, 2, section => readLegacySection(settings, token, section));
  bankSections.forEach((section, index) => { customBanks[String(section.key).slice(5)] = values[index]; });
  return validateProgressEnvelope({
    schemaVersion: 2,
    updatedAt: manifest.updatedAt || null,
    app: "Amin's Dent Study",
    progress: { ...core, customBanks, managedContent }
  }, 'Legacy synchronized study data');
}
async function readLegacyBranchProgress(settings, token) {
  const metadata = await getLegacyFileMetadata(settings, token);
  if (!metadata.exists) return { exists: false, sha: null, data: null };
  const parsed = parseJson(await readLegacyFileText(metadata, settings, token), `Legacy synchronization file “${settings.path}”`);
  const data = isLegacyManifest(parsed)
    ? await readLegacyManifestProgress(parsed, settings, token)
    : validateProgressEnvelope(parsed, `Legacy synchronization file “${settings.path}”`);
  return { exists: true, sha: metadata.sha, data, format: isLegacyManifest(parsed) ? LEGACY_CLOUD_FORMAT : 'legacy-single-file' };
}

export async function readGitHubProgress(settings, token) {
  // Primary format: immutable, uniquely named snapshot branches. Every request stays
  // on api.github.com, which GitHub documents as supporting browser CORS.
  let snapshotError = null;
  try {
    const branches = await listSnapshotRefs(settings, token);
    for (const branch of branches) {
      try {
        return {
          exists: true,
          sha: branch,
          data: await readSnapshotBranch(settings, token, branch),
          format: SNAPSHOT_FORMAT
        };
      } catch (error) {
        snapshotError = error;
        console.warn(`Snapshot branch ${branch} could not be loaded; trying the previous snapshot.`, error);
      }
    }
  } catch (error) {
    snapshotError = error;
    console.warn('Snapshot branch discovery failed; trying migration formats.', error);
  }

  // Migration fallback 1: v17 release assets. Reading is attempted only; new data
  // is never uploaded to uploads.github.com.
  let releaseError = null;
  try {
    const release = await findLegacySyncRelease(settings, token);
    if (release) {
      const assets = legacyReleaseAssetsFor(settings, await listReleaseAssets(settings, token, release.id));
      for (const asset of assets) {
        try {
          return {
            exists: true,
            sha: String(asset.id),
            data: await downloadLegacyReleaseAsset(settings, token, asset),
            format: LEGACY_RELEASE_FORMAT
          };
        } catch (error) {
          releaseError = error;
          console.warn(`Legacy release snapshot ${asset.name} could not be loaded; trying another format.`, error);
        }
      }
    }
  } catch (error) {
    releaseError = error;
    console.warn('Legacy release snapshot lookup failed; trying branch-backed data.', error);
  }

  // Migration fallback 2: v1/v2 branch-backed data.
  try {
    const legacy = await readLegacyBranchProgress(settings, token);
    if (legacy.exists) return legacy;
  } catch (error) {
    if (snapshotError) console.warn('Newest snapshot error:', snapshotError);
    if (releaseError) console.warn('Legacy release error:', releaseError);
    throw error;
  }

  if (snapshotError && snapshotError.networkFailure) throw snapshotError;
  if (releaseError && releaseError.networkFailure) throw releaseError;
  return { exists: false, sha: null, data: null, format: null };
}

export async function writeGitHubProgress(settings, token, progress) {
  const envelope = {
    format: SNAPSHOT_FORMAT,
    schemaVersion: 5,
    app: "Amin's Dent Study",
    updatedAt: new Date().toISOString(),
    progress
  };
  validateProgressEnvelope(envelope);

  let json;
  try {
    json = JSON.stringify(envelope);
  } catch (error) {
    throw new Error(`Study data could not be serialized for synchronization. (${error.message})`);
  }
  const bytes = new TextEncoder().encode(json);
  if (!bytes.length) throw new Error('Study data is empty and was not synchronized.');
  const checksum = await sha256Hex(bytes);

  // A save never updates an existing branch. It creates all immutable Git objects
  // first and then creates one uniquely named reference pointing directly at the
  // finished commit. This removes the non-fast-forward race by design.
  const baseBranch = settings.branch || 'main';
  const baseSha = await getBranchSha(settings, token, baseBranch);
  const baseTreeSha = await getCommitTreeSha(settings, token, baseSha);
  const snapshotId = timestampId();
  const branch = snapshotBranchName(settings, snapshotId);
  const directory = snapshotDirectory(settings, snapshotId);

  const chunkSpecs = [];
  for (let offset = 0, index = 0; offset < bytes.length; offset += CHUNK_BYTES, index += 1) {
    const part = bytes.subarray(offset, Math.min(offset + CHUNK_BYTES, bytes.length));
    chunkSpecs.push({
      index,
      bytes: part,
      path: `${directory}/part-${String(index + 1).padStart(5, '0')}.bin`
    });
  }

  const chunkEntries = await mapLimit(chunkSpecs, WRITE_CONCURRENCY, async spec => {
    const sha = await createGitBlob(settings, token, spec.bytes, `snapshot part ${spec.index + 1}`);
    return {
      index: spec.index,
      path: spec.path,
      byteLength: spec.bytes.length,
      sha
    };
  });

  const manifest = {
    format: SNAPSHOT_FORMAT,
    schemaVersion: 1,
    app: "Amin's Dent Study",
    createdAt: envelope.updatedAt,
    sourcePath: settings.path || 'progress/dental-study-progress.json',
    byteLength: bytes.length,
    checksum,
    chunkBytes: CHUNK_BYTES,
    chunks: chunkEntries.map(({ index, path, byteLength, sha }) => ({ index, path, byteLength, sha }))
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  const manifestPath = `${directory}/manifest.json`;
  const manifestSha = await createGitBlob(settings, token, manifestBytes, 'snapshot manifest');

  const treeSha = await createGitTree(settings, token, baseTreeSha, [
    ...chunkEntries.map(entry => ({ path: entry.path, sha: entry.sha })),
    { path: manifestPath, sha: manifestSha }
  ]);
  const commitSha = await createGitCommit(
    settings,
    token,
    treeSha,
    baseSha,
    `Amin's Dent Study synchronization snapshot ${snapshotId}`
  );

  // This is CREATE, not UPDATE. There is no PATCH /git/refs and therefore no
  // fast-forward check against another browser's save.
  await createSnapshotRef(settings, token, branch, commitSha);
  await pruneSnapshotBranches(settings, token, branch);

  return {
    schemaVersion: 5,
    updatedAt: envelope.updatedAt,
    app: envelope.app,
    progress,
    snapshotBranch: branch,
    snapshotCommit: commitSha,
    format: SNAPSHOT_FORMAT,
    byteLength: bytes.length,
    chunks: chunkEntries.length
  };
}
