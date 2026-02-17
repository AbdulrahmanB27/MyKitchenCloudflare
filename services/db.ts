
import { Recipe, AppSettings, ShoppingItem, MealPlan, SyncQueueItem, Restaurant, VoteSession, Vote } from '../types';
import * as idb from './idb';
import { STORE_RECIPES, STORE_SHOPPING, STORE_PLANS, STORE_SETTINGS, STORE_RESTAURANTS, ENABLE_RESTAURANTS } from '../constants';
import { v4 as uuidv4 } from 'uuid';

const API_BASE = '/api';
const STORAGE_KEY_TOKEN = 'family_auth_token';
const STORAGE_KEY_SESSIONS = 'family_sessions';
const STORAGE_KEY_DEVICE_ID = 'device_id';
const STORAGE_KEY_FAMILY_ID = 'current_family_id';
const STORAGE_KEY_FAMILY_NAME = 'current_family_name';

// --- Safe Storage Helpers ---
// Fallback to memory if localStorage is blocked (e.g. SecurityError in private browsing)
const memoryStorage: Record<string, string> = {};
let isLocalStorageAvailable = false;

try {
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    isLocalStorageAvailable = true;
} catch (e) {
    console.warn("LocalStorage unavailable, using memory fallback", e);
    isLocalStorageAvailable = false;
}

export const safeGetItem = (key: string): string | null => {
    if (!isLocalStorageAvailable) return memoryStorage[key] || null;
    try {
        return window.localStorage.getItem(key);
    } catch (e) {
        return memoryStorage[key] || null;
    }
};

export const safeSetItem = (key: string, value: string): void => {
    if (!isLocalStorageAvailable) {
        memoryStorage[key] = value;
        return;
    }
    try {
        window.localStorage.setItem(key, value);
    } catch (e) {
        memoryStorage[key] = value;
    }
};

export const safeRemoveItem = (key: string): void => {
    if (!isLocalStorageAvailable) {
        delete memoryStorage[key];
        return;
    }
    try {
        window.localStorage.removeItem(key);
    } catch (e) {
        delete memoryStorage[key];
    }
};

export const safeClear = (): void => {
    try {
        if (isLocalStorageAvailable) window.localStorage.clear();
    } catch (e) {
        // ignore
    }
    for (const k in memoryStorage) delete memoryStorage[k];
};

// --- Auth & Session State ---

export const getDeviceId = (): string => {
    let id = safeGetItem(STORAGE_KEY_DEVICE_ID);
    if (!id) {
        id = uuidv4();
        safeSetItem(STORAGE_KEY_DEVICE_ID, id);
    }
    return id;
};

export const hasAuthToken = (): boolean => {
    return !!safeGetItem(STORAGE_KEY_TOKEN);
};

export const getCurrentFamilyId = (): string | null => {
    return safeGetItem(STORAGE_KEY_FAMILY_ID);
};

export const getCurrentFamilyName = (): string => {
    return safeGetItem(STORAGE_KEY_FAMILY_NAME) || 'My Kitchen';
};

export const getPinnedFamilyId = (): string | null => {
    // For now, same as current
    return getCurrentFamilyId();
};

export const getSavedSessions = (): { id: string, name: string, token: string }[] => {
    try {
        return JSON.parse(safeGetItem(STORAGE_KEY_SESSIONS) || '[]');
    } catch { return []; }
};

let authCallback: (() => void) | null = null;
export const setAuthCallback = (cb: () => void) => {
    authCallback = cb;
};

// --- API Helper ---

export const apiCall = async (endpoint: string, method: string = 'GET', body?: any, options?: { skipAuthRedirect?: boolean }) => {
    const token = safeGetItem(STORAGE_KEY_TOKEN);
    const headers: HeadersInit = {
        'Content-Type': 'application/json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout to prevent stuck loading

    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.status === 401) {
            // Token expired or invalid
            // If it's a background request (skipAuthRedirect), we just clear the invalid token and fail silently.
            safeRemoveItem(STORAGE_KEY_TOKEN);
            
            if (!options?.skipAuthRedirect && authCallback) {
                authCallback();
            }
            const err: any = new Error("Unauthorized");
            err.status = 401;
            throw err;
        }

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Unknown error' }));
            const error: any = new Error(err.error || res.statusText);
            error.status = res.status;
            throw error;
        }

        if (res.status === 204) return null;
        return res.json();
    } catch (e: any) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
             throw new Error("Request timed out");
        }
        throw e;
    }
};

// --- Sync Logic (Simplified) ---

