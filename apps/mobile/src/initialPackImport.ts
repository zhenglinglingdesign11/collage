/** Resolve the whole selection before changing a Draft; late results from an unmounted editor are ignored. */
export const runInitialPackImport = async <Item, Resolved>(
  items: readonly Item[],
  resolve: (item: Item) => Promise<Resolved>,
  isActive: () => boolean,
  commit: (records: readonly Resolved[]) => void,
  maxConcurrent = items.length,
): Promise<'committed' | 'failed' | 'cancelled'> => {
  const results: PromiseSettledResult<Resolved>[] = [];
  const batchSize = Math.max(1, maxConcurrent);
  for (let index = 0; index < items.length; index += batchSize) {
    results.push(...await Promise.allSettled(items.slice(index, index + batchSize).map(resolve)));
    if (!isActive()) return 'cancelled';
  }
  if (!isActive()) return 'cancelled';
  if (results.some((result) => result.status === 'rejected')) return 'failed';
  commit(results.map((result) => (result as PromiseFulfilledResult<Resolved>).value));
  return 'committed';
};
