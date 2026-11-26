// Same-origin local storage only. Scientific packages are never changed here.
export const CHECKPOINT_DB = 'amyloid-analysis-checkpoints-v1';
export const CHECKPOINT_LOCK = 'amyloid-analysis-checkpoint-writer-v1';
const STORES = ['run', 'inputs', 'descriptors', 'alignments', 'completion'];
let connection;
let releasingLock = Promise.resolve();
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
  if (!connection)
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(CHECKPOINT_DB, 1);
      request.onupgradeneeded = () => {
        for (const name of STORES) request.result.createObjectStore(name);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(
          new Error('Local checkpoint storage is blocked by another tab.')
        );
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          connection = undefined;
        };
        resolve(db);
      };
    }).catch((error) => {
      connection = undefined;
      throw error;
    });
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
export async function readCheckpointSummary() {
  return read('run', 'current');
}
export async function readCheckpointInputs(id) {
  const meta = await readCheckpointSummary();
  checkRun(meta, id);
  const record = await read('inputs', 'current');
  if (!record || record.digest !== meta.inputDigest)
    throw new Error('The saved inputs are missing or inconsistent.');
  return verified(record, id);
}
export async function readCheckpointCompletion(id) {
  checkRun(await readCheckpointSummary(), id);
  return verified(await read('completion', 'current'), id);
}
export async function acquireCheckpointLock() {
  await releasingLock;
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
      .request(CHECKPOINT_LOCK, { ifAvailable: true }, async (lock) => {
        if (!lock) {
          reject(
            new Error(
              'Another tab is using the saved run. Stop that analysis or close its tab first.'
            )
          );
          return;
        }
        await new Promise((release) =>
          resolve(() => {
            release();
            releasingLock = request;
            return request;
          })
        );
      })
      .catch(reject);
  });
}
export async function deleteCheckpoint(id) {
  const release = await acquireCheckpointLock();
  try {
    await transaction(STORES, 'readwrite', (tx, done, fail, guard) => {
      const request = tx.objectStore('run').get('current');
      request.onsuccess = guard(() => {
        if (request.result && request.result.id !== id) {
          fail(new Error('The saved run changed. Refresh before deleting it.'));
          return;
        }
        for (const name of STORES) tx.objectStore(name).clear();
        done(null);
      });
    });
  } finally {
    await release();
  }
}
export async function openCheckpoint(input, engine, resumeId) {
  const engineDigest = await digest(engine);
  const inputDigest = await digest(input);
  let meta;
  if (resumeId) {
    meta = await readCheckpointSummary();
    checkRun(meta, resumeId);
    if (meta.engineDigest !== engineDigest)
      throw new Error(
        'This saved run uses a different analysis engine. Its data is retained, but it cannot resume with this release. Delete the saved run to start again.'
      );
    if (meta.inputDigest !== inputDigest)
      throw new Error(
        'Saved inputs or analysis settings do not match this run.'
      );
  } else {
    meta = {
      format: 1,
      id: crypto.randomUUID(),
      engineDigest,
      inputDigest,
      inputCount: input.files.length,
      inputBytes: input.files.reduce((sum, f) => sum + f.bytes.byteLength, 0),
      descriptors: 0,
      alignments: 0,
      status: 'incomplete',
      updatedAt: Date.now(),
    };
    await transaction(STORES, 'readwrite', (tx, done, fail, guard) => {
      const request = tx.objectStore('run').get('current');
      request.onsuccess = guard(() => {
        if (request.result?.status === 'incomplete') {
          fail(
            new Error(
              'A saved run is waiting. Resume or delete it before saving a new run.'
            )
          );
          return;
        }
        for (const name of STORES) tx.objectStore(name).clear();
        tx.objectStore('run').put(meta, 'current');
        tx.objectStore('inputs').put(
          { runId: meta.id, payload: input, digest: inputDigest },
          'current'
        );
        done(meta);
      });
    });
  }
  const id = meta.id;
  return {
    meta,
    async keys(store) {
      return transaction([store], 'readonly', (tx, done) => {
        const request = tx.objectStore(store).getAllKeys();
        request.onsuccess = () => done(request.result);
      });
    },
    async get(store, key) {
      return verified(await read(store, key), id);
    },
    async put(store, key, payload) {
      const sealed = { runId: id, payload, digest: await digest(payload) };
      return transaction(
        ['run', store],
        'readwrite',
        (tx, done, fail, guard) => {
          const current = tx.objectStore('run').get('current');
          current.onsuccess = guard(() => {
            try {
              checkRun(current.result, id);
            } catch (error) {
              fail(error);
              return;
            }
            const previous = tx.objectStore(store).getKey(key);
            previous.onsuccess = guard(() => {
              const updated = { ...current.result, updatedAt: Date.now() };
              if (
                previous.result === undefined &&
                (store === 'descriptors' || store === 'alignments')
              )
                updated[store]++;
              if (store === 'completion') updated.status = 'complete';
              tx.objectStore(store).put(sealed, key);
              tx.objectStore('run').put(updated, 'current');
              done(updated);
            });
          });
        }
      );
    },
  };
}
