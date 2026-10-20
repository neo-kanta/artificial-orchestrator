export function orderedProviderIds(order = [], availableIds = []) {
  const available = new Set(availableIds.map((id) => String(id).trim()).filter(Boolean));
  const seen = new Set();
  return order
    .map((id) => String(id).trim())
    .filter((id) => id && available.has(id) && !seen.has(id) && Boolean(seen.add(id)));
}

export function updateProviderOrder(order = [], providerId, selected, availableIds = []) {
  const id = String(providerId ?? "").trim();
  const current = orderedProviderIds(order, availableIds);
  if (!id || !availableIds.map((value) => String(value).trim()).includes(id)) return current;
  if (selected) return current.includes(id) ? current : [...current, id];
  return current.filter((value) => value !== id);
}

export function providerDisplayOrder(providers = [], selectedIds = []) {
  const order = orderedProviderIds(selectedIds, providers.map((provider) => provider.id));
  const selected = new Map(order.map((id, index) => [id, index + 1]));
  return providers
    .slice()
    .sort((left, right) => {
      const leftStep = selected.get(left.id);
      const rightStep = selected.get(right.id);
      if (leftStep && rightStep) return leftStep - rightStep;
      if (leftStep) return -1;
      if (rightStep) return 1;
      return String(left.label ?? left.id).localeCompare(String(right.label ?? right.id));
    })
    .map((provider) => ({ ...provider, pipelineStep: selected.get(provider.id) ?? null }));
}
