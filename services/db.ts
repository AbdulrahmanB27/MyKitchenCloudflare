
import { Recipe, AppSettings, ShoppingItem, MealPlan, SyncQueueItem } from '../types';
import { config } from '../config';
import * as idb from './idb';
import { STORE_RECIPES, STORE_SHOPPING, STORE_PLANS, STORE_SETTINGS } from '../constants';

const API_BASE = '/api';

// --- Auth State ---
let authCallback: (() => void) | null = null;
export const setAuthCallback = (cb: () => void) => { authCallback = cb; };

const getAuthToken = () => localStorage.getItem('family_auth_token');
export const setAuthToken = (token: string) => localStorage.setItem('family_auth_token', token);
export const hasAuthToken = () => !!getAuthToken();

// --- Sync State ---
const SYNC_KEY_LAST_UPDATED = 'sync_last_updated_at';

export const authenticate = async (password: string, turnstileToken: string): Promise<boolean> => {
    try {
        const res = await fetch(`${API_BASE}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, turnstileToken })
        });
        if (res.ok) {
            const data = await res.json();
            if (data.token) {
                setAuthToken(data.token);
                return true;
            }
        }
        return false;
    } catch (e) {
        console.error("Auth failed", e);
        return false;
    }
};

// --- Images (R2) ---

export const uploadImage = async (file: Blob): Promise<string> => {
    if (!hasAuthToken()) {
        if (authCallback) authCallback();
        throw new Error("Authentication required to upload images");
    }

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/images`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${getAuthToken()}`
        },
        body: formData
    });

    if (!res.ok) {
        throw new Error("Image upload failed");
    }

    const data = await res.json();
    return data.url;
};


// --- Recipes (IndexedDB + Sync) ---

export const getAllRecipes = async (): Promise<Recipe[]> => {
    // 1. Load from IDB (Fast, Offline-First)
    let recipes = await idb.getAll<Recipe>(STORE_RECIPES);

    // 2. Trigger Sync in background to fetch latest from Cloudflare
    // We do this EVERY time to ensure fresh data, especially after clearing cookies.
    const settings = await getSettings();
    if (navigator.onLine && settings.autoSync !== false) {
        // If we have 0 recipes, we might have just cleared cookies.
        // Sync immediately to restore from D1.
        syncRecipes().catch(console.error);
    }

    return recipes;
};

export const getRecipe = async (id: string): Promise<Recipe | undefined> => {
    return idb.getOne<Recipe>(STORE_RECIPES, id);
};

export const upsertRecipe = async (recipe: Recipe): Promise<void> => {
    // 1. Save to IDB
    await idb.put(STORE_RECIPES, recipe);

    // 2. Queue for Sync (if shared)
    if (recipe.shareToFamily) {
        await idb.addToSyncQueue({
            id: recipe.id,
            action: 'upsert',
            data: recipe,
            timestamp: Date.now()
        });
        
        // 3. Try Sync
        const settings = await getSettings();
        if (navigator.onLine && settings.autoSync !== false) {
            syncRecipes();
        }
    }
};

export const deleteRecipe = async (id: string): Promise<void> => {
    // 1. Delete from IDB
    await idb.remove(STORE_RECIPES, id);

    // 2. Queue Delete
    await idb.addToSyncQueue({
        id,
        action: 'delete',
        timestamp: Date.now()
    });

    // 3. Try Sync
    const settings = await getSettings();
    if (navigator.onLine && settings.autoSync !== false) {
        syncRecipes();
    }
};

// --- SYNC ENGINE ---

const syncRecipes = async () => {
    // 1. Pull Incoming Changes (Cloudflare D1 -> Local IDB)
    try {
        // If we have no recipes locally, reset the lastUpdated timestamp to 0 
        // to force a full fetch from the server.
        const localRecipes = await idb.getAll(STORE_RECIPES);
        let lastUpdated = localStorage.getItem(SYNC_KEY_LAST_UPDATED) || '0';
        if (localRecipes.length === 0) lastUpdated = '0';

        const res = await fetch(`${API_BASE}/recipes?since=${lastUpdated}`);
        if (res.ok) {
            const updates: Recipe[] = await res.json();
            if (updates.length > 0) {
                let maxTs = parseInt(lastUpdated);
                for (const r of updates) {
                    await idb.put(STORE_RECIPES, r);
                    if (r.updatedAt > maxTs) maxTs = r.updatedAt;
                }
                localStorage.setItem(SYNC_KEY_LAST_UPDATED, maxTs.toString());
                
                // Notify UI to re-render
                window.dispatchEvent(new Event('recipes-updated'));
            }
        }
    } catch (e) {
        console.warn("Pull sync failed", e);
    }

    // 2. Process Outgoing Queue (Local IDB -> Cloudflare D1)
    const queue = await idb.getSyncQueue();
    if (queue.length > 0) {
        // We only try to push if we have an auth token. 
        // If not, trigger the auth modal so the user can log in and sync their changes.
        if (!hasAuthToken()) {
            if (authCallback) authCallback();
            return;
        }

        for (const item of queue) {
            try {
                const token = getAuthToken();
                let res;
                if (item.action === 'upsert' && item.data) {
                    res = await fetch(`${API_BASE}/recipes`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(item.data)
                    });
                } else if (item.action === 'delete') {
                    res = await fetch(`${API_BASE}/recipes?id=${item.id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                }

                if (res && res.ok) {
                    await idb.removeFromSyncQueue(item.id);
                } else if (res && (res.status === 401 || res.status === 403)) {
                    // Auth failed - Token might be expired
                    localStorage.removeItem('family_auth_token');
                    if (authCallback) authCallback(); // Prompt user to log in again
                    return; // Stop processing queue until re-auth
                }
            } catch (e) {
                console.error("Sync item failed", e);
            }
        }
    }
};


// --- Shopping List (Local Only) ---

export const getShoppingList = async (): Promise<ShoppingItem[]> => {
    return idb.getAll(STORE_SHOPPING);
};

export const upsertShoppingItem = async (item: ShoppingItem): Promise<void> => {
    await idb.put(STORE_SHOPPING, item);
};

export const deleteShoppingItem = async (id: string): Promise<void> => {
    await idb.remove(STORE_SHOPPING, id);
};

export const clearShoppingList = async (onlyChecked: boolean = false): Promise<void> => {
    const items = await getShoppingList();
    if (onlyChecked) {
        for (const item of items) {
            if (item.isChecked) await idb.remove(STORE_SHOPPING, item.id);
        }
    } else {
        for (const item of items) {
            await idb.remove(STORE_SHOPPING, item.id);
        }
    }
};

// --- Meal Plans (Local Only) ---

export const getMealPlans = async (): Promise<MealPlan[]> => {
    return idb.getAll(STORE_PLANS);
};

export const upsertMealPlan = async (plan: MealPlan): Promise<void> => {
    await idb.put(STORE_PLANS, plan);
};

export const deleteMealPlan = async (id: string): Promise<void> => {
    await idb.remove(STORE_PLANS, id);
};

// --- Settings ---

export const getSettings = async (): Promise<AppSettings> => {
  const s = await idb.getOne<AppSettings>(STORE_SETTINGS, 'app-settings');
  return s || { theme: 'system', autoSync: true };
};

export const saveSettings = async (settings: AppSettings): Promise<void> => {
  await idb.put(STORE_SETTINGS, { ...settings, id: 'app-settings' });
};