export const retrySync = async () => {
    if (!navigator.onLine || !hasAuthToken()) return;
    
    const queue = await idb.getSyncQueue();
    if (queue.length === 0) return;

    for (const item of queue) {
        try {
            // Sync actions should generally be silent if they fail auth, 
            // as they run in background.
            const opts = { skipAuthRedirect: true };
            if (item.store === STORE_RECIPES) {
                if (item.action === 'upsert') await apiCall('/recipes', 'POST', item.data, opts);
                if (item.action === 'delete') await apiCall(`/recipes?id=${item.id}`, 'DELETE', undefined, opts);
            } else if (item.store === STORE_SHOPPING) {
                if (item.action === 'upsert') await apiCall('/shopping', 'POST', item.data, opts);
                if (item.action === 'delete') await apiCall(`/shopping?id=${item.id}`, 'DELETE', undefined, opts);
            }
            // ... handle other stores
            await idb.removeFromSyncQueue(item.id);
        } catch (e: any) {
            console.error("Sync failed for item", item, e);
            // If the error is a client-side error (4xx) but NOT 401 (auth issue),
            // it means the data is likely bad or invalid (e.g. 400 Bad Request, 404 Not Found).
            // We should remove it from the queue so it doesn't block future syncs forever.
            if (e.status && e.status >= 400 && e.status < 500 && e.status !== 401) {
                console.warn(`Removing invalid item ${item.id} from queue (Status: ${e.status})`);
                await idb.removeFromSyncQueue(item.id);
            }
        }
    }
    // Trigger refresh
    window.dispatchEvent(new Event('recipes-updated'));
};

// --- Recipes ---

export const getAllRecipes = async (): Promise<Recipe[]> => {
    const local = await idb.getAll<Recipe>(STORE_RECIPES);
    
    // Background sync if online
    if (hasAuthToken() && navigator.onLine) {
        apiCall('/recipes', 'GET', undefined, { skipAuthRedirect: true }).then(async (remote: Recipe[]) => {
            for (const r of remote) {
                await idb.put(STORE_RECIPES, r);
            }
            window.dispatchEvent(new Event('recipes-updated'));
        }).catch(() => {});
    }
    return local;
};

export const getRecipe = async (id: string): Promise<Recipe | undefined> => {
    return idb.getOne<Recipe>(STORE_RECIPES, id);
};

export const upsertRecipe = async (recipe: Recipe, options?: { localOnly?: boolean }) => {
    // If sharing to family, tag with current family ID locally immediately so it shows up in "Family" tab
    const currentFamilyId = getCurrentFamilyId();
    if (recipe.shareToFamily && currentFamilyId && !options?.localOnly) {
        recipe.familyId = currentFamilyId;
    }

    await idb.put(STORE_RECIPES, recipe);
    
    if (options?.localOnly) return; 

    if (hasAuthToken() && recipe.shareToFamily) {
        try {
            await apiCall('/recipes', 'POST', recipe);
        } catch (e) {
            // Queue for sync
            await idb.addToSyncQueue({ id: recipe.id, action: 'upsert', data: recipe, store: STORE_RECIPES, timestamp: Date.now() });
        }
    }
};

export const deleteRecipe = async (id: string) => {
    await idb.remove(STORE_RECIPES, id);
    if (hasAuthToken()) {
        try {
            await apiCall(`/recipes?id=${id}`, 'DELETE');
        } catch (e) {
            await idb.addToSyncQueue({ id, action: 'delete', store: STORE_RECIPES, timestamp: Date.now() });
        }
    }
};

