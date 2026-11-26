// Same-origin local storage only. Scientific packages are never changed here.
export const CHECKPOINT_DB = 'amyloid-analysis-checkpoints-v1';
export const CHECKPOINT_LOCK = 'amyloid-analysis-checkpoint-writer-v1';
const STORES = ['run', 'inputs', 'descriptors', 'alignments', 'completion'];
// Keep each IndexedDB value well below browser serialization limits. A batch's
// ZIP and viewer files can together exceed that limit even with valid inputs.
const COMPLETION_CHUNK_BYTES = 8 * 1024 * 1024;
let connection;
const releasingLocks = new Map();
export function checkpointFailure(error, stage = 'completion') {
  const name =
    typeof error?.name === 'string' && error.name ? error.name : 'Error';
  const fallback =
    name === 'QuotaExceededError'
      ? 'The browser could not allocate enough storage. Free disk space or remove unneeded saved runs, then retry saving. This run has not been deleted.'
      : name === 'UnknownError'
        ? 'The browser could not write the results. Its storage service did not provide a reason.'
        : name === 'AbortError'
          ? 'The browser interrupted the save. You can retry saving the results.'
          : 'The browser did not provide an error message. You can retry saving the results.';
  return {
    name,
    stage,
    message:
      typeof error?.message === 'string' && error.message.trim()
        ? error.message
        : fallback,
  };
}
export async function digest(value) {
  async function canonical(item) {
    if (item instanceof ArrayBuffer || ArrayBuffer.isView(item)) {
      const bytes =
        item instanceof ArrayBuffer
          ? item
          : new Uint8Array(item.buffer, item.byteOffset, item.byteLength);
      return { bytes: bytes.byteLength, sha256: await hash(bytes) };
    }
    if (Array.isArray(item)) return Promise.all(item.map(canonical));
    if (item && typeof item === 'object') {
      const result = {};
      for (const key of Object.keys(item).sort()) {
        if (item[key] !== undefined) result[key] = await canonical(item[key]);
      }
      return result;
    }
    return item;
  }
  return hash(new TextEncoder().encode(JSON.stringify(await canonical(value))));
}
async function hash(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
function database() {
  if (!connection) {
    const open = () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open(CHECKPOINT_DB, 2);
        let blocked = false;
        request.onupgradeneeded = (event) => {
          if (event.oldVersion === 0) {
            for (const name of STORES) request.result.createObjectStore(name);
            return;
          }
          // Upgrade the previous single saved run in the same atomic transaction.
          const tx = request.transaction;
          const runs = tx.objectStore('run');
          const old = runs.get('current');
          old.onsuccess = () => {
            if (!old.result) return;
            const meta = old.result;
            const input = tx.objectStore('inputs').get('current');
            input.onsuccess = () => {
              runs.put(
                {
                  ...meta,
                  name: runName(input.result?.payload),
                  createdAt: meta.updatedAt,
                  activity: 'paused',
                },
                meta.id
              );
              runs.delete('current');
            };
            for (const name of STORES.filter((name) => name !== 'run')) {
              const store = tx.objectStore(name);
              const cursor = store.openCursor();
              cursor.onsuccess = () => {
                const item = cursor.result;
                if (!item) return;
                if (!Array.isArray(item.key)) {
                  store.put(item.value, [meta.id, item.key]);
                  item.delete();
                }
                item.continue();
              };
            }
          };
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => {
          blocked = true;
          reject(
            new Error(
              'Close other analysis tabs and refresh to upgrade saved run storage.'
            )
          );
        };
        request.onsuccess = () => {
          const db = request.result;
          if (blocked) {
            db.close();
            return;
          }
          db.onversionchange = () => {
            db.close();
            connection = undefined;
          };
          resolve(db);
        };
      });
    // Older releases hold this exclusive lock throughout calculation. New readers
    // share a brief guard so migration cannot invalidate an active legacy writer.
    const opening = globalThis.navigator?.locks
      ? navigator.locks.request(
          CHECKPOINT_LOCK,
          { mode: 'shared', ifAvailable: true },
          (lock) => {
            if (!lock)
              throw new Error(
                'An older analysis tab is still running. Pause it or close that tab to load run history.'
              );
            return open();
          }
        )
      : open();
    connection = opening.catch((error) => {
      connection = undefined;
      throw error;
    });
  }
  return connection;
}
async function transaction(stores, mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(stores, mode, { durability: 'strict' });
    } catch (error) {
      if (!(error instanceof TypeError)) {
        reject(error);
        return;
      }
      tx = db.transaction(stores, mode);
    }
    let output, problem;
    tx.oncomplete = () => resolve(output);
    tx.onabort = () =>
      reject(
        problem ||
          tx.error ||
          new Error('Local checkpoint write was interrupted.')
      );
    const fail = (error) => {
      problem = error;
      tx.abort();
    };
    try {
      action(
        tx,
        (value) => {
          output = value;
        },
        fail,
        (callback) =>
          (...args) => {
            try {
              return callback(...args);
            } catch (error) {
              fail(error);
            }
          }
      );
    } catch (error) {
      fail(error);
    }
  });
}
function read(store, key) {
  return transaction([store], 'readonly', (tx, done) => {
    const request = tx.objectStore(store).get(key);
    request.onsuccess = () => done(request.result ?? null);
  });
}
function checkRun(meta, id) {
  if (!meta || meta.id !== id || meta.format !== 1)
    throw new Error(
      'The saved run changed or is no longer supported. Refresh this page.'
    );
}
async function verified(record, id) {
  if (!record) return null;
  if (record.runId !== id || (await digest(record.payload)) !== record.digest)
    throw new Error(
      'A saved checkpoint failed its integrity check. Delete the saved run and start again.'
    );
  return record.payload;
}
function runName(input) {
  const files = input?.files || [];
  return files.length
    ? `${files[0].name}${files.length > 1 ? ` + ${files.length - 1} More` : ''}`
    : 'Saved Analysis';
}
function runRange(id) {
  return IDBKeyRange.bound([id], [id, []]);
}
async function summaries() {
  return transaction(['run'], 'readonly', (tx, done) => {
    const request = tx.objectStore('run').getAll();
    request.onsuccess = () =>
      done(
        request.result.sort(
          (a, b) =>
            (b.createdAt ?? b.updatedAt) - (a.createdAt ?? a.updatedAt) ||
            a.id.localeCompare(b.id)
        )
      );
  });
}
export async function readCheckpointSummary(id) {
  return id ? read('run', id) : ((await summaries())[0] ?? null);
}
export async function listCheckpoints() {
  const records = await summaries();
  const locks = await navigator.locks.query();
  const held = new Set(locks.held.map((lock) => lock.name));
  return records.map((meta) => {
    const busy = held.has(`${CHECKPOINT_LOCK}:${meta.id}`);
    return {
      ...meta,
      busy,
      displayStatus:
        meta.status === 'complete' || meta.analysisStatus === 'completed'
          ? 'completed'
          : busy && meta.activity === 'running'
            ? 'running'
            : meta.activity === 'failed'
              ? 'failed'
              : 'paused',
    };
  });
}
export async function readCheckpointInputs(id) {
  const meta = await readCheckpointSummary(id);
  checkRun(meta, id);
  const record = await read('inputs', [id, 'current']);
  if (!record || record.digest !== meta.inputDigest)
    throw new Error('The saved inputs are missing or inconsistent.');
  return verified(record, id);
}
export async function readCheckpointModels(id) {
  checkRun(await readCheckpointSummary(id), id);
  const keys = await transaction(['descriptors'], 'readonly', (tx, done) => {
    const request = tx.objectStore('descriptors').getAllKeys(runRange(id));
    request.onsuccess = () => done(request.result);
  });
  const models = [];
  for (const key of keys) {
    const output = await verified(await read('descriptors', key), id);
    if (output?.model) models.push(output.model);
  }
  return models.sort((a, b) => a.id.localeCompare(b.id));
}
export async function readCheckpointCompletion(id) {
  const meta = await readCheckpointSummary(id);
  checkRun(meta, id);
  if (meta.status !== 'complete') return null;
  const saved = await verified(await read('completion', [id, 'current']), id);
  if (saved?.storageFormat !== 'chunked-completion-v1') return saved;
  async function restore(reference) {
    if (
      !Number.isSafeInteger(reference?.size) ||
      reference.size < 0 ||
      !Array.isArray(reference.parts)
    )
      throw new Error('The saved results have invalid file metadata.');
    const bytes = new Uint8Array(reference.size);
    let offset = 0;
    for (const key of reference.parts) {
      const part = await verified(await read('completion', [id, key]), id);
      if (
        !(part instanceof ArrayBuffer) ||
        !part.byteLength ||
        part.byteLength > COMPLETION_CHUNK_BYTES ||
        offset + part.byteLength > bytes.length
      )
        throw new Error('A saved results file is missing or inconsistent.');
      bytes.set(new Uint8Array(part), offset);
      offset += part.byteLength;
    }
    if (offset !== bytes.length)
      throw new Error('A saved results file is incomplete.');
    return bytes.buffer;
  }
  const { storageFormat, ...completed } = saved;
  const artifacts = {};
  for (const [model, files] of Object.entries(saved.artifacts)) {
    artifacts[model] = [];
    for (const file of files)
      artifacts[model].push({
        name: file.name,
        bytes: await restore(file.bytes),
      });
  }
  return { ...completed, artifacts, archive: await restore(saved.archive) };
}
export async function acquireCheckpointLock(id) {
  if (!id) throw new Error('A run ID is required to access saved progress.');
  const name = `${CHECKPOINT_LOCK}:${id}`;
  await releasingLocks.get(name);
  return new Promise((resolve, reject) => {
    if (!globalThis.navigator?.locks) {
      reject(
        new Error(
          'This browser cannot safely save checkpoints. Turn off Save Progress On This Device to continue.'
        )
      );
      return;
    }
    const request = navigator.locks
      .request(name, { ifAvailable: true }, async (lock) => {
        if (!lock) {
          reject(
            new Error(
              'Another tab is using this saved run. Pause that analysis or close its tab first.'
            )
          );
          return;
        }
        await new Promise((release) =>
          resolve(() => {
            release();
            releasingLocks.set(name, request);
            void request.finally(() => {
              if (releasingLocks.get(name) === request)
                releasingLocks.delete(name);
            });
            return request;
          })
        );
      })
      .catch(reject);
  });
}
function savedElapsed(meta, elapsedMs) {
  return Math.max(
    Number.isFinite(meta.elapsedMs) ? meta.elapsedMs : 0,
    Number.isFinite(elapsedMs) ? elapsedMs : 0,
    0
  );
}
// Heartbeats cannot revive a paused run, change a completed run, or overwrite
// a newer attempt. The page holds the run lock until its final time is saved.
export async function saveCheckpointElapsed(id, attempt, elapsedMs) {
  return transaction(['run'], 'readwrite', (tx, done, fail, guard) => {
    const store = tx.objectStore('run');
    const request = store.get(id);
    request.onsuccess = guard(() => {
      const meta = request.result;
      if (
        !meta ||
        !attempt ||
        meta.attempt !== attempt ||
        meta.status === 'complete' ||
        meta.activity !== 'running'
      )
        return done(null);
      const updated = {
        ...meta,
        elapsedMs: savedElapsed(meta, elapsedMs),
      };
      store.put(updated, id);
      done(updated);
    });
  });
}
export async function setCheckpointActivity(
  id,
  activity,
  error = '',
  elapsedMs
) {
  return transaction(['run'], 'readwrite', (tx, done, fail, guard) => {
    const store = tx.objectStore('run');
    const request = store.get(id);
    request.onsuccess = guard(() => {
      if (!request.result) return done(null);
      checkRun(request.result, id);
      const complete = request.result.status === 'complete';
      if (complete && !Number.isFinite(elapsedMs)) return done(request.result);
      const meta = {
        ...request.result,
        ...(!complete ? { activity, error } : {}),
        ...(Number.isFinite(elapsedMs)
          ? { elapsedMs: savedElapsed(request.result, elapsedMs) }
          : {}),
        updatedAt: Date.now(),
      };
      store.put(meta, id);
      done(meta);
    });
  });
}
// Analysis completion and successful browser persistence are distinct outcomes.
// The page still owns the run lock while this small metadata update commits.
export async function markCheckpointFinished(id, attempt, outcome, elapsedMs) {
  return transaction(['run'], 'readwrite', (tx, done, fail, guard) => {
    const store = tx.objectStore('run');
    const request = store.get(id);
    request.onsuccess = guard(() => {
      checkRun(request.result, id);
      if (!attempt || request.result.attempt !== attempt)
        throw new Error(
          'A newer attempt owns this run. Its status was not changed.'
        );
      const saved = request.result.status === 'complete';
      const meta = {
        ...request.result,
        analysisStatus: 'completed',
        resultStorage: saved ? 'saved' : 'not_saved',
        activity: 'paused',
        error: '',
        saveError: saved ? '' : outcome.saveError,
        hasErrors: outcome.hasErrors,
        elapsedMs: savedElapsed(request.result, elapsedMs),
        updatedAt: Date.now(),
      };
      store.put(meta, id);
      done(meta);
    });
  });
}
export async function deleteCheckpoint(id) {
  const release = await acquireCheckpointLock(id);
  try {
    await transaction(STORES, 'readwrite', (tx, done) => {
      tx.objectStore('run').delete(id);
      for (const name of STORES.filter((name) => name !== 'run'))
        tx.objectStore(name).delete(runRange(id));
      done(null);
    });
  } finally {
    await release();
  }
}
export async function scienceDigest(engine) {
  const { checkpoint_compatible_engines, ...settings } = engine;
  const {
    ['worker.mjs']: worker,
    ['checkpoints.mjs']: storage,
    ['run-report.py']: presentation,
    ...files
  } = engine.files || {};
  return digest({ ...settings, files });
}
async function compatibleEngine(engine, previousDigest, currentDigest) {
  if (previousDigest === currentDigest) return true;
  const previous = engine.checkpoint_compatible_engines?.find(
    (entry) => entry.engine === previousDigest
  );
  return !!previous && previous.science === (await scienceDigest(engine));
}
export async function openCheckpoint(
  input,
  engine,
  resumeId,
  newId = crypto.randomUUID()
) {
  const engineDigest = await digest(engine);
  const inputDigest = await digest(input);
  const attempt = crypto.randomUUID();
  let meta;
  if (resumeId) {
    meta = await readCheckpointSummary(resumeId);
    checkRun(meta, resumeId);
    if (!(await compatibleEngine(engine, meta.engineDigest, engineDigest)))
      throw new Error(
        'This saved run uses a different analysis engine. Its data is retained, but it cannot resume with this release. Delete the saved run to start again.'
      );
    if (meta.inputDigest !== inputDigest)
      throw new Error(
        'Saved inputs or analysis settings do not match this run.'
      );
    if (meta.status === 'complete')
      throw new Error('This run is already complete. Open its saved results.');
    meta = {
      ...meta,
      attempt,
      activity: 'running',
      error: '',
      analysisStatus: undefined,
      resultStorage: undefined,
      saveError: '',
      updatedAt: Date.now(),
    };
  } else {
    meta = {
      format: 1,
      id: newId,
      attempt,
      engineDigest,
      inputDigest,
      name: runName(input),
      createdAt: Date.now(),
      inputCount: input.files.length,
      inputBytes: input.files.reduce((sum, f) => sum + f.bytes.byteLength, 0),
      descriptors: 0,
      alignments: 0,
      status: 'incomplete',
      activity: 'running',
      updatedAt: Date.now(),
    };
  }
  await transaction(
    ['run', 'inputs', 'completion'],
    'readwrite',
    (tx, done, fail, guard) => {
      const runs = tx.objectStore('run');
      const request = runs.get(meta.id);
      request.onsuccess = guard(() => {
        if (resumeId) checkRun(request.result, resumeId);
        else if (request.result)
          throw new Error(
            'A saved run already has this ID. Start a new analysis.'
          );
        runs.put(meta, meta.id);
        // Only unfinished runs reach here. Remove abandoned completion chunks;
        // descriptor and alignment checkpoints are retained for recovery.
        if (resumeId) tx.objectStore('completion').delete(runRange(meta.id));
        if (!resumeId)
          tx.objectStore('inputs').put(
            { runId: meta.id, payload: input, digest: inputDigest },
            [meta.id, 'current']
          );
        done(meta);
      });
    }
  );
  return checkpointWriter(meta);
}

