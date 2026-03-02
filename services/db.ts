
import { Recipe, AppSettings, ShoppingItem, MealPlan, SyncQueueItem, Restaurant, VoteSession, Vote, Review } from '../types';
import * as idb from './idb';
import { STORE_RECIPES, STORE_SHOPPING, STORE_PLANS, STORE_SETTINGS, STORE_RESTAURANTS, ENABLE_RESTAURANTS, STORE_REVIEWS } from '../constants';
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
            const text = await res.text();
            let err;
            try {
                err = JSON.parse(text);
            } catch {
                err = { error: text || 'Unknown error' };
            }
            const error: any = new Error(err.error || res.statusText);
            error.status = res.status;
            throw error;
        }

        if (res.status === 204) return null;
        
        const text = await res.text();
        try {
            return text ? JSON.parse(text) : {};
        } catch (e) {
            console.error("API Response was not JSON:", text);
            throw new Error("Unexpected end of JSON input");
        }
    } catch (e: any) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
             throw new Error("Request timed out");
        }
        throw e;
    }
};

// --- Sync Logic ---

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
            } else if (item.store === STORE_RESTAURANTS) {
                if (item.action === 'upsert') await apiCall('/restaurants', 'POST', item.data, opts);
                if (item.action === 'delete') await apiCall(`/restaurants?id=${item.id}`, 'DELETE', undefined, opts);
            } 
            // NOTE: Shopping sync removed
            // ... handle other stores
            await removeFromSyncQueue(item.id);
        } catch (e: any) {
            console.error("Sync failed for item", item, e);
            // If the error is a client-side error (4xx) but NOT 401 (auth issue),
            // it means the data is likely bad or invalid (e.g. 400 Bad Request, 404 Not Found).
            // We should remove it from the queue so it doesn't block future syncs forever.
            if (e.status && e.status >= 400 && e.status < 500 && e.status !== 401) {
                console.warn(`Removing invalid item ${item.id} from queue (Status: ${e.status})`);
                await removeFromSyncQueue(item.id);
            }
        }
    }
    // Trigger refresh of local state in case sync changed things (though usually sync updates server)
    // We might want to pull fresh data after pushing changes
    syncDown();
};

