// Bounded structure work with ordered output, independent of completion order.
export function resolveDescriptorWorkers(choice, cores, tasks, memoryGB) {
  if (!['auto', 1, 2, 4].includes(choice))
    throw new Error('Choose Auto, 1, 2, or 4 descriptor workers.');
  const available =
    Number.isFinite(cores) && cores >= 1 ? Math.floor(cores) : 2;
  const automatic =
    tasks < 4 || (memoryGB > 0 && memoryGB <= 4)
      ? 1
      : Math.min(2, Math.max(1, available - 1));
  return Math.max(
    1,
    Math.min(choice === 'auto' ? automatic : choice, available, tasks)
  );
}

export async function scheduleDescriptors(entries, count, run, completed) {
  if (!Number.isInteger(count) || count < 1 || count > 4)
    throw new Error('Invalid descriptor concurrency.');
  const results = new Array(entries.length);
  let next = 0,
    stopped = false;
  await Promise.all(
    Array.from({ length: Math.min(count, entries.length) }, async () => {
      while (!stopped && next < entries.length) {
        const index = next++;
        try {
          const result = await run(entries[index], index);
          results[index] = result;
          completed(result, index);
        } catch (error) {
          stopped = true;
          throw error;
        }
      }
    })
  );
  return results;
}
