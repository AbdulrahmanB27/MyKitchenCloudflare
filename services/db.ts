
import { Recipe, AppSettings, ShoppingItem, MealPlan, SyncQueueItem, Restaurant, VoteSession, Vote, Review } from '../types';
import * as idb from './idb';
import { STORE_RECIPES, STORE_SHOPPING, STORE_PLANS, STORE_SETTINGS, STORE_RESTAURANTS, ENABLE_RESTAURANTS, ENABLE_RECIPE_SWIPE, STORE_REVIEWS } from '../constants';
import { v4 as uuidv4 } from 'uuid';

const TEST_FAMILY_NAME = 'test';
const TEST_PASSWORD = 'test';
const TEST_ADMIN_PASSWORD = 'testadmin';
const TEST_FAMILY_ID = 'test-family-id';
const TEST_TOKEN = 'mock-test-token-isolated';

// Detect Capacitor environments / localhost non-web hosts
const isCapacitorActive = (): boolean => {
    if (typeof window === 'undefined' || !window.location) return false;
    // Check for native Capacitor global variable or if protocol is native webview (capacitor:// or app://)
    const isCap = !!(window as any).Capacitor || window.location.protocol === 'capacitor:' || window.location.protocol === 'app:';
    return isCap;
};

// Returns the live backend URL base for standard requests
const getApiBase = (): string => {
    if (isCapacitorActive()) {
        try {
            const saved = window.localStorage.getItem('backend_server_url');
            if (saved) {
                return `${saved.replace(/\/+$/, '')}/api`;
            }
        } catch (e) {}
        // Fallback production URL of the deployed app
        return 'https://ais-pre-wcezktn6y3u7ylhpagfte7-108186802350.us-east1.run.app/api';
    }
    return '/api';
};

const API_BASE = getApiBase();

// Function to resolve relative URL or relative image URL (like /api/images?key=...) to an absolute URL
export const resolveImageUrl = (url?: string): string => {
    if (!url) return '';
    // Already absolute or base64 URL
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
        return url;
    }
    
    let host = '';
    if (isCapacitorActive()) {
        try {
            const saved = window.localStorage.getItem('backend_server_url');
            if (saved) {
                host = saved;
            }
        } catch (e) {}
        if (!host) {
            host = 'https://ais-pre-wcezktn6y3u7ylhpagfte7-108186802350.us-east1.run.app';
        }
    } else {
        host = typeof window !== 'undefined' && window.location ? window.location.origin : '';
    }
    
    host = host.replace(/\/+$/, '');
    const cleanPath = url.startsWith('/') ? url : '/' + url;
    return `${host}${cleanPath}`;
};

// Proactively record the current production origin if we are accessed via a standard, non-localhost Web URL
if (typeof window !== 'undefined' && window.location && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && !isCapacitorActive()) {
    try {
        window.localStorage.setItem('backend_server_url', window.location.origin);
    } catch (e) {}
}
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

export function getSavedSessions(): { id: string, name: string, token: string, password?: string, isAdmin?: boolean }[] {
    try {
        return JSON.parse(safeGetItem(STORAGE_KEY_SESSIONS) || '[]');
    } catch { return []; }
}

export function getDeviceId(): string {
    let id = safeGetItem(STORAGE_KEY_DEVICE_ID);
    if (!id) {
        id = uuidv4();
        safeSetItem(STORAGE_KEY_DEVICE_ID, id);
    }
    return id;
}

export function hasAuthToken(): boolean {
    return !!safeGetItem(STORAGE_KEY_TOKEN);
}

export function getCurrentFamilyId(): string | null {
    return safeGetItem(STORAGE_KEY_FAMILY_ID);
}

export function getCurrentFamilyName(): string {
    return safeGetItem(STORAGE_KEY_FAMILY_NAME) || 'My Kitchen';
}

