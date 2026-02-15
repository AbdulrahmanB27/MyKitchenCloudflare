
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

// Return object with success status and optional error message
export const authenticate = async (password: string, turnstileToken: string): Promise<{ success: boolean; error?: string }> => {
    try {
        console.log(`Authenticating against ${API_BASE}/auth...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

        const res = await fetch(`${API_BASE}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, turnstileToken }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (res.status === 404) {
            console.error("API endpoint not found (404).");
            return { success: false, error: 'API not found. Ensure backend is running (npx wrangler dev).' };
        }

        const text = await res.text();
        
        let data;
        try {
            data = text ? JSON.parse(text) : {};
        } catch (e) {
            console.error("Auth response was not JSON:", text);
            return { success: false, error: `Server Error (${res.status}): Non-JSON response.` };
        }
        
        if (res.ok && data.token) {
            setAuthToken(data.token);
            return { success: true };
        } else {
            return { success: false, error: data.error || `Authentication failed (${res.status})` };
        }
    } catch (e: any) {
        console.error("Auth network error", e);
        return { success: false, error: e.name === 'AbortError' ? 'Request timed out' : (e.message || 'Network error occurred') };
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

    // 2. Trigger Sync in background (Silent Auto Mode)
    const settings = await getSettings();
    if (navigator.onLine && settings.autoSync !== false) {
        syncRecipes('auto').catch(console.error);
    }

    return recipes;
};

export const getRecipe = async (id: string): Promise<Recipe | undefined> => {
    return idb.getOne<Recipe>(STORE_RECIPES, id);
};

export const upsertRecipe = async (recipe: Recipe, options?: { localOnly?: boolean }): Promise<void> => {
    // 1. Save to IDB
    await idb.put(STORE_RECIPES, recipe);

    // 2. Queue for Sync (if shared and NOT localOnly)
    if (recipe.shareToFamily && !options?.localOnly) {
        await idb.addToSyncQueue({
            id: recipe.id,
            action: 'upsert',
            data: recipe,
            timestamp: Date.now()
        });
        
        // Update UI immediately to show pending state
        window.dispatchEvent(new Event('recipes-updated'));

        // 3. Try Sync (Manual Mode - Trigger Prompt if needed)
        const settings = await getSettings();
        if (navigator.onLine && settings.autoSync !== false) {
            syncRecipes('manual');
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

    window.dispatchEvent(new Event('recipes-updated'));

    // 3. Try Sync (Manual Mode)
    const settings = await getSettings();
    if (navigator.onLine && settings.autoSync !== false) {
        syncRecipes('manual');
    }
};

// --- Shopping List (Local Only) ---

export const getShoppingList = async (): Promise<ShoppingItem[]> => {
    return idb.getAll<ShoppingItem>(STORE_SHOPPING);
};

export const upsertShoppingItem = async (item: ShoppingItem): Promise<void> => {
    await idb.put(STORE_SHOPPING, item);
};

export const deleteShoppingItem = async (id: string): Promise<void> => {
    await idb.remove(STORE_SHOPPING, id);
};

export const clearShoppingList = async (onlyChecked: boolean = false): Promise<void> => {
    const items = await getShoppingList();
    for (const item of items) {
        if (!onlyChecked || item.isChecked) {
            await idb.remove(STORE_SHOPPING, item.id);
        }
    }
};

// --- SYNC ENGINE ---

export const getSyncQueue = async () => {
    return idb.getSyncQueue();
};

export const retrySync = () => {
    syncRecipes('manual');
};

const syncRecipes = async (mode: 'auto' | 'manual' = 'auto') => {
    let hasChanges = false;
    
    // 1. Pull Incoming Changes
    try {
        const localRecipes = await idb.getAll<Recipe>(STORE_RECIPES);
        let lastUpdated = localStorage.getItem(SYNC_KEY_LAST_UPDATED) || '0';
        if (localRecipes.length === 0) lastUpdated = '0';

        const res = await fetch(`${API_BASE}/recipes?since=${lastUpdated}`);
        if (res.ok) {
            const updates: Recipe[] = await res.json();
            if (updates.length > 0) {
                let maxTs = parseInt(lastUpdated);
                for (const r of updates) {
                    if (r.deleted) {
                        // Handle Soft Delete: Remove from local DB
                        await idb.remove(STORE_RECIPES, r.id);
                    } else {
                        // Handle Update/Insert - PRESERVE LOCAL FAVORITE STATUS
                        const existing = await idb.getOne<Recipe>(STORE_RECIPES, r.id);
                        if (existing) {
                            r.favorite = existing.favorite; // Keep local favorite preference
                        } else {
                            r.favorite = false; // Default for new
                        }
                        await idb.put(STORE_RECIPES, r);
                    }
                    if (r.updatedAt > maxTs) maxTs = r.updatedAt;
                }
                localStorage.setItem(SYNC_KEY_LAST_UPDATED, maxTs.toString());
                hasChanges = true;
            }
        }
    } catch (e) {
        console.warn("Pull sync failed", e);
    }

    // 2. Process Outgoing Queue
    const queue = await idb.getSyncQueue();
    if (queue.length > 0) {
        if (!hasAuthToken()) {
            if (mode === 'manual' && authCallback) {
                authCallback();
            }
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
                    hasChanges = true; // Queue size changed, update UI
                } else if (res && (res.status === 401 || res.status === 403)) {
                    localStorage.removeItem('family_auth_token');
                    if (mode === 'manual' && authCallback) authCallback();
                    break;
                }
            } catch (e) {
                console.error("Sync item failed", e);
            }
        }
    }

    if (hasChanges) {
        window.dispatchEvent(new Event('recipes-updated'));
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
