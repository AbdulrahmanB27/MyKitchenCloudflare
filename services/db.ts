
import { Recipe, AppSettings, ShoppingItem, MealPlan, SyncQueueItem, Restaurant, VoteSession, Vote } from '../types';
import * as idb from './idb';
import { STORE_RECIPES, STORE_SHOPPING, STORE_PLANS, STORE_SETTINGS, STORE_RESTAURANTS, ENABLE_RESTAURANTS } from '../constants';
import { v4 as uuidv4 } from 'uuid';

const API_BASE = '/api';
const STORAGE_KEY_TOKEN = 'family_auth_token';
const STORAGE_KEY_SESSIONS = 'family_sessions';
const STORAGE_KEY_CURRENT_ID = 'current_family_id';
const STORAGE_KEY_NAME = 'family_name';
const STORAGE_KEY_PINNED_ID = 'pinned_family_id';

// --- Auth State ---
let authCallback: (() => void) | null = null;
export const setAuthCallback = (cb: () => void) => { authCallback = cb; };

const getAuthToken = () => localStorage.getItem(STORAGE_KEY_TOKEN);
export const setAuthToken = (token: string) => localStorage.setItem(STORAGE_KEY_TOKEN, token);
export const hasAuthToken = () => !!getAuthToken();
export const getCurrentFamilyName = () => localStorage.getItem(STORAGE_KEY_NAME) || 'MyKitchen';
export const getCurrentFamilyId = () => localStorage.getItem(STORAGE_KEY_CURRENT_ID);
export const getPinnedFamilyId = () => localStorage.getItem(STORAGE_KEY_PINNED_ID);
export const setPinnedFamilyId = (id: string) => localStorage.setItem(STORAGE_KEY_PINNED_ID, id);

export const getSavedSessions = () => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY_SESSIONS) || '[]');
    } catch { return []; }
};

const saveSession = (id: string, name: string, token: string) => {
    const sessions = getSavedSessions();
    const existingIndex = sessions.findIndex((s: any) => s.id === id);
    
    if (existingIndex >= 0) {
        sessions[existingIndex] = { id, name, token };
    } else {
        sessions.push({ id, name, token });
    }
    
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
    localStorage.setItem(STORAGE_KEY_TOKEN, token);
    localStorage.setItem(STORAGE_KEY_CURRENT_ID, id);
    localStorage.setItem(STORAGE_KEY_NAME, name);
};

export const switchFamily = async (familyId: string) => {
    const sessions = getSavedSessions();
    const session = sessions.find((s: any) => s.id === familyId);
    if (session) {
        localStorage.setItem(STORAGE_KEY_TOKEN, session.token);
        localStorage.setItem(STORAGE_KEY_CURRENT_ID, session.id);
        localStorage.setItem(STORAGE_KEY_NAME, session.name);
        
        // Clear local data to prevent bleeding between families
        await idb.clearAllStores();
        window.location.reload(); 
    }
};

export const logout = (familyId?: string) => {
    // If no specific ID, remove the current one
    const targetId = familyId || localStorage.getItem(STORAGE_KEY_CURRENT_ID);
    
    if (targetId) {
        const sessions = getSavedSessions().filter((s: any) => s.id !== targetId);
        localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
        
        // If we removed the active session
        if (localStorage.getItem(STORAGE_KEY_CURRENT_ID) === targetId) {
             if (sessions.length > 0) {
                 switchFamily(sessions[0].id);
             } else {
                 localStorage.removeItem(STORAGE_KEY_TOKEN);
                 localStorage.removeItem(STORAGE_KEY_CURRENT_ID);
                 localStorage.removeItem(STORAGE_KEY_NAME);
                 localStorage.removeItem('sync_last_updated_at');
                 idb.clearAllStores().then(() => window.location.reload());
             }
        } else {
            window.dispatchEvent(new Event('sessions-updated'));
        }
    }
};

const getDeviceId = () => {
    let id = localStorage.getItem('device_id');
    if (!id) {
        id = uuidv4();
        localStorage.setItem('device_id', id);
    }
    return id;
};

// --- Auth API ---