export const getRestaurants = async (): Promise<Restaurant[]> => {
    const allRestaurants = await idb.getAll<Restaurant>(STORE_RESTAURANTS);
    const sessions = getSavedSessions();
    const allowedTenants = sessions.map(s => s.id);

    return allRestaurants.filter(r => {
        // Keep private restaurants (not shared)
        if (!r.familyId || r.familyId === 'private') return true;
        
        // Keep restaurants that belong to ANY logged-in family
        if (allowedTenants.includes(r.familyId)) return true;
        
        return false;
    });
};

export function getSettings(): Promise<AppSettings> {
    return idb.getOne<AppSettings>(STORE_SETTINGS, 'config').then(s => 
        s || { 
            theme: 'system', 
            autoSync: true, 
            enableRecipeSwipe: ENABLE_RECIPE_SWIPE, 
            enableRestaurants: ENABLE_RESTAURANTS, 
            compactMobileView: false 
        }
    );
}

export function saveSettings(settings: AppSettings): Promise<void> {
    return idb.put(STORE_SETTINGS, { id: 'config', ...settings });
}

export const getPinnedFamilyId = (): string | null => {
    // For now, same as current
    return getCurrentFamilyId();
};

export const getAvailableIngredients = (): string[] => {
    try {
        const item = safeGetItem('available_ingredients');
        return item ? JSON.parse(item) : [];
    } catch { return []; }
};

export const saveAvailableIngredients = (ingredients: string[]) => {
    safeSetItem('available_ingredients', JSON.stringify(ingredients));
    window.dispatchEvent(new CustomEvent('available-updated'));
};

let authCallback: (() => void) | null = null;
export const setAuthCallback = (cb: () => void) => {
    authCallback = cb;
};

// --- API Helper ---

