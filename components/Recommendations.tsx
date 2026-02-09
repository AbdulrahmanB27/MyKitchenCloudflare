
import React, { useState, useMemo } from 'react';
import { Recipe, Ingredient, RecipeCategory } from '../types';
import { Search, Filter, AlertCircle, CheckCircle2, ChevronRight, ChefHat, X, ArrowUpDown } from 'lucide-react';

interface RecommendationsProps {
  onOpenMenu: () => void;
  recipes: Recipe[];
  onOpenRecipe: (recipe: Recipe) => void;
}

const COMMON_SEASONINGS = new Set([
  'salt', 'pepper', 'black pepper', 'kosher salt', 'sea salt', 'white pepper',
  'water', 'ice', 'boiling water', 'cold water',
  'oil', 'olive oil', 'vegetable oil', 'canola oil', 'coconut oil', 'cooking spray', 'sesame oil', 'avocado oil',
  'butter', 'unsalted butter', 'salted butter', 'margarine', 'ghee',
  'sugar', 'brown sugar', 'granulated sugar', 'honey', 'maple syrup', 'agave',
  'flour', 'all-purpose flour', 'cornstarch', 'baking powder', 'baking soda',
  'garlic powder', 'onion powder', 'paprika', 'smoked paprika', 'cumin', 'chili powder', 'cayenne', 'red pepper flakes',
  'oregano', 'dried oregano', 'basil', 'dried basil', 'thyme', 'dried thyme', 'rosemary', 'dried rosemary', 'parsley', 'dried parsley',
  'cinnamon', 'ground cinnamon', 'nutmeg', 'ginger', 'ground ginger', 'vanilla', 'vanilla extract',
  'soy sauce', 'vinegar', 'white vinegar', 'apple cider vinegar', 'balsamic vinegar', 'rice vinegar',
  'ketchup', 'mustard', 'dijon mustard', 'mayonnaise', 'hot sauce', 'sriracha', 'lemon juice', 'lime juice'
]);

type SortOption = 'relevance' | 'time' | 'rating' | 'calories' | 'name';

