
import { Recipe, AppSettings, ShoppingItem, MealPlan } from '../types';
import { config } from '../config';

// API Client Wrapper for Cloudflare Pages Functions
// Includes localStorage fallback for development/offline resilience

const API_BASE = '/api';
const LOCAL_KEYS = {
    RECIPES: 'recipes_fallback',
    SHOPPING: 'shopping_list_fallback',
    PLANS: 'meal_plans_fallback',
    SETTINGS: 'appSettings'
};

// Helper to get local data
const getLocal = <T>(key: string, defaultVal: T): T => {
    try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : defaultVal;
    } catch {
        return defaultVal;
    }
};

// Helper to set local data
const setLocal = (key: string, data: any) => {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.error("Local storage full or error", e);
    }
};

export const getAllRecipes = async (): Promise<Recipe[]> => {
  try {
    const res = await fetch(`${API_BASE}/recipes`);
    if (!res.ok) throw new Error(`API Error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("Backend unavailable, using local data.");
    // If local is empty, try to seed with config samples for a better first-run experience
    let local = getLocal<Recipe[]>(LOCAL_KEYS.RECIPES, []);
    if (local.length === 0 && config.sampleRecipes) {
        local = config.sampleRecipes as Recipe[];
        setLocal(LOCAL_KEYS.RECIPES, local);
    }
    return local;
  }
};

export const getRecipe = async (id: string): Promise<Recipe | undefined> => {
  const recipes = await getAllRecipes();
  return recipes.find(r => r.id === id);
};

export const upsertRecipe = async (recipe: Recipe): Promise<void> => {
  try {
    const res = await fetch(`${API_BASE}/recipes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recipe)
    });
    if (!res.ok) throw new Error('API Error');
  } catch (err) {
    // Fallback
    const recipes = await getAllRecipes();
    const idx = recipes.findIndex(r => r.id === recipe.id);
    if (idx > -1) {
        recipes[idx] = recipe;
    } else {
        recipes.unshift(recipe);
    }
    setLocal(LOCAL_KEYS.RECIPES, recipes);
  }
};

export const deleteRecipe = async (id: string): Promise<void> => {
  try {
    const res = await fetch(`${API_BASE}/recipes?id=${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('API Error');
  } catch (err) {
    const recipes = await getAllRecipes();
    const filtered = recipes.filter(r => r.id !== id);
    setLocal(LOCAL_KEYS.RECIPES, filtered);
  }
};

// --- Shopping List ---

export const getShoppingList = async (): Promise<ShoppingItem[]> => {
  try {
    const res = await fetch(`${API_BASE}/shopping`);
    if (!res.ok) throw new Error('API Error');
    return await res.json();
  } catch (err) {
    return getLocal<ShoppingItem[]>(LOCAL_KEYS.SHOPPING, []);
  }
};

export const upsertShoppingItem = async (item: ShoppingItem): Promise<void> => {
  try {
    await fetch(`${API_BASE}/shopping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
  } catch (err) {
    const items = await getShoppingList();
    const idx = items.findIndex(i => i.id === item.id);
    if (idx > -1) items[idx] = item;
    else items.push(item);
    setLocal(LOCAL_KEYS.SHOPPING, items);
  }
};

export const deleteShoppingItem = async (id: string): Promise<void> => {
  try {
      await fetch(`${API_BASE}/shopping?id=${id}`, { method: 'DELETE' });
  } catch (err) {
      const items = await getShoppingList();
      setLocal(LOCAL_KEYS.SHOPPING, items.filter(i => i.id !== id));
  }
};

export const clearShoppingList = async (onlyChecked: boolean = false): Promise<void> => {
  try {
      const param = onlyChecked ? 'checked' : 'true';
      await fetch(`${API_BASE}/shopping?clearAll=${param}`, { method: 'DELETE' });
  } catch (err) {
      if (onlyChecked) {
          const items = await getShoppingList();
          setLocal(LOCAL_KEYS.SHOPPING, items.filter(i => !i.isChecked));
      } else {
          setLocal(LOCAL_KEYS.SHOPPING, []);
      }
  }
};

// --- Meal Plans ---

export const getMealPlans = async (): Promise<MealPlan[]> => {
  try {
    const res = await fetch(`${API_BASE}/plans`);
    if (!res.ok) throw new Error('API Error');
    return await res.json();
  } catch (err) {
    return getLocal<MealPlan[]>(LOCAL_KEYS.PLANS, []);
  }
};

export const upsertMealPlan = async (plan: MealPlan): Promise<void> => {
  try {
    await fetch(`${API_BASE}/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan)
    });
  } catch (err) {
      const plans = await getMealPlans();
      const idx = plans.findIndex(p => p.id === plan.id);
      if (idx > -1) plans[idx] = plan;
      else plans.push(plan);
      setLocal(LOCAL_KEYS.PLANS, plans);
  }
};

export const deleteMealPlan = async (id: string): Promise<void> => {
  try {
      await fetch(`${API_BASE}/plans?id=${id}`, { method: 'DELETE' });
  } catch (err) {
      const plans = await getMealPlans();
      setLocal(LOCAL_KEYS.PLANS, plans.filter(p => p.id !== id));
  }
};

// --- Settings ---

export const getSettings = async (): Promise<AppSettings> => {
  // Settings are always local-first for UI responsiveness, 
  // but could sync to DB if user auth existed.
  return getLocal<AppSettings>(LOCAL_KEYS.SETTINGS, { theme: 'system' });
};

export const saveSettings = async (settings: AppSettings): Promise<void> => {
  setLocal(LOCAL_KEYS.SETTINGS, settings);
};
