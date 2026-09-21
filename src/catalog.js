// Catalog data is loaded independently from geometry. A context occurrence in
// another view points back to the same stable identity instead of counting twice.
export function normalize(text) {
  return String(text ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function matchesPart(record, query, card = {}) {
  const text = normalize([record.name, record.id, record.system, ...(record.aliases || []),
    card.installedBrand, card.location, card.partNumber?.value, ...(card.ownerInterchangeNumbers||[]), ...(card.manualCandidateNumbers||[]),
    record.installedBrand, record.oemPartNumber, record.supplierPartNumber].join(' '));
  return normalize(query).split(' ').every(word => text.includes(word));
}

export function indexCatalog(catalogs, cards = {}) {
  const entries = new Map();
  for (const {scope, manifest} of catalogs) for (const record of manifest.assemblies) {
    if (record.contextOnly) continue;
    if (entries.has(record.id)) throw new Error(`Duplicate catalog identity: ${record.id}`);
    entries.set(record.id, {scope: scope.id, scopeLabel: scope.label, record, card: cards[record.id] || {}});
  }
  return [...entries.values()];
}

export function scopeTrail(id, definitions) {
  const trail = [], seen = new Set();
  while (id && definitions.has(id)) {
    if (seen.has(id)) throw new Error('Cyclic scope navigation');
    seen.add(id);
    const scope = definitions.get(id);
    trail.unshift(scope);
    id = scope.parentScopeId || (id === 'vehicle' ? null : 'vehicle');
  }
  return trail;
}