export const apiCall = async (endpoint: string, method: string = 'GET', body?: any, options?: { skipAuthRedirect?: boolean, customToken?: string }) => {
    const token = options?.customToken || safeGetItem(STORAGE_KEY_TOKEN);

    // Isolated test family bypass
    if (token === TEST_TOKEN) {
        if (method === 'GET') {
            if (endpoint.startsWith('/recipes')) return [];
            if (endpoint.startsWith('/restaurants')) return [];
        }
        return { success: true };
    }

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
            
            // If the item specifies a targetFamilyId, we need to use that family's token
            let customHeaders: Record<string, string> | undefined;
            if (item.targetFamilyId) {
                const sessions = getSavedSessions();
                const targetSession = sessions.find(s => s.id === item.targetFamilyId);
                if (targetSession) {
                    customHeaders = { 'Authorization': `Bearer ${targetSession.token}` };
                } else {
                    // If we don't have the session anymore, we can't sync it. Remove it.
                    console.warn(`Removing sync item ${item.id} because target session ${item.targetFamilyId} is missing`);
                    await removeFromSyncQueue(item.id);
                    continue;
                }
            }

            // Helper to make the call with custom headers if needed
            const doApiCall = async (endpoint: string, method: string, data?: any) => {
                if (customHeaders) {
                    const res = await fetch(`${API_BASE}${endpoint}`, {
                        method,
                        headers: { 'Content-Type': 'application/json', ...customHeaders },
                        body: data ? JSON.stringify(data) : undefined
                    });
                    if (!res.ok) {
                        const err: any = new Error("Sync failed");
                        err.status = res.status;
                        throw err;
                    }
                } else {
                    await apiCall(endpoint, method, data, opts);
                }
            };

            if (item.store === STORE_RECIPES) {
                if (item.action === 'upsert') await doApiCall('/recipes', 'POST', item.data);
                if (item.action === 'delete') await doApiCall(`/recipes?id=${item.id}`, 'DELETE');
            } else if (item.store === STORE_RESTAURANTS) {
                if (item.action === 'upsert') await doApiCall('/restaurants', 'POST', item.data);
                if (item.action === 'delete') await doApiCall(`/restaurants?id=${item.id}`, 'DELETE');
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
        const successfulSessionIds = new Set<string>();
        
        // Fetch from all sessions in parallel
        await Promise.all(sessions.map(async (session) => {
            if (session.token === TEST_TOKEN) {
                successfulSessionIds.add(session.id);
                return;
            }
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
                    successfulSessionIds.add(session.id);
                }
            } catch (e) {
                console.warn(`Failed to sync session ${session.name}`, e);
            }
        }));

        // Always process if we successfully fetched from ANY session or have data
        if (allFetchedRecipes.length > 0 || successfulSessionIds.size > 0) {
            // Group by ID to merge
            const grouped = new Map<string, Recipe[]>();
            for (const r of allFetchedRecipes) {
                if (!grouped.has(r.id)) grouped.set(r.id, []);
                grouped.get(r.id)!.push(r);
            }

            // Fetch local recipes to include in merge resolution
            const localRecipes = await idb.getAll<Recipe>(STORE_RECIPES);
            const localMap = new Map(localRecipes.map(r => [r.id, r]));

            // Process merges
            for (const [id, versions] of grouped) {
                const local = localMap.get(id);
                if (local) {
                    versions.push(local);
                    localMap.delete(id); // mark as processed
                }

                const activeVersions = versions.filter(v => !v.deleted);
                const deletedVersions = versions.filter(v => v.deleted);
                
                // Trust the backend for tenantIds if we have active versions from backend
                const backendActive = allFetchedRecipes.filter(r => r.id === id && !r.deleted);
                const backendTenantIds = Array.from(new Set(backendActive.flatMap(v => v.tenantIds?.length ? v.tenantIds : (v.tenantId ? [v.tenantId] : [])).filter(Boolean))) as string[];

                // Find the absolute latest version (deleted or active)
                versions.sort((a, b) => b.updatedAt - a.updatedAt);
                const absoluteLatest = versions[0];
                
                // If the absolute latest version is a tombstone, or there are no active versions left globally
                if (absoluteLatest.deleted || (activeVersions.length === 0 && local?.deleted)) {
                    // It's deleted in the latest known state
                    await idb.remove(STORE_RECIPES, id);
                } else {
                    // Sort active versions by updatedAt desc to use latest data as base
                    activeVersions.sort((a, b) => b.updatedAt - a.updatedAt);
                    const latest = activeVersions[0];
                    
                    // If we have backend versions, use their combined tenantIds. 
                    // Otherwise keep whatever latest has (local edit overriding until sync).
                    const tenantIds = backendActive.length > 0 ? backendTenantIds : (latest.tenantIds || [latest.familyId].filter(Boolean));
                    
                    const merged: Recipe = {
                        ...latest,
                        tenantIds: tenantIds
                    };
                    
                    await idb.put(STORE_RECIPES, merged);
                }
            }

            // Clean up hard-deleted/unlinked shared recipes
            for (const [id, localRecipe] of localMap) {
                if (localRecipe.shareToFamily) {
                    const relevantTenants = localRecipe.tenantIds?.length ? localRecipe.tenantIds : [localRecipe.familyId];
                    // Which of the relevant tenants are we currently successfully connected to?
                    const myRelevantTenants = relevantTenants.filter(tid => !tid || successfulSessionIds.has(tid));
                    
                    // If we successfully checked >=1 tenant that this recipe claimed to belong to,
                    // AND none of them returned the recipe (because it's in localMap),
                    // it means it was deleted or unlinked remotely!
                    if (myRelevantTenants.length > 0) {
                        await idb.remove(STORE_RECIPES, id);
                    }
                }
            }

            window.dispatchEvent(new Event('recipes-updated'));
        }
    } catch (e) { console.warn("Failed to sync recipes", e); }

    // --- Other Stores (Current Session Only) ---
    // For Restaurants, we stick to the current session to avoid complexity for now
    if (!hasAuthToken()) return;

    // Restaurants
    const settings = await getSettings();
    if (ENABLE_RESTAURANTS && settings.enableRestaurants !== false) {
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
    try {
        const res = await fetch(`${API_BASE}/share/recipe?recipeId=${recipeId}&token=${token}`);
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: 'Recipe link is invalid or removed' }));
            throw new Error(errorData.error || `Server responded with ${res.status}`);
        }
        return res.json();
    } catch (e: any) {
        console.error("getSharedRecipe failed:", e);
        throw e;
    }
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

    // Always ensure the local recipe has the latest timestamp when saving
    recipe.updatedAt = Date.now();

    await idb.put(STORE_RECIPES, recipe);
    
    if (options?.localOnly) return; 

    if (hasAuthToken() && recipe.shareToFamily) {
        const targetFamilyId = recipe.familyId || currentFamilyId;
        const sessions = getSavedSessions();
        const targetSession = sessions.find(s => s.id === targetFamilyId);
        
        let customHeaders;
        if (targetSession && targetFamilyId !== currentFamilyId) {
             customHeaders = { 'Authorization': `Bearer ${targetSession.token}` };
        }

        try {
            if (customHeaders) {
                const res = await fetch(`${API_BASE}/recipes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...customHeaders },
                    body: JSON.stringify(recipe)
                });
                if (!res.ok) throw new Error("Sync failed");
            } else {
                await apiCall('/recipes', 'POST', recipe);
            }
        } catch (e) {
            // Queue for sync
            await addToSyncQueue({ id: recipe.id, action: 'upsert', data: recipe, store: STORE_RECIPES, timestamp: Date.now(), targetFamilyId });
        }
    }
};

export const deleteRecipe = async (id: string, options?: { keepReviews?: boolean }) => {
    if (!options?.keepReviews) {
        await deleteReviewsForTarget(id);
    }
    
    const recipe = await getRecipe(id);
    const targetFamilyId = recipe?.familyId || getCurrentFamilyId();
    
    await idb.remove(STORE_RECIPES, id);
    
    if (hasAuthToken() && recipe?.shareToFamily) {
        const sessions = getSavedSessions();
        const targetSession = sessions.find(s => s.id === targetFamilyId);
        
        let customHeaders;
        if (targetSession && targetFamilyId !== getCurrentFamilyId()) {
             customHeaders = { 'Authorization': `Bearer ${targetSession.token}` };
        }

        try {
            if (customHeaders) {
                const res = await fetch(`${API_BASE}/recipes?id=${id}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json', ...customHeaders }
                });
                if (!res.ok) throw new Error("Sync failed");
            } else {
                await apiCall(`/recipes?id=${id}`, 'DELETE');
            }
        } catch (e) {
            await addToSyncQueue({ id, action: 'delete', store: STORE_RECIPES, timestamp: Date.now(), targetFamilyId });
        }
    }
};

