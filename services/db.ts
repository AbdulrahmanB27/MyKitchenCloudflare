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

// --- Auth & Session State ---

export const getDeviceId = (): string => {
    let id = localStorage.getItem(STORAGE_KEY_DEVICE_ID);
    if (!id) {
        id = uuidv4();
        localStorage.setItem(STORAGE_KEY_DEVICE_ID, id);
    }
    return id;
};

export const hasAuthToken = (): boolean => {
    return !!localStorage.getItem(STORAGE_KEY_TOKEN);
};

export const getCurrentFamilyId = (): string | null => {
    return localStorage.getItem(STORAGE_KEY_FAMILY_ID);
};

export const getCurrentFamilyName = (): string => {
    return localStorage.getItem(STORAGE_KEY_FAMILY_NAME) || 'My Kitchen';
};

export const getPinnedFamilyId = (): string | null => {
    // For now, same as current
    return getCurrentFamilyId();
};

export const getSavedSessions = (): { id: string, name: string, token: string }[] => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY_SESSIONS) || '[]');
    } catch { return []; }
};

let authCallback: (() => void) | null = null;
export const setAuthCallback = (cb: () => void) => {
    authCallback = cb;
};

// --- API Helper ---

export const apiCall = async (endpoint: string, method: string = 'GET', body?: any) => {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);
    const headers: HeadersInit = {
        'Content-Type': 'application/json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });

    if (res.status === 401) {
        // Token expired or invalid
        if (authCallback) authCallback();
        throw new Error("Unauthorized");
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || res.statusText);
    }

    if (res.status === 204) return null;
    return res.json();
};

// --- Sync Logic (Simplified) ---

export const retrySync = async () => {
    if (!navigator.onLine || !hasAuthToken()) return;
    
    const queue = await idb.getSyncQueue();
    if (queue.length === 0) return;

    for (const item of queue) {
        try {
            if (item.store === STORE_RECIPES) {
                if (item.action === 'upsert') await apiCall('/recipes', 'POST', item.data);
                if (item.action === 'delete') await apiCall(`/recipes?id=${item.id}`, 'DELETE');
            } else if (item.store === STORE_SHOPPING) {
                if (item.action === 'upsert') await apiCall('/shopping', 'POST', item.data);
                if (item.action === 'delete') await apiCall(`/shopping?id=${item.id}`, 'DELETE');
            }
            // ... handle other stores
            await idb.removeFromSyncQueue(item.id);
        } catch (e) {
            console.error("Sync failed for item", item, e);
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
        apiCall('/recipes').then(async (remote: Recipe[]) => {
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
    
    // Manual fetch with different token
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${targetSession.token}` };
    const res = await fetch(`${API_BASE}/recipes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...recipe, shareToFamily: true })
    });
    
    if (!res.ok) throw new Error("Failed to cross-post");
};

// --- Shopping ---

export const getShoppingList = async (): Promise<ShoppingItem[]> => {
    const local = await idb.getAll<ShoppingItem>(STORE_SHOPPING);
    if (hasAuthToken() && navigator.onLine) {
        apiCall('/shopping').then(async (remote: ShoppingItem[]) => {
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
        apiCall('/plans').then(async (remote: MealPlan[]) => {
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
    
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);
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
    localStorage.setItem(STORAGE_KEY_TOKEN, token);
    localStorage.setItem(STORAGE_KEY_FAMILY_ID, familyId);
    localStorage.setItem(STORAGE_KEY_FAMILY_NAME, name);
    
    // Save session
    const sessions = getSavedSessions();
    if (!sessions.find(s => s.id === familyId)) {
        sessions.push({ id: familyId, name, token });
        localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
    } else {
        // Update token
        const updated = sessions.map(s => s.id === familyId ? { ...s, token } : s);
        localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(updated));
    }
    
    // Trigger sync
    retrySync();
};

export const switchFamily = (familyId: string) => {
    const sessions = getSavedSessions();
    const session = sessions.find(s => s.id === familyId);
    if (session) {
        localStorage.setItem(STORAGE_KEY_TOKEN, session.token);
        localStorage.setItem(STORAGE_KEY_FAMILY_ID, session.id);
        localStorage.setItem(STORAGE_KEY_FAMILY_NAME, session.name);
        window.location.reload(); 
    }
};

export const logout = (familyId?: string) => {
    if (familyId) {
        const sessions = getSavedSessions().filter(s => s.id !== familyId);
        localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
        if (getCurrentFamilyId() === familyId) {
            localStorage.removeItem(STORAGE_KEY_TOKEN);
            localStorage.removeItem(STORAGE_KEY_FAMILY_ID);
            localStorage.removeItem(STORAGE_KEY_FAMILY_NAME);
            window.location.reload();
        }
    } else {
        localStorage.clear(); 
        idb.clearAllStores();
        window.location.reload();
    }
};

export const adminAction = async (action: 'update_passwords' | 'delete_family', data: any) => {
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
         apiCall('/restaurants').then(async (remote: Restaurant[]) => {
             for(const r of remote) await idb.put(STORE_RESTAURANTS, r);
             window.dispatchEvent(new Event('restaurants-updated'));
         }).catch(() => {});
    }
    return local;
};

export const upsertRestaurant = async (r: Restaurant) => {
    await idb.put(STORE_RESTAURANTS, r);
    if (hasAuthToken()) apiCall('/restaurants', 'POST', r).catch(console.error);
};

export const deleteRestaurant = async (id: string) => {
    await idb.remove(STORE_RESTAURANTS, id);
    if (hasAuthToken()) apiCall(`/restaurants?id=${id}`, 'DELETE').catch(console.error);
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
