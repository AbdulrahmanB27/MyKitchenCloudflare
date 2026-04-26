
import React, { useState, useMemo, useEffect } from 'react';
import { Recipe, Ingredient, RecipeCategory } from '../types';
import { sanitize } from '../utils/validation';
import { COMMON_SEASONINGS, normalize, isSeasoning, checkIngredientMatch } from '../utils/ingredients';
import * as db from '../services/db';
import { Search, Filter, AlertCircle, CheckCircle2, ChevronRight, ChefHat, X, UtensilsCrossed } from 'lucide-react';
import Checkbox from './Checkbox';
import SortMenu from './SortMenu';

interface RecommendationsProps {
  onOpenMenu: () => void;
  recipes: Recipe[];
  onOpenRecipe: (recipe: Recipe) => void;
}

type SortOption = 'relevance' | 'time' | 'rating' | 'calories' | 'name';

const Recommendations: React.FC<RecommendationsProps> = ({ onOpenMenu, recipes, onOpenRecipe }) => {
  const [selectedIngredients, setSelectedIngredients] = useState<Set<string>>(new Set());
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [ignoreSeasonings, setIgnoreSeasonings] = useState(true);
  const [showMissingOne, setShowMissingOne] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [filterCategory, setFilterCategory] = useState<RecipeCategory | 'All'>('All');

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
      const cleanSearch = sanitize(ingredientSearch).toLowerCase();
      return allIngredientNames.filter(name => {
          // If ignoring seasonings, hide them from the selection list to reduce clutter
          // (Logic: User is assumed to have them, or they don't count towards matching)
          if (ignoreSeasonings && isSeasoning(name)) return false;
          
          if (cleanSearch) {
              return name.includes(cleanSearch);
          }
          return true;
      });
  }, [allIngredientNames, ingredientSearch, ignoreSeasonings]);

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
        
        // Count only mandatory ingredients as "required" for matching calculation
        const totalRequired = relevantIngredients.filter(i => !i.optional).length;
        
        // If there are no mandatory ingredients, the recipe is technically always matchable if ingredients list isn't empty
        if (totalRequired === 0 && relevantIngredients.length > 0) {
            // Edge case: All optional ingredients.
        }

        const missing: Ingredient[] = [];
        let matchedCount = 0;

        relevantIngredients.forEach(ing => {
            if (checkIngredientMatch(ing.item, selectedIngredients)) {
                matchedCount++;
            } else {
                // Only count as missing if NOT optional
                if (!ing.optional) {
                    missing.push(ing);
                }
            }
        });

        // "Missing One" logic relies on the missing array which now excludes optional items
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
                const getAvg = (r: Recipe) => r.averageRating || 0;
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

  useEffect(() => {
      const saved = db.getAvailableIngredients();
      if (saved && saved.length > 0) {
          setSelectedIngredients(new Set(saved));
      }
  }, []);

  const toggleSelection = (name: string) => {
      const next = new Set<string>(selectedIngredients);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      setSelectedIngredients(next);
      db.saveAvailableIngredients(Array.from(next));
  };

  const clearSelection = () => {
      setSelectedIngredients(new Set());
      db.saveAvailableIngredients([]);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-bg-white dark:bg-bg-dark">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center gap-4 mb-2">
            <button onClick={onOpenMenu} className="md:hidden p-2 rounded-full hover:bg-bg-subtle dark:hover:bg-white/10">
                <span className="material-symbols-outlined">menu</span>
            </button>
            <div>
                <h1 className="text-2xl font-bold font-display text-text-main dark:text-white flex items-center gap-2">
                    <ChefHat className="text-forest-green dark:text-accent-herb" /> What can I make?
                </h1>
                <p className="text-sm text-text-secondary">Select ingredients you have to find recipes.</p>
            </div>
        </div>

        {/* Ingredients Selector */}
        <div className="bg-white dark:bg-card-dark rounded-2xl p-6 shadow-sm space-y-4">
            
            {/* Controls Row */}
            <div className="flex flex-col gap-4">
                 <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                     <div className="relative flex-1 w-full md:max-w-md">
                         <Search className="absolute left-3 top-2.5 text-text-secondary" size={18} />
                         <input 
                            type="text" 
                            value={ingredientSearch} 
                            onChange={e => setIngredientSearch(e.target.value)} 
                            placeholder="Search ingredients..." 
                            className="w-full pl-10 pr-4 py-2 rounded-lg bg-bg-subtle dark:bg-bg-dark border border-border-thin dark:border-border-dark focus:ring-2 focus:ring-forest-green dark:focus:ring-accent-herb focus:outline-none text-text-main dark:text-white placeholder:text-text-secondary"
                         />
                     </div>
                     
                     <div className="flex flex-wrap gap-2 items-center">
                         {/* Sort Dropdown */}
                         <SortMenu 
                             align="left"
                             currentSort={sortBy} 
                             onSortChange={(val) => setSortBy(val as SortOption)}  
                             options={[
                                 { label: 'Relevance', value: 'relevance' },
                                 { label: 'Fastest', value: 'time' },
                                 { label: 'Top Rated', value: 'rating' },
                                 { label: 'Lowest Calories', value: 'calories' },
                                 { label: 'Name (A-Z)', value: 'name' }
                             ]}
                         />

                          <Checkbox 
                            checked={ignoreSeasonings} 
                            onChange={setIgnoreSeasonings} 
                            label="Ignore Staples" 
                            size="sm"
                        />

                        <Checkbox 
                            checked={showMissingOne} 
                            onChange={setShowMissingOne} 
                            label="Missing 1" 
                            size="sm"
                        />
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
                                    ? 'bg-forest-green dark:bg-accent-herb text-white dark:text-black border-forest-green dark:border-accent-herb' 
                                    : 'bg-bg-subtle dark:bg-bg-dark text-text-secondary border-border-thin dark:border-border-dark hover:bg-bg-subtle dark:hover:bg-white/5'
                            }`}
                         >
                             {cat}
                         </button>
                     ))}
                </div>
            </div>
            
            <div className="flex items-center justify-between border-t border-border-thin dark:border-border-dark pt-4">
                <span className="text-xs font-bold uppercase text-text-secondary">{visibleIngredients.length} Ingredients Available</span>
                {selectedIngredients.size > 0 && (
                    <button 
                        onClick={clearSelection} 
                        className="px-3 py-1.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 text-xs font-bold rounded-lg flex items-center gap-1 transition-colors"
                    >
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
                                    ? 'bg-forest-green dark:bg-accent-herb text-white dark:text-black border-forest-green dark:border-accent-herb shadow-md shadow-black/10 scale-105' 
                                    : 'bg-bg-subtle dark:bg-white/5 text-text-main dark:text-gray-300 border-border-thin dark:border-gray-700 hover:border-forest-green/50 dark:hover:border-accent-herb/50'
                            }`}
                        >
                            <span className="capitalize">{ing}</span>
                        </button>
                    );
                })}
                {visibleIngredients.length === 0 && (
                    <div className="w-full py-8 text-center text-text-secondary text-sm">
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
                    <span className="text-xs font-normal bg-forest-green/10 dark:bg-accent-herb/10 text-forest-green dark:text-accent-herb px-2 py-0.5 rounded-full">
                        {recommendations.length} found
                    </span>
                )}
            </h2>

            {selectedIngredients.size === 0 ? (
                <div className="text-center py-16 opacity-50">
                    <Search className="w-12 h-12 mx-auto mb-4 text-text-secondary" />
                    <p className="text-text-secondary">Select ingredients above to see what you can cook!</p>
                </div>
            ) : recommendations.length === 0 ? (
                <div className="text-center py-16 opacity-50">
                    <Filter className="w-12 h-12 mx-auto mb-4 text-text-secondary" />
                    <p className="text-text-secondary">No matching recipes found. Try enabling "Missing 1" or adding more ingredients.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {recommendations.map(({ recipe, missing, matchedCount, totalRequired }) => {
                        const isPerfect = missing.length === 0;
                        return (
                            <div 
                                key={recipe.id}
                                onClick={() => onOpenRecipe(recipe)}
                                className="bg-white dark:bg-card-dark rounded-xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer overflow-hidden flex flex-col h-full animate-in fade-in slide-in-from-bottom-2 duration-300"
                            >
                                <div className="h-32 w-full bg-cover bg-center relative" style={{ backgroundImage: `url("${recipe.image || ''}")` }}>
                                    {!recipe.image && (
                                        <div className="absolute inset-0 bg-gray-100 dark:bg-[#2d333f] text-gray-400 dark:text-[#4a5568] flex items-center justify-center">
                                            <UtensilsCrossed size={32} strokeWidth={1.5} />
                                        </div>
                                    )}
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
                                    <div className="flex items-center gap-2 text-xs text-text-secondary mb-3">
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
