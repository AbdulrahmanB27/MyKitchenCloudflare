
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
}

export interface Ingredient {
  id: string;
  amount: number;
  unit: string;
  item: string;
  notes?: string;
  section?: string; // e.g. "For the Sauce"
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
  image?: string;
  
  // Times & Yield
  prepTime?: number; // minutes
  cookTime?: number; // minutes
  servings?: number;

  // Core Content
  ingredients: Ingredient[]; // Main ingredients
  instructions: Instruction[]; // Main instructions
  components: RecipeComponent[]; // Legacy support for Sub-recipes

  // Media
  video?: VideoInfo;

  // Learning & Improvement
  tips: string[];
  mistakes: string[];
  substitutions: string[];

  // Meal Prep
  storageNotes?: string;

  // Meta
  nutrition?: Nutrition;
  source?: RecipeSource;
  reviews: Review[];
  
  // User State
  favorite: boolean;
  archived: boolean;
  
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
}

export interface AppConfig {
  sampleRecipes: Recipe[];
  pinnedTags: string[];
}

export type SortOption = 'name' | 'rating' | 'time' | 'calories';
