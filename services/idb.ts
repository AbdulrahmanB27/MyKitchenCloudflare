
import { Recipe, AppSettings, ShoppingItem, MealPlan, SyncQueueItem, Restaurant } from '../types';
import { DB_NAME, DB_VERSION, STORE_RECIPES, STORE_SHOPPING, STORE_PLANS, STORE_SETTINGS, STORE_RESTAURANTS, STORE_REVIEWS } from '../constants';

const STORE_SYNC_QUEUE = 'sync_queue';

// In-memory fallback
const memoryDB: Record<string, Map<string, any>> = {
    [STORE_RECIPES]: new Map(),
    [STORE_SHOPPING]: new Map(),
    [STORE_PLANS]: new Map(),
    [STORE_SETTINGS]: new Map(),
    [STORE_RESTAURANTS]: new Map(),
    [STORE_REVIEWS]: new Map(),
    [STORE_SYNC_QUEUE]: new Map(),
};

// Flag to disable IDB attempts after first failure to reduce noise/lag
let isIdbSupported = true;

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (!isIdbSupported) return reject(new Error("IDB disabled"));

    try {
        if (typeof indexedDB === 'undefined') {
            throw new Error("IndexedDB not found");
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.warn("IndexedDB open failed (fallback to memory):", request.error);
            isIdbSupported = false;
            reject(request.error); 
        };

        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            
            const createStore = (name: string) => {
                if (!db.objectStoreNames.contains(name)) {
                    db.createObjectStore(name, { keyPath: 'id' });
                }
            };
            
            createStore(STORE_RECIPES);
            createStore(STORE_SHOPPING);
            createStore(STORE_PLANS);
            createStore(STORE_SETTINGS);
            createStore(STORE_SYNC_QUEUE);
            createStore(STORE_RESTAURANTS);
            
            if (!db.objectStoreNames.contains(STORE_REVIEWS)) {
                const reviewStore = db.createObjectStore(STORE_REVIEWS, { keyPath: 'id' });
                reviewStore.createIndex('targetId', 'targetId', { unique: false });
            }
        };
    } catch (e) {
        console.warn("IndexedDB open threw error (fallback to memory):", e);
        isIdbSupported = false;
        reject(e);
    }
  });
};

const getStore = async (storeName: string, mode: IDBTransactionMode): Promise<IDBObjectStore | null> => {
  try {
      const db = await initDB();
      const tx = db.transaction(storeName, mode);
      return tx.objectStore(storeName);
  } catch (e) {
      return null;
  }
};

// Generic Helpers
export const getAll = async <T>(storeName: string): Promise<T[]> => {
  const store = await getStore(storeName, 'readonly');
  if (!store) {
      return Array.from(memoryDB[storeName]?.values() || []) as T[];
  }
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export const getOne = async <T>(storeName: string, id: string): Promise<T | undefined> => {
    const store = await getStore(storeName, 'readonly');
    if (!store) {
        return memoryDB[storeName]?.get(id) as T | undefined;
    }
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
};

export const getAllByIndex = async <T>(storeName: string, indexName: string, value: any): Promise<T[]> => {
  const store = await getStore(storeName, 'readonly');
  if (!store) {
      // Memory fallback: filter manually
      const all = Array.from(memoryDB[storeName]?.values() || []) as any[];
      return all.filter(item => item[indexName] === value) as T[];
  }
  return new Promise((resolve, reject) => {
    const index = store.index(indexName);
    const req = index.getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export const put = async <T>(storeName: string, item: T): Promise<void> => {
  const store = await getStore(storeName, 'readwrite');
  if (!store) {
      // Assuming item has 'id' because schema uses keyPath 'id'
      const id = (item as any).id;
      if (id && memoryDB[storeName]) {
          memoryDB[storeName].set(id, item);
      }
      return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

export const remove = async (storeName: string, id: string): Promise<void> => {
  const store = await getStore(storeName, 'readwrite');
  if (!store) {
      memoryDB[storeName]?.delete(id);
      return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

export const clearAllStores = async (): Promise<void> => {
    try {
        const db = await initDB();
        const stores = [STORE_RECIPES, STORE_SHOPPING, STORE_PLANS, STORE_RESTAURANTS, STORE_SYNC_QUEUE, STORE_SETTINGS];
        const tx = db.transaction(stores, 'readwrite');
        stores.forEach(s => tx.objectStore(s).clear());
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject();
        });
    } catch(e) {
        Object.keys(memoryDB).forEach(k => memoryDB[k].clear());
        return Promise.resolve();
    }
};

// Specific Sync Queue Logic
export const addToSyncQueue = async (item: SyncQueueItem) => {
    await put(STORE_SYNC_QUEUE, item);
};

export const getSyncQueue = async (): Promise<SyncQueueItem[]> => {
    return getAll(STORE_SYNC_QUEUE);
};

export const removeFromSyncQueue = async (id: string) => {
    await remove(STORE_SYNC_QUEUE, id);
};
