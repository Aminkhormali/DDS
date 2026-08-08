export const CONTENT_SORT_MODES = new Set([
  'manual',
  'alphabetical',
  'added-desc',
  'added-asc',
  'modified-desc',
  'modified-asc'
]);

export function normalizeLayoutSortMode(value) {
  return CONTENT_SORT_MODES.has(value) ? value : 'manual';
}

export function mergeVisibleLayoutOrder(fullOrder, visibleIds, validIds) {
  const normalize = value => String(value ?? '').trim();
  const valid = new Set(validIds.map(normalize));
  const visible = visibleIds.map(normalize).filter(id => valid.has(id));
  const visibleSet = new Set(visible);
  const baseline = fullOrder.map(normalize).filter(id => valid.has(id));
  const baselineSet = new Set(baseline);
  const complete = [...baseline, ...validIds.map(normalize).filter(id => !baselineSet.has(id))];
  let cursor = 0;
  return complete.map(id => visibleSet.has(id) ? visible[cursor++] : id);
}

export function sortItemsByLayout(items, state, { id, title }) {
  const mode = normalizeLayoutSortMode(state?.mode);
  const source = items.map((item, index) => ({ item, index, key: String(id(item) ?? '').trim() }));
  const manualMap = new Map((state?.order || []).map((key, index) => [String(key ?? '').trim(), index]));
  const titleCompare = (a, b) => String(title(a.item) || '').localeCompare(String(title(b.item) || ''), undefined, {
    numeric: true,
    sensitivity: 'base'
  });
  const dateValue = (entry, field) => {
    const raw = state?.items?.[entry.key]?.[field] || '';
    const time = Date.parse(raw);
    return Number.isNaN(time) ? 0 : time;
  };

  source.sort((a, b) => {
    if (mode === 'alphabetical') return titleCompare(a, b) || a.index - b.index;
    if (mode === 'added-desc' || mode === 'added-asc') {
      const direction = mode.endsWith('desc') ? -1 : 1;
      const difference = dateValue(a, 'addedAt') - dateValue(b, 'addedAt');
      return difference ? direction * difference : titleCompare(a, b) || a.index - b.index;
    }
    if (mode === 'modified-desc' || mode === 'modified-asc') {
      const direction = mode.endsWith('desc') ? -1 : 1;
      const difference = dateValue(a, 'modifiedAt') - dateValue(b, 'modifiedAt');
      return difference ? direction * difference : titleCompare(a, b) || a.index - b.index;
    }
    const ai = manualMap.has(a.key) ? manualMap.get(a.key) : Number.MAX_SAFE_INTEGER;
    const bi = manualMap.has(b.key) ? manualMap.get(b.key) : Number.MAX_SAFE_INTEGER;
    return ai === bi ? a.index - b.index : ai - bi;
  });
  return source.map(entry => entry.item);
}
