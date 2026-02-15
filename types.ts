
export interface Nutrition {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
}

export interface Instruction {
  id: string;
  text: string;
  title?: string;
  timer?: number; // In minutes
  section?: string; // e.g. "For the Sauce"
  tip?: string; // Warning/Tip for the step
  optional?: boolean; // If true, step is not mandatory
}

export interface Ingredient {
  id: string;
  amount: number;
  unit: string;
  item: string;
  notes?: string;
  substitution?: string;
  section?: string; // e.g. "For the Sauce"
  optional?: boolean;
}

export interface Review {
  id: string;
  rating: number; // 1-10
  date: number;
}

export interface RecipeComponent {
  label: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
}

export interface RecipeSource {
  name: string;
  url?: string;
  author?: string;
}

export interface VideoInfo {
  url: string; // YouTube embed or direct link
  note?: string; // e.g. "Skip to 3:20"
}

export type RecipeCategory = 'Entrees' | 'Sides' | 'Desserts';

export interface Recipe {
  id: string;
  name: string;
  description: string;
  category: RecipeCategory;
  tags: string[];
  cookware?: string[]; // New field
  image?: string;
  
  // Times & Yield
  prepTime?: number; // minutes (min or exact)
  prepTimeMax?: number; // minutes (max)
  cookTime?: number; // minutes (min or exact)
  cookTimeMax?: number; // minutes (max)
  
  servings?: number;
  yieldUnit?: string; // e.g. "cookies", "cups", "servings"

  // Core Content
  ingredients: Ingredient[]; // Main ingredients
  instructions: Instruction[]; // Main instructions
  components: RecipeComponent[]; // Legacy support for Sub-recipes

  // Media
  video?: VideoInfo;

  // Meal Prep
  storageNotes?: string;

  // Meta
  nutrition?: Nutrition;
  source?: RecipeSource;
  reviews: Review[];
  
  // User State
  favorite: boolean;
  archived: boolean;
  
  // Sync & Tenants
  shareToFamily: boolean; // Sync to global family DB?
  tenantId?: string; // For future multi-tenancy
  schemaVersion?: number; 
  deleted?: boolean; // Tombstone flag for sync

  // Timestamps
  createdAt: number;
  updatedAt: number;
  lastOpenedAt?: number;
  lastCookedAt?: number;
}

export interface ShoppingItem {
  id: string;
  text: string; // Fallback display
  structured?: {
    amount: number;
    unit: string;
    item: string;
  };
  isChecked: boolean;
  recipeId?: string;
  recipeName?: string;
}

export interface MealPlan {
  id: string; // Composite: "YYYY-MM-DD_slot"
  date: string; // YYYY-MM-DD
  slot: 'breakfast' | 'lunch' | 'dinner';
  recipeId: string;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  autoSync: boolean;
}

export interface AppConfig {
  sampleRecipes: Recipe[];
  pinnedTags: string[];
}

export type SortOption = 'name' | 'rating' | 'time' | 'calories';

export interface SyncQueueItem {
    id: string;
    action: 'upsert' | 'delete';
    data?: Recipe;
    timestamp: number;
}
