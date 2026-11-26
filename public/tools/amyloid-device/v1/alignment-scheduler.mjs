// Only a bounded number of comparisons are in flight. Python acceptance is
// awaited serially, so different completions never overwrite its globals.
export async function scheduleAlignments(
  tasks,
  workers,
  execute,
  accept,
  completed
) {
  if (!Number.isInteger(workers) || workers < 1 || workers > 4)
    throw new Error('Invalid worker count.');
  const pending = new Map(),
    failedGroups = new Set();
  let cursor = 0,
    done = 0;
  while (cursor < tasks.length || pending.size) {
    while (cursor < tasks.length && pending.size < workers) {
      const index = cursor++,
        task = tasks[index];
      if (failedGroups.has(task.group)) {
        completed(task, { skipped: true, failed: false, elapsedMs: 0 }, ++done);
        continue;
      }
      const started = performance.now();
      pending.set(
        index,
        Promise.resolve()
          .then(() => execute(task))
          .then(
            (result) => ({ index, task, result }),
            (error) => ({
              index,
              task,
              result: {
                stdout: '',
                error: String(error),
                elapsedMs: performance.now() - started,
              },
            })
          )
      );
    }
    if (!pending.size) break;
    const { index, task, result } = await Promise.race(pending.values());
    pending.delete(index);
    const failed = Boolean(await accept(task, result));
    if (failed) failedGroups.add(task.group);
    completed(
      task,
      { skipped: false, failed, elapsedMs: result.elapsedMs },
      ++done
    );
  }
}
