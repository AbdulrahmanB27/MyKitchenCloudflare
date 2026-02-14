
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
        const res = await fetch(`${API_BASE}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, turnstileToken })
        });
        
        // Handle 404 specifically to help debug dev environment issues
        if (res.status === 404) {
            console.error("API endpoint not found (404).");
            return { success: false, error: 'API not found. Ensure backend is running (npx wrangler dev).' };
        }

        // Safely handle the response, even if it's empty or HTML error page
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
        return { success: false, error: e.message || 'Network error occurred' };
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
        syncShoppingList().catch(console.error); // Also sync shopping list
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

    // 3. Try Sync (Manual Mode)
    const settings = await getSettings();
    if (navigator.onLine && settings.autoSync !== false) {
        syncRecipes('manual');
    }
};

// --- Shopping List (Sync Enabled) ---

export const getShoppingList = async (): Promise<ShoppingItem[]> => {
    const items = await idb.getAll<ShoppingItem>(STORE_SHOPPING);
    
    // Trigger background sync on load
    if (navigator.onLine) syncShoppingList().catch(console.error);
    
    return items;
};

export const upsertShoppingItem = async (item: ShoppingItem): Promise<void> => {
    await idb.put(STORE_SHOPPING, item);
    
    // Always attempt to sync shopping list items if logged in, but don't force auth modal
    // Shopping list is treated as "Sync if possible, otherwise Local"
    if (navigator.onLine && hasAuthToken()) {
       fetch(`${API_BASE}/shopping`, {
           method: 'POST',
           headers: { 
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${getAuthToken()}`
           },
           body: JSON.stringify(item)
       }).catch(console.warn);
    }
};

export const deleteShoppingItem = async (id: string): Promise<void> => {
    await idb.remove(STORE_SHOPPING, id);
    if (navigator.onLine && hasAuthToken()) {
        fetch(`${API_BASE}/shopping?id=${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        }).catch(console.warn);
    }
};

export const clearShoppingList = async (onlyChecked: boolean = false): Promise<void> => {
    const items = await getShoppingList();
    const idsToDelete: string[] = [];

    if (onlyChecked) {
        for (const item of items) {
            if (item.isChecked) {
                await idb.remove(STORE_SHOPPING, item.id);
                idsToDelete.push(item.id);
            }
        }
    } else {
        for (const item of items) {
            await idb.remove(STORE_SHOPPING, item.id);
            idsToDelete.push(item.id);
        }
    }

    if (navigator.onLine && hasAuthToken()) {
        const query = onlyChecked ? 'clearAll=checked' : 'clearAll=true';
        fetch(`${API_BASE}/shopping?${query}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        }).catch(console.warn);
    }
};

// --- SYNC ENGINE ---

export const getSyncQueue = async () => {
    return idb.getSyncQueue();
};

// Exposed for AuthModal to trigger after successful login
export const retrySync = () => {
    syncRecipes('manual');
    syncShoppingList();
};

// Simple Shopping List Sync (Last Write Wins, no queue for simplicity, relies on load to fetch)
const syncShoppingList = async () => {
    if (!hasAuthToken()) return;
    try {
        const res = await fetch(`${API_BASE}/shopping`, {
             headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        if (res.ok) {
            const serverItems: ShoppingItem[] = await res.json();
            // Merge strategy: Overwrite local with server for simplicity in this context
            if (serverItems.length > 0) {
                 for (const item of serverItems) {
                     await idb.put(STORE_SHOPPING, item);
                 }
            }
        }
    } catch(e) { console.warn("Shopping sync failed", e); }
};

const syncRecipes = async (mode: 'auto' | 'manual' = 'auto') => {
    // 1. Pull Incoming Changes (Cloudflare D1 -> Local IDB)
    try {
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
        if (!hasAuthToken()) {
            // ONLY prompt the user if this is a MANUAL sync attempt (user just saved something)
            // If it's AUTO (background load), stay silent and keep items in queue.
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
                } else if (res && (res.status === 401 || res.status === 403)) {
                    // Auth failed - Token might be expired
                    localStorage.removeItem('family_auth_token');
                    if (mode === 'manual' && authCallback) authCallback(); // Re-prompt only if manual
                    return; // Stop processing queue until re-auth
                }
            } catch (e) {
                console.error("Sync item failed", e);
            }
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
