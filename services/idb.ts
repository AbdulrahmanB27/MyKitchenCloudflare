
import { Recipe, AppSettings, ShoppingItem, MealPlan, SyncQueueItem } from '../types';
import { DB_NAME, DB_VERSION, STORE_RECIPES, STORE_SHOPPING, STORE_PLANS, STORE_SETTINGS } from '../constants';

const STORE_SYNC_QUEUE = 'sync_queue';

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION + 1); // Bump version for new stores if needed

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(STORE_RECIPES)) db.createObjectStore(STORE_RECIPES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_SHOPPING)) db.createObjectStore(STORE_SHOPPING, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_PLANS)) db.createObjectStore(STORE_PLANS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) db.createObjectStore(STORE_SETTINGS, { keyPath: 'id' }); // Settings uses 'id' usually 'app-settings'
      if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) db.createObjectStore(STORE_SYNC_QUEUE, { keyPath: 'id' });
    };
  });
};

const getStore = async (storeName: string, mode: IDBTransactionMode) => {
  const db = await initDB();
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
};

// Generic Helpers
export const getAll = async <T>(storeName: string): Promise<T[]> => {
  const store = await getStore(storeName, 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export const getOne = async <T>(storeName: string, id: string): Promise<T | undefined> => {
    const store = await getStore(storeName, 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
};

export const put = async <T>(storeName: string, item: T): Promise<void> => {
  const store = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

export const remove = async (storeName: string, id: string): Promise<void> => {
  const store = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
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