// Retry only the finished output. Keep input, descriptor, and alignment records
// intact, and refuse stale tabs before reclaiming this attempt's partial save.
export async function retryCheckpointCompletion(
  id,
  attempt,
  payload,
  elapsedMs,
  onProgress
) {
  const release = await acquireCheckpointLock(id);
  try {
    const meta = await transaction(
      ['run', 'completion'],
      'readwrite',
      (tx, done, fail, guard) => {
        const store = tx.objectStore('run');
        const request = store.get(id);
        request.onsuccess = guard(() => {
          checkRun(request.result, id);
          if (!attempt || request.result.attempt !== attempt)
            throw new Error(
              'This run was resumed in another tab. Open its latest saved results before saving again.'
            );
          if (request.result.status === 'complete') return done(request.result);
          tx.objectStore('completion').delete(runRange(id));
          const meta = {
            ...request.result,
            elapsedMs: savedElapsed(request.result, elapsedMs),
          };
          store.put(meta, id);
          done(meta);
        });
      }
    );
    if (meta.status === 'complete') return meta;
    return await checkpointWriter(meta).put(
      'completion',
      'current',
      payload,
      onProgress
    );
  } finally {
    await release();
  }
}

function checkpointWriter(meta) {
  const { id, attempt } = meta;
  const session = {
    meta,
    async keys(store) {
      return transaction([store], 'readonly', (tx, done) => {
        const request = tx.objectStore(store).getAllKeys(runRange(id));
        request.onsuccess = () => done(request.result.map((key) => key[1]));
      });
    },
    async get(store, key) {
      return verified(await read(store, [id, key]), id);
    },
    async put(store, key, payload, onProgress) {
      if (
        store === 'completion' &&
        key === 'current' &&
        payload.archive instanceof ArrayBuffer
      ) {
        let index = 0;
        const buffers = [
          payload.archive,
          ...Object.values(payload.artifacts ?? {}).flatMap((files) =>
            files.map((file) => file.bytes)
          ),
        ];
        const total =
          buffers.reduce(
            (sum, bytes) =>
              sum + Math.ceil(bytes.byteLength / COMPLETION_CHUNK_BYTES),
            0
          ) + 1;
        onProgress?.(0, total);
        async function save(bytes) {
          const parts = [];
          for (
            let offset = 0;
            offset < bytes.byteLength;
            offset += COMPLETION_CHUNK_BYTES
          ) {
            const part = `part:${attempt}:${index++}`;
            await session.put(
              'completion',
              part,
              bytes.slice(offset, offset + COMPLETION_CHUNK_BYTES)
            );
            parts.push(part);
            onProgress?.(index, total);
          }
          return { size: bytes.byteLength, parts };
        }
        const archive = await save(payload.archive);
        const artifacts = {};
        for (const [model, files] of Object.entries(payload.artifacts ?? {})) {
          artifacts[model] = [];
          for (const file of files)
            artifacts[model].push({
              name: file.name,
              bytes: await save(file.bytes),
            });
        }
        // Every chunk is committed first. Publish the manifest and completed
        // status atomically, so an interrupted save can never look complete.
        const summary = await session.put('completion', 'current', {
          ...payload,
          archive,
          artifacts,
          storageFormat: 'chunked-completion-v1',
        });
        onProgress?.(total, total);
        return summary;
      }
      const sealed = { runId: id, payload, digest: await digest(payload) };
      return transaction(
        ['run', store],
        'readwrite',
        (tx, done, fail, guard) => {
          const current = tx.objectStore('run').get(id);
          current.onsuccess = guard(() => {
            checkRun(current.result, id);
            if (
              current.result.attempt !== attempt ||
              current.result.status === 'complete'
            )
              throw new Error(
                'The saved run changed or finished. This writer can no longer update it.'
              );
            const previous = tx.objectStore(store).getKey([id, key]);
            previous.onsuccess = guard(() => {
              const updated = { ...current.result, updatedAt: Date.now() };
              if (
                previous.result === undefined &&
                (store === 'descriptors' || store === 'alignments')
              )
                updated[store]++;
              if (store === 'completion' && key === 'current') {
                updated.status = 'complete';
                updated.analysisStatus = 'completed';
                updated.resultStorage = 'saved';
                updated.saveError = '';
                updated.error = '';
                updated.hasErrors =
                  payload.result?.structures?.some(
                    (model) =>
                      model.state !== 'complete' || model.comparison_error
                  ) ||
                  payload.result?.groups?.some(
                    (group) => group.clustering_status === 'failed'
                  ) ||
                  false;
              }
              tx.objectStore(store).put(sealed, [id, key]);
              tx.objectStore('run').put(updated, id);
              done(updated);
            });
          });
        }
      );
    },
  };
  return session;
}