export const registerFamily = async (familyName: string, password: string, adminPassword: string): Promise<{ success: boolean; error?: string }> => {
    try {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ familyName, password, adminPassword })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            saveSession(data.familyId, data.name, data.token);
            return { success: true };
        }
        return { success: false, error: data.error || 'Registration failed' };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const authenticate = async (familyName: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ familyName, password })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            saveSession(data.familyId, data.name, data.token);
            return { success: true };
        }
        return { success: false, error: data.error || 'Login failed' };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const adminAction = async (action: 'update_passwords' | 'delete_family', payload: any): Promise<{ success: boolean; error?: string }> => {
    try {
        const res = await fetch(`${API_BASE}/admin`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({ action, ...payload })
        });
        const data = await res.json();
        if (res.ok && data.success) return { success: true };
        return { success: false, error: data.error };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

// --- Sync State ---
const SYNC_KEY_LAST_UPDATED = 'sync_last_updated_at';

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

// Allows saving a recipe to a specific family ID without affecting local DB or current context
export const crossPostRecipe = async (recipe: Recipe, familyId: string) => {
    const sessions = getSavedSessions();
    const session = sessions.find((s:any) => s.id === familyId);
    if (!session) throw new Error("Target family session not found");

    const res = await fetch(`${API_BASE}/recipes`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify({ ...recipe, shareToFamily: true })
    });
    
    if (!res.ok) {
        if (res.status === 401) {
            // Token might be invalid, could handle re-auth here but complex
            throw new Error("Authentication failed for target family");
        }
        throw new Error("Failed to save to remote family");
    }
    return await res.json();
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
    // If online, sync first
    if (navigator.onLine && hasAuthToken()) {
        try {
            const res = await fetch(`${API_BASE}/shopping`, { headers: { 'Authorization': `Bearer ${getAuthToken()}` }});
            if (res.ok) {
                const items = await res.json();
                // Simple replace strategy for shopping list for now
                for (const item of items) await idb.put(STORE_SHOPPING, item);
            }
        } catch(e) {}
    }
    return idb.getAll<ShoppingItem>(STORE_SHOPPING);
};

export const upsertShoppingItem = async (item: ShoppingItem): Promise<void> => {
    await idb.put(STORE_SHOPPING, item);
    if (navigator.onLine && hasAuthToken()) {
        fetch(`${API_BASE}/shopping`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAuthToken()}` },
            body: JSON.stringify(item)
        }).catch(console.error);
    }
};

export const deleteShoppingItem = async (id: string): Promise<void> => {
    await idb.remove(STORE_SHOPPING, id);
    if (navigator.onLine && hasAuthToken()) {
        fetch(`${API_BASE}/shopping?id=${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        }).catch(console.error);
    }
};

export const clearShoppingList = async (onlyChecked: boolean = false): Promise<void> => {
    const items = await getShoppingList();
    for (const item of items) {
        if (!onlyChecked || item.isChecked) {
            await idb.remove(STORE_SHOPPING, item.id);
        }
    }
    if (navigator.onLine && hasAuthToken()) {
        fetch(`${API_BASE}/shopping?clearAll=${onlyChecked ? 'checked' : 'true'}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        }).catch(console.error);
    }
};

// --- SYNC ENGINE ---

export const getSyncQueue = async () => {
    return idb.getSyncQueue();
};

export const retrySync = () => {
    syncRecipes('manual');
    if (ENABLE_RESTAURANTS) syncRestaurants();
};

const syncRecipes = async (mode: 'auto' | 'manual' = 'auto') => {
    let hasChanges = false;
    
    // 1. Pull Incoming Changes
    try {
        const localRecipes = await idb.getAll<Recipe>(STORE_RECIPES);
        let lastUpdated = localStorage.getItem(SYNC_KEY_LAST_UPDATED) || '0';
        if (localRecipes.length === 0) lastUpdated = '0';

        const res = await fetch(`${API_BASE}/recipes?since=${lastUpdated}`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        
        if (res.status === 401) {
            if (mode === 'manual' && authCallback) authCallback();
            return;
        }

        if (res.ok) {
            const updates: Recipe[] = await res.json();
            if (updates.length > 0) {
                let maxTs = parseInt(lastUpdated);
                for (const r of updates) {
                    if (r.deleted) {
                        await idb.remove(STORE_RECIPES, r.id);
                    } else {
                        const existing = await idb.getOne<Recipe>(STORE_RECIPES, r.id);
                        if (existing) {
                            r.favorite = existing.favorite; 
                        } else {
                            r.favorite = false; 
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
    const recipeQueue = queue.filter(q => !q.store || q.store === STORE_RECIPES);

    if (recipeQueue.length > 0) {
        if (!hasAuthToken()) {
            if (mode === 'manual' && authCallback) authCallback();
            return;
        }

        for (const item of recipeQueue) {
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
                    hasChanges = true; 
                } else if (res && (res.status === 401 || res.status === 403)) {
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

// --- Restaurants (Module) ---

export const getRestaurants = async (): Promise<Restaurant[]> => {
    if (!ENABLE_RESTAURANTS) return [];
    
    // 1. Get Local
    let list = await idb.getAll<Restaurant>(STORE_RESTAURANTS);
    
    // 2. Trigger Sync
    if (navigator.onLine && hasAuthToken()) {
        syncRestaurants().catch(console.error);
    }
    
    return list;
};

export const upsertRestaurant = async (rest: Restaurant): Promise<void> => {
    if (!ENABLE_RESTAURANTS) return;
    
    // Must be auth'd to write
    if (!hasAuthToken()) {
        if (authCallback) authCallback();
        throw new Error("Auth required");
    }

    // Optimistic UI Update
    await idb.put(STORE_RESTAURANTS, rest);
    window.dispatchEvent(new Event('restaurants-updated'));

    // Push to API
    try {
        const res = await fetch(`${API_BASE}/restaurants`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}` 
            },
            body: JSON.stringify(rest)
        });
        if (!res.ok) throw new Error("Failed to save to server");
    } catch (e) {
        console.error("Restaurant save failed", e);
    }
};

