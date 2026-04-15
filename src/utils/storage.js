import {
  DB_NAME,
  DB_VERSION,
  LARGE_STORAGE_KEY,
  STORE_NAME,
  STORAGE_KEY,
  STORAGE_MODE_KEY,
} from "./constants";

export function openAppDb() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("تعذر فتح قاعدة البيانات المحلية"));
  });
}

export async function saveStateToIndexedDb(key, value) {
  const db = await openAppDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("تعذر حفظ البيانات الكبيرة"));
    tx.onabort = () => reject(tx.error || new Error("تم إلغاء حفظ البيانات الكبيرة"));
  });
  db.close();
}

export async function loadStateFromIndexedDb(key) {
  const db = await openAppDb();
  const result = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("تعذر قراءة البيانات الكبيرة"));
  });
  db.close();
  return result;
}

export async function removeStateFromIndexedDb(key) {
  const db = await openAppDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("تعذر حذف البيانات الكبيرة"));
    tx.onabort = () => reject(tx.error || new Error("تم إلغاء حذف البيانات الكبيرة"));
  });
  db.close();
}

export async function loadSavedSessionFromStorage() {
  const mode = localStorage.getItem(STORAGE_MODE_KEY) || "localStorage";
  let saved = null;

  if (mode === "indexedDB") {
    saved = await loadStateFromIndexedDb(LARGE_STORAGE_KEY);
  } else {
    const raw = localStorage.getItem(STORAGE_KEY);
    saved = raw ? JSON.parse(raw) : null;
  }

  return { mode, saved };
}

export async function persistSessionToStorage(data) {
  const serialized = JSON.stringify(data);

  try {
    localStorage.setItem(STORAGE_KEY, serialized);
    localStorage.setItem(STORAGE_MODE_KEY, "localStorage");
    await removeStateFromIndexedDb(LARGE_STORAGE_KEY).catch(() => {});
    return "localStorage";
  } catch {
    await saveStateToIndexedDb(LARGE_STORAGE_KEY, data);
    localStorage.setItem(STORAGE_MODE_KEY, "indexedDB");
    localStorage.removeItem(STORAGE_KEY);
    return "indexedDB";
  }
}

export async function clearSavedStateFromStorage() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_MODE_KEY);
  await removeStateFromIndexedDb(LARGE_STORAGE_KEY).catch(() => {});
}