export const crossPostRecipe = async (recipe: Recipe, targetFamilyId: string) => {
    const sessions = getSavedSessions();
    const targetSession = sessions.find(s => s.id === targetFamilyId);
    
    if (!targetSession) throw new Error("Not authenticated with target family");
    
    // Ensure the recipe is set to be shared
    const sharedRecipe = { ...recipe, shareToFamily: true, familyId: targetFamilyId };

    // Manual fetch with different token
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${targetSession.token}` };
    const res = await fetch(`${API_BASE}/recipes`, {
        method: 'POST',
        headers,
        body: JSON.stringify(sharedRecipe)
    });
    
    if (!res.ok) throw new Error("Failed to cross-post");
};

// --- Shopping ---

export const getShoppingList = async (): Promise<ShoppingItem[]> => {
    const local = await idb.getAll<ShoppingItem>(STORE_SHOPPING);
    if (hasAuthToken() && navigator.onLine) {
        apiCall('/shopping', 'GET', undefined, { skipAuthRedirect: true }).then(async (remote: ShoppingItem[]) => {
             for(const i of remote) await idb.put(STORE_SHOPPING, i);
        }).catch(() => {});
    }
    return local;
};

export const upsertShoppingItem = async (item: ShoppingItem) => {
    await idb.put(STORE_SHOPPING, item);
    if (hasAuthToken()) {
        apiCall('/shopping', 'POST', item).catch(() => {
             idb.addToSyncQueue({ id: item.id, action: 'upsert', data: item, store: STORE_SHOPPING, timestamp: Date.now() });
        });
    }
};

export const clearShoppingList = async (purchasedOnly: boolean) => {
    if (purchasedOnly) {
        const all = await idb.getAll<ShoppingItem>(STORE_SHOPPING);
        const toDelete = all.filter(i => i.isChecked);
        for(const item of toDelete) await idb.remove(STORE_SHOPPING, item.id);
        
        if (hasAuthToken()) {
            apiCall('/shopping?clearAll=checked', 'DELETE').catch(() => {});
        }
    } else {
        const all = await idb.getAll<ShoppingItem>(STORE_SHOPPING);
        for(const item of all) await idb.remove(STORE_SHOPPING, item.id);
        
        if (hasAuthToken()) {
            apiCall('/shopping?clearAll=true', 'DELETE').catch(() => {});
        }
    }
};

// --- Meal Plans ---

export const getMealPlans = async (): Promise<MealPlan[]> => {
    const local = await idb.getAll<MealPlan>(STORE_PLANS);
    if (hasAuthToken() && navigator.onLine) {
        apiCall('/plans', 'GET', undefined, { skipAuthRedirect: true }).then(async (remote: MealPlan[]) => {
            for(const p of remote) await idb.put(STORE_PLANS, p);
        }).catch(() => {});
    }
    return local;
};

export const upsertMealPlan = async (plan: MealPlan) => {
    await idb.put(STORE_PLANS, plan);
    if (hasAuthToken()) {
        apiCall('/plans', 'POST', plan).catch(console.error);
    }
};

export const deleteMealPlan = async (id: string) => {
    await idb.remove(STORE_PLANS, id);
    if (hasAuthToken()) {
        apiCall(`/plans?id=${id}`, 'DELETE').catch(console.error);
    }
};

// --- Settings ---

export const getSettings = async (): Promise<AppSettings> => {
    const s = await idb.getOne<AppSettings>(STORE_SETTINGS, 'config');
    return s || { theme: 'system', autoSync: true };
};

export const saveSettings = async (settings: AppSettings) => {
    await idb.put(STORE_SETTINGS, { id: 'config', ...settings });
};

export const getSyncQueue = async () => {
    return idb.getSyncQueue();
};

// --- Images ---

export const uploadImage = async (blob: Blob): Promise<string> => {
    const formData = new FormData();
    formData.append('file', blob);
    
    const token = safeGetItem(STORAGE_KEY_TOKEN);
    const headers: any = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const res = await fetch(`${API_BASE}/images`, {
        method: 'POST',
        headers,
        body: formData
    });
    
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return data.url;
};

// --- Auth ---

export const authenticate = async (familyName: string, password: string): Promise<{ success: boolean, error?: string }> => {
    try {
        const res = await apiCall('/auth/login', 'POST', { familyName, password });
        if (res.token) {
            handleLoginSuccess(res.token, res.familyId, res.name);
            return { success: true };
        }
        return { success: false, error: 'Invalid response' };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const registerFamily = async (familyName: string, password: string, adminPassword: string): Promise<{ success: boolean, error?: string }> => {
    try {
        const res = await apiCall('/auth/register', 'POST', { familyName, password, adminPassword });
        if (res.token) {
            handleLoginSuccess(res.token, res.familyId, res.name);
            return { success: true };
        }
        return { success: false, error: 'Invalid response' };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

const handleLoginSuccess = (token: string, familyId: string, name: string) => {
    safeSetItem(STORAGE_KEY_TOKEN, token);
    safeSetItem(STORAGE_KEY_FAMILY_ID, familyId);
    safeSetItem(STORAGE_KEY_FAMILY_NAME, name);
    
    // Save session
    const sessions = getSavedSessions();
    if (!sessions.find(s => s.id === familyId)) {
        sessions.push({ id: familyId, name, token });
        safeSetItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
    } else {
        // Update token
        const updated = sessions.map(s => s.id === familyId ? { ...s, token } : s);
        safeSetItem(STORAGE_KEY_SESSIONS, JSON.stringify(updated));
    }
    
    // Trigger sync
    retrySync();
};

export const switchFamily = (familyId: string) => {
    const sessions = getSavedSessions();
    const session = sessions.find(s => s.id === familyId);
    if (session) {
        safeSetItem(STORAGE_KEY_TOKEN, session.token);
        safeSetItem(STORAGE_KEY_FAMILY_ID, session.id);
        safeSetItem(STORAGE_KEY_FAMILY_NAME, session.name);
        window.location.reload(); 
    }
};

export const logout = (familyId?: string) => {
    if (familyId) {
        const sessions = getSavedSessions().filter(s => s.id !== familyId);
        safeSetItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
        if (getCurrentFamilyId() === familyId) {
            safeRemoveItem(STORAGE_KEY_TOKEN);
            safeRemoveItem(STORAGE_KEY_FAMILY_ID);
            safeRemoveItem(STORAGE_KEY_FAMILY_NAME);
            window.location.reload();
        }
    } else {
        safeClear(); 
        idb.clearAllStores();
        window.location.reload();
    }
};

// Generic admin action handler
export const adminAction = async (action: 'update_passwords' | 'delete_family' | 'rename_family', data: any) => {
    try {
        const res = await apiCall('/admin', 'POST', { action, ...data });
        return { success: true, ...res };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};


// --- Restaurants & Voting ---

export const getRestaurants = async (): Promise<Restaurant[]> => {
    const local = await idb.getAll<Restaurant>(STORE_RESTAURANTS);
    if (ENABLE_RESTAURANTS && hasAuthToken() && navigator.onLine) {
         apiCall('/restaurants', 'GET', undefined, { skipAuthRedirect: true }).then(async (remote: Restaurant[]) => {
             for(const r of remote) await idb.put(STORE_RESTAURANTS, r);
             window.dispatchEvent(new Event('restaurants-updated'));
         }).catch(() => {});
    }
    return local;
};

export const upsertRestaurant = async (r: Restaurant, options?: { localOnly?: boolean }) => {
    // If sharing to family, tag with current family ID locally immediately
    const currentFamilyId = getCurrentFamilyId();
    if (currentFamilyId && !options?.localOnly) {
        r.familyId = currentFamilyId;
    }

    await idb.put(STORE_RESTAURANTS, r);
    
    if (options?.localOnly) return;

    if (hasAuthToken()) apiCall('/restaurants', 'POST', r).catch(console.error);
};

export const deleteRestaurant = async (id: string) => {
    await idb.remove(STORE_RESTAURANTS, id);
    if (hasAuthToken()) apiCall(`/restaurants?id=${id}`, 'DELETE').catch(console.error);
};

export const crossPostRestaurant = async (restaurant: Restaurant, targetFamilyId: string) => {
    const sessions = getSavedSessions();
    const targetSession = sessions.find(s => s.id === targetFamilyId);
    
    if (!targetSession) throw new Error("Not authenticated with target family");
    
    const sharedRestaurant = { ...restaurant, familyId: targetFamilyId };

    // Manual fetch with different token
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${targetSession.token}` };
    const res = await fetch(`${API_BASE}/restaurants`, {
        method: 'POST',
        headers,
        body: JSON.stringify(sharedRestaurant)
    });
    
    if (!res.ok) throw new Error("Failed to cross-post");
};

export const createVoteSession = async (subset?: Restaurant[], mode: 'list' | 'swipe' = 'list'): Promise<VoteSession | null> => {
    if (!ENABLE_RESTAURANTS) return null;
    const restaurants = subset || await getRestaurants();
    try {
        const res = await apiCall('/vote_sessions', 'POST', { deviceId: getDeviceId(), restaurants, mode });
        return res;
    } catch (e) { console.error(e); return null; }
};

export const joinSession = async (code: string): Promise<{ session: VoteSession, votes: Vote[], restaurants: Restaurant[] } | null> => {
    try {
        const res = await apiCall(`/vote_sessions?code=${code}`);
        return res;
    } catch (e) { console.error(e); return null; }
};

export const submitVote = async (sessionId: string, restaurantId: string, voteValue: number) => {
    try {
        await apiCall('/votes', 'POST', { sessionId, restaurantId, voteValue, deviceId: getDeviceId() });
    } catch (e) { console.error(e); }
};

export const endSession = async (sessionId: string) => {
    try {
        await apiCall(`/vote_sessions?id=${sessionId}`, 'DELETE');
    } catch (e) { console.error(e); }
};