export const deleteRestaurant = async (id: string): Promise<void> => {
     if (!ENABLE_RESTAURANTS) return;
     if (!hasAuthToken()) {
        if (authCallback) authCallback();
        throw new Error("Auth required");
    }

    await idb.remove(STORE_RESTAURANTS, id);
    window.dispatchEvent(new Event('restaurants-updated'));

    try {
        await fetch(`${API_BASE}/restaurants?id=${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
    } catch (e) {
        console.error("Restaurant delete failed", e);
    }
};

const syncRestaurants = async () => {
    if (!ENABLE_RESTAURANTS) return;
    try {
        const res = await fetch(`${API_BASE}/restaurants`, { headers: { 'Authorization': `Bearer ${getAuthToken()}` } });
        if (res.ok) {
            const data: Restaurant[] = await res.json();
            const currentIds = new Set(data.map(r => r.id));
            const local = await idb.getAll<Restaurant>(STORE_RESTAURANTS);
            
            for (const r of data) {
                await idb.put(STORE_RESTAURANTS, r);
            }
            
            for (const l of local) {
                if (!currentIds.has(l.id)) {
                    await idb.remove(STORE_RESTAURANTS, l.id);
                }
            }
            
            window.dispatchEvent(new Event('restaurants-updated'));
        }
    } catch (e) {
        console.warn("Restaurant sync failed", e);
    }
};

// --- Voting Sessions ---

export const createVoteSession = async (): Promise<VoteSession | null> => {
    if (!ENABLE_RESTAURANTS) return null;
    
    // We send current local restaurants to server to create a snapshot for this session
    // This allows guests without access to the restaurant DB to see the options.
    const restaurants = await idb.getAll<Restaurant>(STORE_RESTAURANTS);
    
    try {
        const res = await fetch(`${API_BASE}/vote_sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: getDeviceId(), restaurants })
        });
        if (res.ok) return await res.json();
    } catch (e) {
        console.error(e);
    }
    return null;
};

export const joinSession = async (code: string): Promise<{ session: VoteSession, votes: Vote[], restaurants: Restaurant[] } | null> => {
    if (!ENABLE_RESTAURANTS) return null;
    try {
        const res = await fetch(`${API_BASE}/vote_sessions?code=${code}`);
        if (res.ok) {
            const data = await res.json();
            // Data contains session, votes
            // session.snapshot contains the restaurants
            return {
                session: data.session,
                votes: data.votes,
                restaurants: data.session.snapshot || []
            };
        }
    } catch (e) { console.error(e); }
    return null;
};

export const submitVote = async (sessionId: string, restaurantId: string, value: number) => {
    if (!ENABLE_RESTAURANTS) return;
    try {
        await fetch(`${API_BASE}/votes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }, // No Auth Required
            body: JSON.stringify({
                sessionId,
                restaurantId,
                deviceId: getDeviceId(),
                voteValue: value
            })
        });
    } catch (e) { console.error(e); }
};


// --- Meal Plans ---

export const getMealPlans = async (): Promise<MealPlan[]> => {
    if (navigator.onLine && hasAuthToken()) {
        try {
            const res = await fetch(`${API_BASE}/plans`, { headers: { 'Authorization': `Bearer ${getAuthToken()}` } });
            if (res.ok) {
                const plans = await res.json();
                for (const p of plans) await idb.put(STORE_PLANS, p);
            }
        } catch(e) {}
    }
    return idb.getAll(STORE_PLANS);
};

export const upsertMealPlan = async (plan: MealPlan): Promise<void> => {
    await idb.put(STORE_PLANS, plan);
    if (navigator.onLine && hasAuthToken()) {
        fetch(`${API_BASE}/plans`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAuthToken()}` },
            body: JSON.stringify(plan)
        }).catch(console.error);
    }
};

export const deleteMealPlan = async (id: string): Promise<void> => {
    await idb.remove(STORE_PLANS, id);
    if (navigator.onLine && hasAuthToken()) {
        fetch(`${API_BASE}/plans?id=${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        }).catch(console.error);
    }
};

// --- Settings ---

export const getSettings = async (): Promise<AppSettings> => {
  const s = await idb.getOne<AppSettings>(STORE_SETTINGS, 'app-settings');
  return s || { theme: 'system', autoSync: true };
};

export const saveSettings = async (settings: AppSettings): Promise<void> => {
  await idb.put(STORE_SETTINGS, { ...settings, id: 'app-settings' });
};