export const crossPostRecipe = async (recipe: Recipe, targetFamilyId: string) => {
    const sessions = getSavedSessions();
    const targetSession = sessions.find(s => s.id === targetFamilyId);
    
    if (!targetSession) {
        console.warn(`Skipping cross-post to ${targetFamilyId}: Not authenticated`);
        return;
    }
    
    // Ensure the recipe is set to be shared
    const sharedRecipe = { ...recipe, shareToFamily: true, familyId: targetFamilyId };

    try {
        // Manual fetch with different token
        const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${targetSession.token}` };
        const res = await fetch(`${API_BASE}/recipes`, {
            method: 'POST',
            headers,
            body: JSON.stringify(sharedRecipe)
        });
        
        if (!res.ok) throw new Error("Failed to cross-post");
    } catch (e) {
        // Queue for sync using the target family's token
        await addToSyncQueue({ id: recipe.id, action: 'upsert', data: sharedRecipe, store: STORE_RECIPES, timestamp: Date.now(), targetFamilyId });
    }
};

export const crossDeleteRecipe = async (recipeId: string, targetFamilyId: string) => {
    const sessions = getSavedSessions();
    const targetSession = sessions.find(s => s.id === targetFamilyId);
    
    if (!targetSession) {
        console.warn(`Skipping cross-delete to ${targetFamilyId}: Not authenticated`);
        return;
    }

    try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${targetSession.token}` };
        const res = await fetch(`${API_BASE}/recipes?id=${recipeId}`, {
            method: 'DELETE',
            headers
        });
        
        if (!res.ok) throw new Error("Failed to cross-delete");
    } catch (e) {
        await addToSyncQueue({ id: recipeId, action: 'delete', store: STORE_RECIPES, timestamp: Date.now(), targetFamilyId });
    }
};

