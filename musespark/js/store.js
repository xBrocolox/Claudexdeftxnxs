// MuseSpark: song + take storage in IndexedDB (audio blobs included). Falls back to memory if IndexedDB is unavailable.
//
// Song: { id, title, artist, style, lyricsRaw, lines: [{ t, text, section, words: [{ w, t, e }] }],
//         audio, instrumental, vocals, cover, intro (Blobs or null), duration, created, updated }
// Take: { id, songId, blob, score, created }

const DB = (() => {
  let db = null;
  const mem = { songs: new Map(), takes: new Map() };

  function open() {
    return new Promise((resolve) => {
      let req;
      try { req = indexedDB.open('musespark', 1); } catch (e) { resolve(); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore('songs', { keyPath: 'id' });
        d.createObjectStore('takes', { keyPath: 'id' }).createIndex('songId', 'songId');
      };
      req.onsuccess = () => { db = req.result; resolve(); };
      req.onerror = () => { console.warn('IndexedDB unavailable, using memory', req.error); resolve(); };
    });
  }

  function run(store, mode, fn) {
    if (!db) return Promise.resolve(fn(null));
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  const put = (store, obj) => db ? run(store, 'readwrite', s => s.put(obj)) : (mem[store].set(obj.id, obj), Promise.resolve());
  const get = (store, id) => db ? run(store, 'readonly', s => s.get(id)) : Promise.resolve(mem[store].get(id));
  const all = (store) => db ? run(store, 'readonly', s => s.getAll()) : Promise.resolve([...mem[store].values()]);
  const del = (store, id) => db ? run(store, 'readwrite', s => s.delete(id)) : (mem[store].delete(id), Promise.resolve());

  async function songs() { return (await all('songs')).sort((a, b) => b.updated - a.updated); }
  async function saveSong(song) { song.updated = Date.now(); await put('songs', song); return song; }
  async function deleteSong(id) {
    for (const t of await takesFor(id)) await del('takes', t.id);
    await del('songs', id);
  }
  async function takesFor(songId) {
    if (!db) return [...mem.takes.values()].filter(t => t.songId === songId);
    const list = await run('takes', 'readonly', s => s.index('songId').getAll(songId));
    return list.sort((a, b) => b.created - a.created);
  }
  async function wipe() {
    for (const s of await all('songs')) await del('songs', s.id);
    for (const t of await all('takes')) await del('takes', t.id);
  }
  async function estimate() {
    try { const e = await navigator.storage.estimate(); return e; } catch (e) { return null; }
  }

  return {
    open, songs, saveSong, deleteSong, takesFor, wipe, estimate,
    song: (id) => get('songs', id),
    saveTake: (t) => put('takes', t),
    deleteTake: (id) => del('takes', id),
    get persistent() { return !!db; },
  };
})();
