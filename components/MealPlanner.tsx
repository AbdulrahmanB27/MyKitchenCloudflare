
import React, { useState, useEffect, useMemo } from 'react';
import { Recipe, MealPlan, Ingredient } from '../types';
import * as db from '../services/db';
import { v4 as uuidv4 } from 'uuid';
import { ChevronLeft, ChevronRight, Plus, Calendar, Search, Trash2, ShoppingCart } from 'lucide-react';

interface MealPlannerProps {
  onOpenMenu: () => void;
  allRecipes: Recipe[];
}

const MealPlanner: React.FC<MealPlannerProps> = ({ onOpenMenu, allRecipes }) => {
  // State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{date: string, slot: 'breakfast'|'lunch'|'dinner'} | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    const data = await db.getMealPlans();
    setPlans(data);
  };

  // --- Date Helpers ---
  const getStartOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is sunday
    return new Date(d.setDate(diff));
  };

  const startOfWeek = getStartOfWeek(currentDate);
  
  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        days.push(d);
    }
    return days;
  }, [startOfWeek]);

  const formatDateKey = (date: Date) => date.toISOString().split('T')[0];

  // --- Handlers ---
  const changeWeek = (delta: number) => {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + (delta * 7));
      setCurrentDate(newDate);
  };

  const openPicker = (dateStr: string, slot: 'breakfast'|'lunch'|'dinner') => {
      setPickerTarget({ date: dateStr, slot });
      setSearchQuery('');
      setIsPickerOpen(true);
  };

  const selectRecipe = async (recipe: Recipe) => {
      if (!pickerTarget) return;
      const id = `${pickerTarget.date}_${pickerTarget.slot}`;
      const newPlan: MealPlan = {
          id,
          date: pickerTarget.date,
          slot: pickerTarget.slot,
          recipeId: recipe.id
      };
      await db.upsertMealPlan(newPlan);
      setPlans(prev => [...prev.filter(p => p.id !== id), newPlan]);
      setIsPickerOpen(false);
  };

  const removePlan = async (id: string) => {
      if (!confirm('Remove this meal?')) return;
      await db.deleteMealPlan(id);
      setPlans(prev => prev.filter(p => p.id !== id));
  };

  const addToShoppingList = async () => {
      // Find plans for current week
      const startStr = formatDateKey(weekDays[0]);
      const endStr = formatDateKey(weekDays[6]);
      
      const weeklyPlans = plans.filter(p => p.date >= startStr && p.date <= endStr);
      
      if (weeklyPlans.length === 0) {
          alert("No meals planned for this week.");
          return;
      }

      if (!confirm(`Add ingredients from ${weeklyPlans.length} meals to shopping list?`)) return;

      let count = 0;
      for (const plan of weeklyPlans) {
          const recipe = allRecipes.find(r => r.id === plan.recipeId);
          if (recipe) {
              // Add ingredients
              let allItems: Ingredient[] = [...recipe.ingredients];
              if (recipe.components) {
                  recipe.components.forEach(c => allItems.push(...c.ingredients));
              }
              
              for (const ing of allItems) {
                  await db.upsertShoppingItem({
                      id: uuidv4(),
                      text: `${ing.amount} ${ing.unit} ${ing.item}`.trim(),
                      structured: {
                          amount: ing.amount,
                          unit: ing.unit,
                          item: ing.item
                      },
                      isChecked: false,
                      recipeId: recipe.id,
                      recipeName: recipe.name
                  });
              }
              count++;
          }
      }
      alert(`Added ingredients from ${count} recipes.`);
  };

  // --- Computed ---
  const getPlanFor = (dateStr: string, slot: string) => {
      return plans.find(p => p.date === dateStr && p.slot === slot);
  };

  const filteredRecipes = useMemo(() => {
      if (!searchQuery) return allRecipes;
      const q = searchQuery.toLowerCase();
      return allRecipes.filter(r => r.name.toLowerCase().includes(q) || r.tags.some(t => t.toLowerCase().includes(q)));
  }, [allRecipes, searchQuery]);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-background-light dark:bg-background-dark">
        <div className="max-w-7xl mx-auto space-y-6">
            
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                 <div className="flex items-center gap-4">
                     <button onClick={onOpenMenu} className="md:hidden p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10">
                         <span className="material-symbols-outlined">menu</span>
                     </button>
                     <div>
                         <h1 className="text-2xl font-bold font-display text-text-main dark:text-white">Meal Calendar</h1>
                         <p className="text-sm text-text-muted">Plan your week ahead</p>
                     </div>
                 </div>
                 
                 <div className="flex items-center gap-2 bg-surface-light dark:bg-surface-dark p-1 rounded-lg border border-border-light dark:border-border-dark shadow-sm">
                     <button onClick={() => changeWeek(-1)} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-md"><ChevronLeft size={20} /></button>
                     <span className="px-4 font-mono font-bold text-sm">
                         {weekDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - {weekDays[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                     </span>
                     <button onClick={() => changeWeek(1)} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-md"><ChevronRight size={20} /></button>
                 </div>

                 <button onClick={addToShoppingList} className="btn-secondary flex items-center gap-2">
                     <ShoppingCart size={16} /> Add Week to List
                 </button>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
                {weekDays.map(day => {
                    const dateStr = formatDateKey(day);
                    const isToday = formatDateKey(new Date()) === dateStr;
                    
                    return (
                        <div key={dateStr} className={`flex flex-col gap-3 min-w-[140px] md:min-w-0 ${isToday ? 'bg-primary/5 rounded-xl -m-2 p-2 ring-1 ring-primary/20' : ''}`}>
                            {/* Day Header */}
                            <div className="text-center p-2 rounded-lg bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark shadow-sm">
                                <span className="block text-xs font-bold uppercase text-text-muted">{day.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                                <span className="block text-lg font-bold text-text-main dark:text-white">{day.getDate()}</span>
                            </div>

                            {/* Slots */}
                            {(['breakfast', 'lunch', 'dinner'] as const).map(slot => {
                                const plan = getPlanFor(dateStr, slot);
                                const recipe = plan ? allRecipes.find(r => r.id === plan.recipeId) : null;
                                
                                return (
                                    <div key={slot} className="flex flex-col">
                                        <span className="text-[10px] font-bold uppercase text-text-muted mb-1 ml-1">{slot}</span>
                                        {recipe ? (
                                            <div className="group relative p-3 rounded-lg bg-surface-light dark:bg-surface-dark border border-primary/30 dark:border-primary/30 shadow-sm hover:shadow-md transition-all">
                                                <button onClick={() => removePlan(plan!.id)} className="absolute top-1 right-1 p-1 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                                                    <Trash2 size={12} />
                                                </button>
                                                <div className="text-sm font-bold text-text-main dark:text-white line-clamp-2 leading-tight mb-1">{recipe.name}</div>
                                                <div className="flex items-center gap-1 text-[10px] text-text-muted">
                                                    <span className="material-symbols-outlined text-[10px]">timer</span>
                                                    {(recipe.prepTime || 0) + (recipe.cookTime || 0)}m
                                                </div>
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={() => openPicker(dateStr, slot)}
                                                className="p-3 rounded-lg border-2 border-dashed border-border-light dark:border-border-dark hover:border-primary hover:bg-primary/5 text-text-muted transition-all flex items-center justify-center gap-1 h-[60px]"
                                            >
                                                <Plus size={16} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>

        {/* Recipe Picker Modal */}
        {isPickerOpen && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsPickerOpen(false)}></div>
                <div className="relative w-full max-w-lg bg-surface-light dark:bg-surface-dark rounded-2xl shadow-xl flex flex-col max-h-[80vh]">
                    <div className="p-4 border-b border-border-light dark:border-border-dark flex justify-between items-center">
                        <h3 className="font-bold text-lg dark:text-white">Select Meal</h3>
                        <button onClick={() => setIsPickerOpen(false)}><span className="material-symbols-outlined">close</span></button>
                    </div>
                    
                    <div className="p-4 border-b border-border-light dark:border-border-dark">
                         <div className="relative">
                             <Search className="absolute left-3 top-2.5 text-text-muted" size={18} />
                             <input 
                                autoFocus
                                type="text" 
                                value={searchQuery} 
                                onChange={e => setSearchQuery(e.target.value)} 
                                placeholder="Search recipes..." 
                                className="w-full pl-10 pr-4 py-2 rounded-lg bg-background-light dark:bg-background-dark border-none focus:ring-2 focus:ring-primary dark:text-white"
                             />
                         </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2">
                        {filteredRecipes.map(recipe => (
                            <button 
                                key={recipe.id} 
                                onClick={() => selectRecipe(recipe)}
                                className="w-full text-left p-3 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg flex items-center gap-3 transition-colors"
                            >
                                <div className="size-10 rounded bg-gray-200 dark:bg-gray-700 bg-cover bg-center shrink-0" style={{ backgroundImage: `url("${recipe.image}")` }}></div>
                                <div>
                                    <div className="font-bold text-sm text-text-main dark:text-white">{recipe.name}</div>
                                    <div className="text-xs text-text-muted">{recipe.category} • {(recipe.prepTime || 0) + (recipe.cookTime || 0)}m</div>
                                </div>
                            </button>
                        ))}
                        {filteredRecipes.length === 0 && <p className="text-center p-4 text-text-muted">No matching recipes.</p>}
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default MealPlanner;