const Recommendations: React.FC<RecommendationsProps> = ({ onOpenMenu, recipes, onOpenRecipe }) => {
  const [selectedIngredients, setSelectedIngredients] = useState<Set<string>>(new Set());
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [ignoreSeasonings, setIgnoreSeasonings] = useState(true);
  const [showMissingOne, setShowMissingOne] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [filterCategory, setFilterCategory] = useState<RecipeCategory | 'All'>('All');

  // Helper: Normalize string
  const normalize = (s: string) => s.trim().toLowerCase();

  const isSeasoning = (name: string) => {
    const norm = name.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    if (COMMON_SEASONINGS.has(norm)) return true;
    return Array.from(COMMON_SEASONINGS).some(s => norm === s || norm === `${s}s`);
  };

  // 1. Extract all unique ingredients from recipes (filtered by category)
  const allIngredientNames = useMemo(() => {
    const set = new Set<string>();
    const filteredRecipes = filterCategory === 'All' ? recipes : recipes.filter(r => r.category === filterCategory);
    
    filteredRecipes.forEach(r => {
        r.ingredients.forEach(i => {
            if (i.item) set.add(normalize(i.item));
        });
        r.components?.forEach(c => {
            c.ingredients.forEach(i => {
                if (i.item) set.add(normalize(i.item));
            });
        });
    });
    return Array.from(set).sort();
  }, [recipes, filterCategory]);

  // 2. Filter ingredients for the selection UI
  const visibleIngredients = useMemo(() => {
      return allIngredientNames.filter(name => {
          // If ignoring seasonings, hide them from the selection list to reduce clutter
          // (Logic: User is assumed to have them, or they don't count towards matching)
          if (ignoreSeasonings && isSeasoning(name)) return false;
          
          if (ingredientSearch) {
              return name.includes(normalize(ingredientSearch));
          }
          return true;
      });
  }, [allIngredientNames, ingredientSearch, ignoreSeasonings]);

  // Helper to check if a recipe ingredient matches the user's selected set
  const checkIngredientMatch = (recipeIngName: string, userSet: Set<string>) => {
    const norm = normalize(recipeIngName);
    
    // 1. Direct match
    if (userSet.has(norm)) return true;

    // 2. Fuzzy match against all user items
    // If user has "Chicken Breast", it should match recipe "Chicken"
    // If user has "Chicken", it should match recipe "Chicken Breast"
    for (const userItem of userSet) {
        if (norm.includes(userItem) || userItem.includes(norm)) return true;
    }
    return false;
  };

  const recommendations = useMemo(() => {
    if (selectedIngredients.size === 0) return [];

    const results: { recipe: Recipe; missing: Ingredient[]; matchedCount: number; totalRequired: number }[] = [];
    const filteredRecipes = filterCategory === 'All' ? recipes : recipes.filter(r => r.category === filterCategory);

    filteredRecipes.forEach(recipe => {
        let allIngredients: Ingredient[] = [...recipe.ingredients];
        if (recipe.components) {
            recipe.components.forEach(c => allIngredients.push(...c.ingredients));
        }

        // Filter relevant ingredients based on settings
        const relevantIngredients = ignoreSeasonings 
            ? allIngredients.filter(ing => !isSeasoning(ing.item))
            : allIngredients;
        
        const totalRequired = relevantIngredients.length;
        if (totalRequired === 0) return; 

        const missing: Ingredient[] = [];
        let matchedCount = 0;

        relevantIngredients.forEach(ing => {
            if (checkIngredientMatch(ing.item, selectedIngredients)) {
                matchedCount++;
            } else {
                missing.push(ing);
            }
        });

        if (missing.length === 0 || (showMissingOne && missing.length === 1)) {
            results.push({
                recipe,
                missing,
                matchedCount,
                totalRequired
            });
        }
    });

    return results.sort((a, b) => {
        // Primary Sort: Availability (0 missing is always better than 1 missing)
        if (a.missing.length !== b.missing.length) {
            return a.missing.length - b.missing.length;
        }

        // Secondary Sort: User Selection
        switch (sortBy) {
            case 'time': {
                // Treat undefined time as really long to push to bottom
                const timeA = (a.recipe.prepTime || 0) + (a.recipe.cookTime || 0) || 9999;
                const timeB = (b.recipe.prepTime || 0) + (b.recipe.cookTime || 0) || 9999;
                return timeA - timeB;
            }
            case 'rating': {
                const getAvg = (r: Recipe) => r.reviews?.length ? r.reviews.reduce((s, x) => s + x.rating, 0) / r.reviews.length : 0;
                return getAvg(b.recipe) - getAvg(a.recipe); // Descending
            }
            case 'calories': {
                const calA = a.recipe.nutrition?.calories || 9999;
                const calB = b.recipe.nutrition?.calories || 9999;
                return calA - calB; // Ascending (Healthy first)
            }
            case 'name': {
                return a.recipe.name.localeCompare(b.recipe.name);
            }
            case 'relevance':
            default:
                return b.matchedCount - a.matchedCount;
        }
    });

  }, [recipes, selectedIngredients, ignoreSeasonings, showMissingOne, sortBy, filterCategory]);

  const toggleSelection = (name: string) => {
      const next = new Set(selectedIngredients);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      setSelectedIngredients(next);
  };

  const clearSelection = () => setSelectedIngredients(new Set());

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-background-light dark:bg-background-dark">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center gap-4 mb-2">
            <button onClick={onOpenMenu} className="md:hidden p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10">
                <span className="material-symbols-outlined">menu</span>
            </button>
            <div>
                <h1 className="text-2xl font-bold font-display text-text-main dark:text-white flex items-center gap-2">
                    <ChefHat className="text-primary" /> What can I make?
                </h1>
                <p className="text-sm text-text-muted">Select ingredients you have to find recipes.</p>
            </div>
        </div>

        {/* Ingredients Selector */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-2xl p-6 shadow-sm border border-border-light dark:border-border-dark space-y-4">
            
            {/* Controls Row */}
            <div className="flex flex-col gap-4">
                 <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                     <div className="relative flex-1 w-full md:max-w-md">
                         <Search className="absolute left-3 top-2.5 text-text-muted" size={18} />
                         <input 
                            type="text" 
                            value={ingredientSearch} 
                            onChange={e => setIngredientSearch(e.target.value)} 
                            placeholder="Search ingredients..." 
                            className="w-full pl-10 pr-4 py-2 rounded-lg bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark focus:ring-2 focus:ring-primary focus:outline-none text-text-main dark:text-white"
                         />
                     </div>
                     
                     <div className="flex flex-wrap gap-2 items-center">
                         {/* Sort Dropdown */}
                         <div className="relative group">
                             <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                                 <ArrowUpDown size={14} className="text-text-muted" />
                             </div>
                             <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as SortOption)}
                                className="pl-8 pr-4 py-2 rounded-lg bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark text-sm font-bold text-text-main dark:text-white focus:ring-2 focus:ring-primary focus:outline-none appearance-none cursor-pointer"
                             >
                                 <option value="relevance">Sort: Relevance</option>
                                 <option value="time">Sort: Fastest</option>
                                 <option value="rating">Sort: Highest Rated</option>
                                 <option value="calories">Sort: Lowest Calories</option>
                                 <option value="name">Sort: Name (A-Z)</option>
                             </select>
                         </div>

                         <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border border-transparent hover:border-border-light dark:hover:border-border-dark select-none">
                            <div className={`w-4 h-4 rounded flex items-center justify-center border ${ignoreSeasonings ? 'bg-primary border-primary' : 'border-gray-300 dark:border-gray-500'}`}>
                                {ignoreSeasonings && <span className="material-symbols-outlined text-white text-[10px]">check</span>}
                            </div>
                            <input type="checkbox" className="hidden" checked={ignoreSeasonings} onChange={e => setIgnoreSeasonings(e.target.checked)} />
                            <span className="text-xs font-bold text-text-main dark:text-gray-200">Ignore Staples</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border border-transparent hover:border-border-light dark:hover:border-border-dark select-none">
                            <div className={`w-4 h-4 rounded flex items-center justify-center border ${showMissingOne ? 'bg-primary border-primary' : 'border-gray-300 dark:border-gray-500'}`}>
                                {showMissingOne && <span className="material-symbols-outlined text-white text-[10px]">check</span>}
                            </div>
                            <input type="checkbox" className="hidden" checked={showMissingOne} onChange={e => setShowMissingOne(e.target.checked)} />
                            <span className="text-xs font-bold text-text-main dark:text-gray-200">Missing 1</span>
                        </label>
                     </div>
                </div>

                {/* Category Filter for Recommendations */}
                <div className="flex gap-2 pb-1 overflow-x-auto no-scrollbar">
                     {['All', 'Entrees', 'Sides', 'Desserts'].map(cat => (
                         <button 
                            key={cat} 
                            onClick={() => setFilterCategory(cat as any)} 
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap border ${
                                filterCategory === cat 
                                    ? 'bg-primary text-white border-primary' 
                                    : 'bg-background-light dark:bg-background-dark text-text-muted border-border-light dark:border-border-dark hover:bg-gray-50 dark:hover:bg-white/5'
                            }`}
                         >
                             {cat}
                         </button>
                     ))}
                </div>
            </div>
            
            <div className="flex items-center justify-between border-t border-border-light dark:border-border-dark pt-4">
                <span className="text-xs font-bold uppercase text-text-muted">{visibleIngredients.length} Ingredients Available</span>
                {selectedIngredients.size > 0 && (
                    <button onClick={clearSelection} className="text-xs font-bold text-red-500 hover:text-red-600 flex items-center gap-1">
                        <X size={14} /> Clear Selection ({selectedIngredients.size})
                    </button>
                )}
            </div>

            {/* Cloud */}
            <div className="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto custom-scrollbar p-1">
                {visibleIngredients.map(ing => {
                    const isSelected = selectedIngredients.has(ing);
                    return (
                        <button
                            key={ing}
                            onClick={() => toggleSelection(ing)}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 border ${
                                isSelected 
                                    ? 'bg-primary text-white border-primary shadow-md shadow-primary/20 scale-105' 
                                    : 'bg-background-light dark:bg-white/5 text-text-main dark:text-gray-300 border-border-light dark:border-gray-700 hover:border-primary/50'
                            }`}
                        >
                            <span className="capitalize">{ing}</span>
                        </button>
                    );
                })}
                {visibleIngredients.length === 0 && (
                    <div className="w-full py-8 text-center text-text-muted text-sm">
                        No ingredients found matching "{ingredientSearch}".
                    </div>
                )}
            </div>

        </div>

        {/* Results */}
        <div className="space-y-4">
            <h2 className="text-lg font-bold text-text-main dark:text-white flex items-center gap-2">
                Matching Recipes
                {selectedIngredients.size > 0 && (
                    <span className="text-xs font-normal bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        {recommendations.length} found
                    </span>
                )}
            </h2>

            {selectedIngredients.size === 0 ? (
                <div className="text-center py-16 opacity-50">
                    <Search className="w-12 h-12 mx-auto mb-4 text-text-muted" />
                    <p>Select ingredients above to see what you can cook!</p>
                </div>
            ) : recommendations.length === 0 ? (
                <div className="text-center py-16 opacity-50">
                    <Filter className="w-12 h-12 mx-auto mb-4 text-text-muted" />
                    <p>No matching recipes found. Try enabling "Missing 1" or adding more ingredients.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {recommendations.map(({ recipe, missing, matchedCount, totalRequired }) => {
                        const isPerfect = missing.length === 0;
                        return (
                            <div 
                                key={recipe.id}
                                onClick={() => onOpenRecipe(recipe)}
                                className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer border border-border-light dark:border-border-dark overflow-hidden flex flex-col h-full animate-in fade-in slide-in-from-bottom-2 duration-300"
                            >
                                <div className="h-32 w-full bg-cover bg-center relative" style={{ backgroundImage: `url("${recipe.image || ''}")` }}>
                                    {!recipe.image && <div className="absolute inset-0 bg-gray-200 dark:bg-gray-800 flex items-center justify-center"><span className="text-2xl">🍳</span></div>}
                                    <div className="absolute top-2 right-2">
                                        {isPerfect ? (
                                            <span className="bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
                                                <CheckCircle2 size={12} /> Ready to Cook
                                            </span>
                                        ) : (
                                            <span className="bg-yellow-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
                                                <AlertCircle size={12} /> Missing 1
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="p-4 flex-1 flex flex-col">
                                    <h3 className="font-bold text-lg text-text-main dark:text-white line-clamp-1 mb-1">{recipe.name}</h3>
                                    <div className="flex items-center gap-2 text-xs text-text-muted mb-3">
                                        <span className="material-symbols-outlined text-[14px]">schedule</span>
                                        {(recipe.prepTime || 0) + (recipe.cookTime || 0)} min
                                    </div>

                                    {!isPerfect && (
                                        <div className="mt-auto bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                                            <p className="text-xs font-bold text-red-600 dark:text-red-400 mb-1 uppercase tracking-wide">Missing Ingredient</p>
                                            <p className="text-sm text-red-800 dark:text-red-200 font-medium flex items-start gap-1 capitalize">
                                                <span className="material-symbols-outlined text-[16px] shrink-0">remove_shopping_cart</span>
                                                {missing[0].item}
                                            </p>
                                        </div>
                                    )}
                                    {isPerfect && (
                                        <div className="mt-auto">
                                            <p className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[16px]">check</span>
                                                All ingredients available
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
        
        <div className="h-10"></div>
        <style>{`
            .custom-scrollbar::-webkit-scrollbar { width: 6px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(156, 163, 175, 0.5); border-radius: 20px; }
            .dark .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(75, 85, 99, 0.5); }
        `}</style>
      </div>
    </div>
  );
};

export default Recommendations;