// --- Shopping ---

export const getShoppingList = async (): Promise<ShoppingItem[]> => {
    return idb.getAll<ShoppingItem>(STORE_SHOPPING);
};

export const upsertShoppingItem = async (item: ShoppingItem) => {
    await idb.put(STORE_SHOPPING, item);
    window.dispatchEvent(new Event('shopping-updated'));
    // Local only - no sync
};

export const deleteShoppingItem = async (id: string) => {
    await idb.remove(STORE_SHOPPING, id);
    window.dispatchEvent(new Event('shopping-updated'));
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
    window.dispatchEvent(new Event('shopping-updated'));
};

// --- Meal Plans ---

export const getMealPlans = async (): Promise<MealPlan[]> => {
    return idb.getAll<MealPlan>(STORE_PLANS);
};

export const upsertMealPlan = async (plan: MealPlan) => {
    await idb.put(STORE_PLANS, plan);
    window.dispatchEvent(new Event('plans-updated'));
};

export const deleteMealPlan = async (id: string) => {
    await idb.remove(STORE_PLANS, id);
    window.dispatchEvent(new Event('plans-updated'));
};

// --- Sync Queue ---

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
    // Isolated test family bypass
    if (safeGetItem(STORAGE_KEY_TOKEN) === TEST_TOKEN) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    }

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
    // --- Isolated Test Family Logic ---
    if (familyName.toLowerCase() === TEST_FAMILY_NAME) {
        if (password === TEST_PASSWORD || password === TEST_ADMIN_PASSWORD) {
            const isAdmin = password === TEST_ADMIN_PASSWORD;
            handleLoginSuccess(TEST_TOKEN, TEST_FAMILY_ID, "Test Family", password, isAdmin);
            return { success: true };
        }
        return { success: false, error: 'Incorrect password' };
    }

    try {
        const res = await apiCall('/auth/login', 'POST', { familyName, password, turnstileToken });
        if (res.token) {
            handleLoginSuccess(res.token, res.familyId, res.name, password, res.isAdmin);
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
            handleLoginSuccess(res.token, res.familyId, res.name, password, res.isAdmin);
            return { success: true };
        }
        return { success: false, error: 'Invalid response' };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const generateFamilyLink = async (type: 'temporary' | 'view' | 'permanent', customToken?: string): Promise<{ success: boolean; token?: string; error?: string }> => {
    try {
        const res = await apiCall('/family-links/generate', 'POST', { type }, { customToken });
        return { success: true, token: res.token };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const useFamilyJoinLink = async (token: string): Promise<{ success: boolean; error?: string }> => {
    try {
        const res = await apiCall('/family-links/join', 'POST', { token });
        if (res.token) {
            handleLoginSuccess(res.token, res.familyId, res.name);
            return { success: true };
        }
        return { success: false, error: 'Invalid response' };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const fetchPublicFamily = async (token: string): Promise<{ familyName: string, recipes: Recipe[] } | null> => {
    try {
        // Unauthenticated fetch, avoiding apiCall
        const res = await fetch(`${API_BASE}/family-links/view/${token}`);
        if (!res.ok) throw new Error("Link invalid or expired");
        return await res.json();
    } catch (e) {
        console.error(e);
        return null;
    }
};

const handleLoginSuccess = (token: string, familyId: string, name: string, password?: string, isAdmin?: boolean) => {
    safeSetItem(STORAGE_KEY_TOKEN, token);
    safeSetItem(STORAGE_KEY_FAMILY_ID, familyId);
    safeSetItem(STORAGE_KEY_FAMILY_NAME, name);
    
    // Save session
    const sessions = getSavedSessions();
    if (!sessions.find(s => s.id === familyId)) {
        sessions.push({ id: familyId, name, token, password, isAdmin });
        safeSetItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
    } else {
        // Update token and password
        const updated = sessions.map(s => s.id === familyId ? { ...s, token, password: password || s.password, isAdmin: isAdmin ?? s.isAdmin } : s);
        safeSetItem(STORAGE_KEY_SESSIONS, JSON.stringify(updated));
    }
    
    // Trigger sync
    retrySync();
    syncDown();
};

export const isCurrentFamilyAdmin = (): boolean => {
    const familyId = getCurrentFamilyId();
    if (!familyId || familyId === 'private') return true; // private is always admin
    const session = getSavedSessions().find(s => s.id === familyId);
    return !!session?.isAdmin;
};

export const getCurrentFamilyPassword = (): string | undefined => {
    const familyId = getCurrentFamilyId();
    if (!familyId) return undefined;
    const session = getSavedSessions().find(s => s.id === familyId);
    return session?.password;
};

export const switchFamily = (familyId: string) => {
    if (familyId === 'private') {
        safeRemoveItem(STORAGE_KEY_TOKEN);
        safeRemoveItem(STORAGE_KEY_FAMILY_ID);
        safeRemoveItem(STORAGE_KEY_FAMILY_NAME);
        return;
    }

    const sessions = getSavedSessions();
    const session = sessions.find(s => s.id === familyId);
    if (session) {
        safeSetItem(STORAGE_KEY_TOKEN, session.token);
        safeSetItem(STORAGE_KEY_FAMILY_ID, session.id);
        safeSetItem(STORAGE_KEY_FAMILY_NAME, session.name);
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
            
            // Pick next available
            if (sessions.length > 0) {
                switchFamily(sessions[0].id);
            }
        }
    } else {
        safeClear(); 
        idb.clearAllStores();
        window.location.reload();
    }
};

// Generic admin action handler
export const adminAction = async (action: 'update_passwords' | 'delete_family' | 'rename_family' | 'verify', data: any, customToken?: string) => {
    // Isolated test family bypass
    const token = customToken || safeGetItem(STORAGE_KEY_TOKEN);
    if (token === TEST_TOKEN) {
        if (action === 'delete_family') {
            logout(TEST_FAMILY_ID);
        }
        return { success: true };
    }

    try {
        const res = await apiCall('/admin', 'POST', { action, ...data }, { customToken });
        return { success: true, ...res };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};


// --- Restaurants & Voting ---

export const upsertRestaurant = async (r: Restaurant, options?: { localOnly?: boolean }) => {
    // If sharing to family, tag with current family ID locally immediately
    const currentFamilyId = getCurrentFamilyId();
    if (r.familyId === 'current' && currentFamilyId) {
        r.familyId = currentFamilyId;
    }

    await idb.put(STORE_RESTAURANTS, r);
    
    if (options?.localOnly) return;

    if (hasAuthToken() && r.familyId && r.familyId !== 'private') {
        try {
            await apiCall('/restaurants', 'POST', r);
        } catch (e) {
            // Queue for sync
            await addToSyncQueue({ id: r.id, action: 'upsert', data: r, store: STORE_RESTAURANTS, timestamp: Date.now() });
        }
    }
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

    try {
        // Manual fetch with different token
        const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${targetSession.token}` };
        const res = await fetch(`${API_BASE}/restaurants`, {
            method: 'POST',
            headers,
            body: JSON.stringify(sharedRestaurant)
        });
        
        if (!res.ok) throw new Error("Failed to cross-post");
    } catch (e) {
        // Queue for sync using the target family's token
        await addToSyncQueue({ id: restaurant.id, action: 'upsert', data: sharedRestaurant, store: STORE_RESTAURANTS, timestamp: Date.now(), targetFamilyId });
    }
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
    const settings = await getSettings();
    if (!ENABLE_RESTAURANTS || settings.enableRestaurants === false) return null;
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