export const syncDown = async () => {
    if (!navigator.onLine) return;
    
    // 1. Get all active sessions to sync recipes from ALL families
    const sessions = getSavedSessions();
    
    // --- Recipes Sync (Multi-Tenant Merge) ---
    try {
        const allFetchedRecipes: Recipe[] = [];
        
        // Fetch from all sessions in parallel
        await Promise.all(sessions.map(async (session) => {
            try {
                const headers: Record<string, string> = { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${session.token}` 
                };
                // Fetch all recipes (no 'since' for now to ensure full merge consistency)
                const res = await fetch(`${API_BASE}/recipes?_t=${Date.now()}`, { headers });
                if (res.ok) {
                    const recipes = await res.json();
                    allFetchedRecipes.push(...recipes);
                }
            } catch (e) {
                console.warn(`Failed to sync session ${session.name}`, e);
            }
        }));

        if (allFetchedRecipes.length > 0) {
            // Group by ID to merge
            const grouped = new Map<string, Recipe[]>();
            for (const r of allFetchedRecipes) {
                if (!grouped.has(r.id)) grouped.set(r.id, []);
                grouped.get(r.id)!.push(r);
            }

            // Process merges
            for (const [id, versions] of grouped) {
                // Sort by updatedAt desc to use latest data as base
                versions.sort((a, b) => b.updatedAt - a.updatedAt);
                const latest = versions[0];
                
                // Collect all tenantIds where this recipe exists
                const tenantIds = Array.from(new Set(versions.map(v => v.tenantId).filter(Boolean) as string[]));
                
                // Create merged object
                const merged: Recipe = {
                    ...latest,
                    tenantIds: tenantIds
                };
                
                if (merged.deleted) {
                    await idb.remove(STORE_RECIPES, id);
                } else {
                    await idb.put(STORE_RECIPES, merged);
                }
            }
            window.dispatchEvent(new Event('recipes-updated'));
        }
    } catch (e) { console.warn("Failed to sync recipes", e); }

    // --- Other Stores (Current Session Only) ---
    // For Plans and Restaurants, we stick to the current session to avoid complexity for now
    if (!hasAuthToken()) return;

    // Plans
    try {
        const remotePlans = await apiCall(`/plans?_t=${Date.now()}`, 'GET', undefined, { skipAuthRedirect: true });
        if (remotePlans) {
            for (const p of remotePlans) await idb.put(STORE_PLANS, p);
            window.dispatchEvent(new Event('plans-updated'));
        }
    } catch (e) { console.warn("Failed to sync plans", e); }

    // Restaurants
    if (ENABLE_RESTAURANTS) {
        try {
            const remoteRest = await apiCall(`/restaurants?_t=${Date.now()}`, 'GET', undefined, { skipAuthRedirect: true });
            if (remoteRest) {
                for (const r of remoteRest) {
                    if (r.deleted) {
                        await idb.remove(STORE_RESTAURANTS, r.id);
                    } else {
                        await idb.put(STORE_RESTAURANTS, r);
                    }
                }
                window.dispatchEvent(new Event('restaurants-updated'));
            }
        } catch (e) { console.warn("Failed to sync restaurants", e); }
    }
};

// --- Reviews ---

export const getReviewsForTarget = async (targetId: string): Promise<Review[]> => {
    return idb.getAllByIndex<Review>(STORE_REVIEWS, 'targetId', targetId);
};

export const addReview = async (review: Review) => {
    await idb.put(STORE_REVIEWS, review);
    
    // Update cache on target
    if (review.targetType === 'recipe') {
        const recipe = await getRecipe(review.targetId);
        if (recipe) {
            const reviews = await getReviewsForTarget(review.targetId);
            const avg = reviews.reduce((a, b) => a + b.rating, 0) / reviews.length;
            await upsertRecipe({ ...recipe, averageRating: avg, reviewCount: reviews.length }, { localOnly: true });
        }
    }
};

export const deleteReviewsForTarget = async (targetId: string) => {
    const reviews = await getReviewsForTarget(targetId);
    for (const r of reviews) {
        await idb.remove(STORE_REVIEWS, r.id);
    }
};

export const getAllReviews = async (): Promise<Review[]> => {
    return idb.getAll<Review>(STORE_REVIEWS);
};

// --- Recipes ---

export const getAllRecipes = async (): Promise<Recipe[]> => {
    const allRecipes = await idb.getAll<Recipe>(STORE_RECIPES);
    const sessions = getSavedSessions();
    const allowedTenants = sessions.map(s => s.id);

    const recipes = allRecipes.filter(r => {
        // Keep private recipes (not shared)
        if (!r.shareToFamily) return true;
        
        // Keep recipes that belong to ANY logged-in family
        // 1. Check primary tenantId / familyId
        if (r.familyId && allowedTenants.includes(r.familyId)) return true;
        if (r.tenantId && allowedTenants.includes(r.tenantId)) return true;
        
        // 2. Check merged tenantIds (if recipe exists in multiple families)
        if (r.tenantIds && r.tenantIds.some(t => allowedTenants.includes(t))) return true;
        
        return false;
    });
    
    // Migration Check (One-time lazy migration)
    let migrationNeeded = false;
    for (const r of recipes) {
        if ((r as any).reviews && Array.isArray((r as any).reviews) && (r as any).reviews.length > 0) {
            migrationNeeded = true;
            break;
        }
    }
    
    if (migrationNeeded) {
        console.log("Migrating reviews...");
        for (const r of recipes) {
            if ((r as any).reviews && Array.isArray((r as any).reviews) && (r as any).reviews.length > 0) {
                const oldReviews = (r as any).reviews as any[];
                for (const oldR of oldReviews) {
                    const newReview: Review = {
                        id: oldR.id || uuidv4(),
                        targetId: r.id,
                        targetType: 'recipe',
                        rating: oldR.rating,
                        date: oldR.date,
                        text: oldR.text
                    };
                    await idb.put(STORE_REVIEWS, newReview);
                }
                
                // Update recipe to remove reviews and set cache
                const reviews = await getReviewsForTarget(r.id);
                const avg = reviews.reduce((a, b) => a + b.rating, 0) / reviews.length;
                
                const updated = { ...r, averageRating: avg, reviewCount: reviews.length };
                delete (updated as any).reviews;
                await idb.put(STORE_RECIPES, updated);
            }
        }
        return idb.getAll<Recipe>(STORE_RECIPES); // Return fresh data
    }

    return recipes;
};

export const getRecipe = async (id: string): Promise<Recipe | undefined> => {
    const r = await idb.getOne<Recipe>(STORE_RECIPES, id);
    if (r && (r as any).reviews && Array.isArray((r as any).reviews) && (r as any).reviews.length > 0) {
        // Migrate single recipe on read
        const oldReviews = (r as any).reviews as any[];
        for (const oldR of oldReviews) {
            const newReview: Review = {
                id: oldR.id || uuidv4(),
                targetId: r.id,
                targetType: 'recipe',
                rating: oldR.rating,
                date: oldR.date,
                text: oldR.text
            };
            await idb.put(STORE_REVIEWS, newReview);
        }
        
        const reviews = await getReviewsForTarget(r.id);
        const avg = reviews.reduce((a, b) => a + b.rating, 0) / reviews.length;
        
        const updated = { ...r, averageRating: avg, reviewCount: reviews.length };
        delete (updated as any).reviews;
        await idb.put(STORE_RECIPES, updated);
        return updated;
    }
    return r;
};

export const shareRecipe = async (recipeId: string): Promise<string> => {
    try {
        // Fetch local recipe data to send to server in case it doesn't exist there
        const recipe = await idb.getOne(STORE_RECIPES, recipeId);
        
        const res = await apiCall(`/recipes/${recipeId}/share`, 'POST', recipe);
        return res.token;
    } catch (e: any) {
        console.error("Failed to share recipe:", e, e.status);
        throw e;
    }
};

export const getSharedRecipe = async (recipeId: string, token: string): Promise<Recipe> => {
    const res = await fetch(`${API_BASE}/share/recipe?recipeId=${recipeId}&token=${token}`);
    if (!res.ok) {
        throw new Error("Recipe link is invalid or removed");
    }
    return res.json();
};

export const publishRecipe = async (recipe: Recipe) => {
    // This uploads the recipe to the public endpoint without requiring family auth.
    // It makes the recipe accessible via ID but does not add it to family sync lists.
    const res = await fetch(`${API_BASE}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipe)
    });
    
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || res.statusText);
    }
};

export const upsertRecipe = async (recipe: Recipe, options?: { localOnly?: boolean }) => {
    // If sharing to family, tag with current family ID locally immediately so it shows up in "Family" tab
    const currentFamilyId = getCurrentFamilyId();
    if (recipe.shareToFamily && currentFamilyId && !recipe.familyId && !options?.localOnly) {
        recipe.familyId = currentFamilyId;
    }

    await idb.put(STORE_RECIPES, recipe);
    
    if (options?.localOnly) return; 

    if (hasAuthToken() && recipe.shareToFamily && (!recipe.familyId || recipe.familyId === currentFamilyId)) {
        try {
            await apiCall('/recipes', 'POST', recipe);
        } catch (e) {
            // Queue for sync
            await addToSyncQueue({ id: recipe.id, action: 'upsert', data: recipe, store: STORE_RECIPES, timestamp: Date.now() });
        }
    }
};

export const deleteRecipe = async (id: string, options?: { keepReviews?: boolean }) => {
    if (!options?.keepReviews) {
        await deleteReviewsForTarget(id);
    }
    await idb.remove(STORE_RECIPES, id);
    if (hasAuthToken()) {
        try {
            await apiCall(`/recipes?id=${id}`, 'DELETE');
        } catch (e) {
            await addToSyncQueue({ id, action: 'delete', store: STORE_RECIPES, timestamp: Date.now() });
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

export const crossDeleteRecipe = async (recipeId: string, targetFamilyId: string) => {
    const sessions = getSavedSessions();
    const targetSession = sessions.find(s => s.id === targetFamilyId);
    
    if (!targetSession) throw new Error("Not authenticated with target family");

    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${targetSession.token}` };
    const res = await fetch(`${API_BASE}/recipes?id=${recipeId}`, {
        method: 'DELETE',
        headers
    });
    
    if (!res.ok) throw new Error("Failed to cross-delete");
};

// --- Shopping ---

export const getShoppingList = async (): Promise<ShoppingItem[]> => {
    return idb.getAll<ShoppingItem>(STORE_SHOPPING);
};

export const upsertShoppingItem = async (item: ShoppingItem) => {
    await idb.put(STORE_SHOPPING, item);
    // Local only - no sync
};

export const clearShoppingList = async (purchasedOnly: boolean) => {
    if (purchasedOnly) {
        const all = await idb.getAll<ShoppingItem>(STORE_SHOPPING);
        const toDelete = all.filter(i => i.isChecked);
        for(const item of toDelete) await idb.remove(STORE_SHOPPING, item.id);
    } else {
        const all = await idb.getAll<ShoppingItem>(STORE_SHOPPING);
        for(const item of all) await idb.remove(STORE_SHOPPING, item.id);
    }
};

// --- Meal Plans ---

export const getMealPlans = async (): Promise<MealPlan[]> => {
    return idb.getAll<MealPlan>(STORE_PLANS);
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

export const addToSyncQueue = async (item: SyncQueueItem) => {
    await idb.addToSyncQueue(item);
    window.dispatchEvent(new Event('queue-updated'));
};

export const removeFromSyncQueue = async (id: string) => {
    await idb.removeFromSyncQueue(id);
    window.dispatchEvent(new Event('queue-updated'));
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

export const authenticate = async (familyName: string, password: string, turnstileToken?: string): Promise<{ success: boolean, error?: string }> => {
    try {
        const res = await apiCall('/auth/login', 'POST', { familyName, password, turnstileToken });
        if (res.token) {
            handleLoginSuccess(res.token, res.familyId, res.name);
            return { success: true };
        }
        return { success: false, error: 'Invalid response' };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const registerFamily = async (familyName: string, password: string, adminPassword: string, turnstileToken?: string): Promise<{ success: boolean, error?: string }> => {
    try {
        const res = await apiCall('/auth/register', 'POST', { familyName, password, adminPassword, turnstileToken });
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
    syncDown();
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
    return idb.getAll<Restaurant>(STORE_RESTAURANTS);
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
    await deleteReviewsForTarget(id);
    await idb.remove(STORE_RESTAURANTS, id);
    if (hasAuthToken()) {
        try {
            await apiCall(`/restaurants?id=${id}`, 'DELETE');
        } catch (e) {
            await addToSyncQueue({ id, action: 'delete', store: STORE_RESTAURANTS, timestamp: Date.now() });
        }
    }
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

export const crossDeleteRestaurant = async (restaurantId: string, targetFamilyId: string) => {
    const sessions = getSavedSessions();
    const targetSession = sessions.find(s => s.id === targetFamilyId);
    
    if (!targetSession) throw new Error("Not authenticated with target family");

    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${targetSession.token}` };
    const res = await fetch(`${API_BASE}/restaurants?id=${restaurantId}`, {
        method: 'DELETE',
        headers
    });
    
    if (!res.ok) throw new Error("Failed to cross-delete");
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
