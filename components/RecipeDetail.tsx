
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Recipe, Instruction, Ingredient, Review } from '../types';
import * as db from '../services/db';
import { v4 as uuidv4 } from 'uuid';
import CookMode from './CookMode';
import { Play, Square, RotateCcw } from 'lucide-react';

interface RecipeDetailProps {
  recipeId: string;
  onClose: () => void;
  onEdit: (recipe: Recipe) => void;
  onRefreshList: () => void;
}

const RecipeDetail: React.FC<RecipeDetailProps> = ({ recipeId, onClose, onEdit, onRefreshList }) => {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set());
  const [currentServings, setCurrentServings] = useState<number | ''>(1); // Allow empty string state
  const [isCookMode, setIsCookMode] = useState(false);
  
  // Review State
  const [isRatingOpen, setIsRatingOpen] = useState(false);

  // Inline Timers State: Map of step.id -> seconds remaining
  const [activeTimers, setActiveTimers] = useState<{ [key: string]: number }>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const loadData = async () => {
        setLoading(true);
        try {
            const data = await db.getRecipe(recipeId);
            setRecipe(data || null);
        } catch (e) {
            console.error("Error loading recipe", e);
        } finally {
            setLoading(false);
        }
    };
    loadData();
    
    // Init audio for timers
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
  }, [recipeId]);

  useEffect(() => {
    if (recipe) {
      setCurrentServings(recipe.servings || 1);
    }
  }, [recipe]);

  // Timer Countdown Logic
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTimers(prev => {
        const next = { ...prev };
        let hasChanges = false;
        
        Object.keys(next).forEach(key => {
          if (next[key] > 0) {
            next[key]--;
            hasChanges = true;
            
            if (next[key] === 0) {
              // Timer finished
              audioRef.current?.play().catch(() => {});
              if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            }
          }
        });
        
        return hasChanges ? next : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // --- Grouping Logic for View ---
  const groupedIngredients = useMemo(() => {
      if (!recipe) return [];
      const groups = new Map<string, Ingredient[]>();
      
      // 1. Add main ingredients
      recipe.ingredients.forEach(ing => {
          const key = ing.section || 'Main';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(ing);
      });

      // 2. Add legacy components (compatibility)
      if (recipe.components) {
          recipe.components.forEach(comp => {
              groups.set(comp.label, comp.ingredients);
          });
      }

      // Convert to array
      const result: { title: string, items: Ingredient[] }[] = [];
      // Push "Main" or untitled groups first
      if (groups.has('Main')) result.push({ title: 'Main Ingredients', items: groups.get('Main')! });
      
      groups.forEach((items, key) => {
          if (key !== 'Main') result.push({ title: key, items });
      });
      return result;
  }, [recipe]);

  const groupedInstructions = useMemo(() => {
      if (!recipe) return [];
      const groups = new Map<string, Instruction[]>();

      // 1. Add main instructions
      recipe.instructions.forEach(inst => {
          const key = inst.section || 'Main';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(inst);
      });

      // 2. Add legacy components
      if (recipe.components) {
          recipe.components.forEach(comp => {
              groups.set(comp.label, comp.instructions);
          });
      }

      const result: { title: string, steps: Instruction[] }[] = [];
      if (groups.has('Main')) result.push({ title: '', steps: groups.get('Main')! });
      
      groups.forEach((steps, key) => {
          if (key !== 'Main') result.push({ title: key, steps });
      });
      return result;
  }, [recipe]);

  if (loading) return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background-light dark:bg-background-dark">
          <div className="text-primary font-bold">Loading Recipe...</div>
      </div>
  );

  if (!recipe) return null;

  if (isCookMode) {
      return <CookMode recipe={recipe} onClose={() => setIsCookMode(false)} />;
  }

  const originalServings = recipe.servings || 1;
  const scalingFactor = (typeof currentServings === 'number' && currentServings > 0) ? (currentServings / originalServings) : 1;

  const toggleIngredient = (id: string) => {
    const next = new Set(checkedIngredients);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCheckedIngredients(next);
  };

  const copyToClipboard = () => {
    const json = JSON.stringify(recipe, null, 2);
    navigator.clipboard.writeText(json).then(() => alert('Recipe JSON copied!'));
  };

  const handleShare = async () => {
    let shareText = `${recipe.name}\n${recipe.description || ''}\n\n`;
    
    shareText += `Prep: ${recipe.prepTime}m | Cook: ${recipe.cookTime}m | Servings: ${recipe.servings}\n\n`;
    
    shareText += `INGREDIENTS\n`;
    
    // Main
    if (recipe.ingredients.length > 0) {
        recipe.ingredients.forEach(i => {
           shareText += `• ${i.amount > 0 ? i.amount : ''} ${i.unit || ''} ${i.item} ${i.notes ? `(${i.notes})` : ''}\n`;
        });
    }
    // Components
    if (recipe.components) {
        recipe.components.forEach(c => {
            shareText += `\n${c.label}:\n`;
            c.ingredients.forEach(i => {
                shareText += `• ${i.amount > 0 ? i.amount : ''} ${i.unit || ''} ${i.item} ${i.notes ? `(${i.notes})` : ''}\n`;
            });
        });
    }

    shareText += `\nINSTRUCTIONS\n`;
    
    let stepCount = 1;
    // Main
    if (recipe.instructions.length > 0) {
        recipe.instructions.forEach(i => {
            const txt = typeof i === 'string' ? i : i.text;
            shareText += `${stepCount}. ${txt}\n`;
            stepCount++;
        });
    }
    // Components
    if (recipe.components) {
        recipe.components.forEach(c => {
            shareText += `\n${c.label}:\n`;
            c.instructions.forEach(i => {
                const txt = typeof i === 'string' ? i : i.text;
                shareText += `${stepCount}. ${txt}\n`;
                stepCount++;
            });
        });
    }

    if (navigator.share) {
        try {
            await navigator.share({
                title: recipe.name,
                text: shareText
            });
        } catch (e) {
            // Ignore aborts
        }
    } else {
        navigator.clipboard.writeText(shareText);
        alert('Recipe details copied to clipboard!');
    }
  };

  const persistUpdate = async (updated: Recipe) => {
      await db.upsertRecipe(updated);
      setRecipe(updated);
      onRefreshList();
  };

  const toggleArchive = async () => {
      const updated = { ...recipe, archived: !recipe.archived };
      await persistUpdate(updated);
  };

  const toggleFavorite = async () => {
      const updated = { ...recipe, favorite: !recipe.favorite };
      await persistUpdate(updated);
  };

  const handleServingsChange = (valStr: string) => {
      if (valStr === '') {
          setCurrentServings('');
          return;
      }
      const num = parseFloat(valStr);
      if (!isNaN(num)) setCurrentServings(num);
  };

  const adjustServings = (delta: number) => {
      const current = (currentServings === '' || currentServings === 0) ? 1 : currentServings;
      const next = Math.max(1, current + delta);
      setCurrentServings(next);
  };

  const handleServingsBlur = () => {
      if (currentServings === '' || currentServings === 0) {
          setCurrentServings(originalServings);
      }
  };

  // Helper to format scaled numbers
  const formatNumber = (num: number): string => {
    const val = num * scalingFactor;
    // Check for fractions
    const decimal = val - Math.floor(val);
    if (Math.abs(decimal - 0.33) < 0.05) return `${Math.floor(val) > 0 ? Math.floor(val) + ' ' : ''}1/3`;
    if (Math.abs(decimal - 0.66) < 0.05) return `${Math.floor(val) > 0 ? Math.floor(val) + ' ' : ''}2/3`;
    if (Math.abs(decimal - 0.25) < 0.05) return `${Math.floor(val) > 0 ? Math.floor(val) + ' ' : ''}1/4`;
    if (Math.abs(decimal - 0.5) < 0.05) return `${Math.floor(val) > 0 ? Math.floor(val) + ' ' : ''}1/2`;
    if (Math.abs(decimal - 0.75) < 0.05) return `${Math.floor(val) > 0 ? Math.floor(val) + ' ' : ''}3/4`;
    
    // Round to 2 decimals if not a clean integer
    if (Math.abs(Math.round(val) - val) < 0.01) return Math.round(val).toString();
    return parseFloat(val.toFixed(2)).toString();
  };

  const renderIngredient = (ing: Ingredient) => {
      return (
          <span>
              <span className="font-bold text-primary dark:text-primary-dark mr-1">{formatNumber(ing.amount)} {ing.unit}</span>
              <span className="text-text-main dark:text-gray-200">{ing.item}</span>
              {ing.notes && <span className="text-text-muted text-sm italic ml-1">({ing.notes})</span>}
          </span>
      );
  };

  const addToShoppingList = async () => {
    // Collect all ingredients including components
    let allItems: Ingredient[] = [...recipe.ingredients];
    if (recipe.components) {
        recipe.components.forEach(c => allItems.push(...c.ingredients));
    }

    const items = allItems.map(ing => {
      const scaledAmount = ing.amount * scalingFactor;
      const displayText = `${parseFloat(scaledAmount.toFixed(2))} ${ing.unit} ${ing.item}`; 
      
      return {
        id: uuidv4(),
        text: displayText,
        structured: {
            amount: scaledAmount,
            unit: ing.unit,
            item: ing.item
        },
        isChecked: false,
        recipeId: recipe.id,
        recipeName: recipe.name
      };
    });
    
    for (const item of items) {
      await db.upsertShoppingItem(item);
    }
    alert(`Added ${items.length} items to Shopping List`);
  };

  const getInstructionText = (inst: string | Instruction) => typeof inst === 'string' ? inst : inst.text;
  const getInstructionTitle = (inst: string | Instruction) => typeof inst === 'string' ? null : inst.title;
  const getInstructionTimer = (inst: string | Instruction) => typeof inst === 'string' ? null : inst.timer;
  const getInstructionId = (inst: string | Instruction) => typeof inst === 'string' ? null : inst.id;


  const handleRate = async (score: number) => {
      const newReview: Review = {
          id: uuidv4(),
          rating: score,
          date: Date.now()
      };
      const updatedRecipe = {
          ...recipe,
          reviews: [...(recipe.reviews || []), newReview]
      };
      await persistUpdate(updatedRecipe);
      setIsRatingOpen(false);
  };

  const toggleTimer = (stepId: string, minutes: number) => {
      setActiveTimers(prev => {
          const next = { ...prev };
          if (next[stepId] !== undefined) {
              // Stop/Remove timer
              delete next[stepId];
          } else {
              // Start timer
              next[stepId] = minutes * 60;
          }
          return next;
      });
  };

  const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Calculate Average Rating (Scale 1-10)
  const avgRating = recipe.reviews && recipe.reviews.length > 0
    ? (recipe.reviews.reduce((a, b) => a + b.rating, 0) / recipe.reviews.length)
    : 0;

  // Convert to 5-star scale for visual
  const visualStars = avgRating / 2;

  // Calculate global step index for sequential numbering
  let globalStepCounter = 0;

  return (
    <div className="fixed inset-0 z-50 bg-background-light dark:bg-background-dark overflow-y-auto animate-in fade-in duration-200">
        
        {/* Sticky Header */}
        <header className="sticky top-0 z-50 flex w-full items-center justify-between border-b border-border-light dark:border-border-dark bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 md:px-6">
            <div className="flex items-center gap-4">
                <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <h2 className="text-lg font-bold font-display text-text-main dark:text-white line-clamp-1">{recipe.name}</h2>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={() => setIsRatingOpen(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-sm font-medium text-text-muted hover:text-primary transition-colors">
                    <span className="material-symbols-outlined text-[18px]">star</span> Rate
                </button>
                <button onClick={toggleArchive} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-sm font-medium ${recipe.archived ? 'text-primary' : 'text-text-muted'} transition-colors`} title={recipe.archived ? "Unarchive" : "Archive"}>
                    <span className="material-symbols-outlined text-[18px]">{recipe.archived ? 'unarchive' : 'archive'}</span>
                </button>
                <button onClick={() => onEdit(recipe)} className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-sm font-medium">
                    <span className="material-symbols-outlined text-[18px]">edit</span> Edit
                </button>
                <button onClick={toggleFavorite} className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 ${recipe.favorite ? 'text-yellow-500' : 'text-gray-400'}`}>
                    <span className="material-symbols-outlined" style={{ fontVariationSettings: recipe.favorite ? "'FILL' 1" : "'FILL' 0" }}>favorite</span>
                </button>
            </div>
        </header>

        {/* Rating Modal */}
        {isRatingOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setIsRatingOpen(false)}>
                <div className="bg-surface-light dark:bg-surface-dark rounded-xl p-6 w-full max-w-sm border border-border-light dark:border-border-dark shadow-2xl transform scale-100" onClick={e => e.stopPropagation()}>
                    <div className="text-center mb-6">
                        <h3 className="text-xl font-bold font-display mb-1 dark:text-white">Rate this Recipe</h3>
                        <p className="text-sm text-text-muted">How was it? (1-10)</p>
                    </div>
                    <div className="grid grid-cols-5 gap-3 mb-4">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(score => (
                            <button 
                                key={score}
                                onClick={() => handleRate(score)}
                                className="aspect-square flex items-center justify-center rounded-lg border-2 border-border-light dark:border-border-dark hover:border-primary hover:bg-primary/10 hover:text-primary font-bold text-lg transition-all dark:text-white"
                            >
                                {score}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => setIsRatingOpen(false)} className="w-full py-3 rounded-lg bg-gray-100 dark:bg-white/5 text-sm font-bold text-text-muted hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
                        Cancel
                    </button>
                </div>
            </div>
        )}

        <main className="flex flex-col items-center w-full">
            <div className="flex flex-col w-full max-w-[1024px] px-4 md:px-6 py-6 gap-8">
                
                {/* Hero Image */}
                <div className="w-full">
                    <div 
                        className="bg-cover bg-center flex flex-col justify-end overflow-hidden rounded-2xl min-h-[300px] md:min-h-[400px] shadow-lg relative group bg-gray-200 dark:bg-gray-800" 
                        style={{ backgroundImage: `linear-gradient(0deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0) 50%), url("${recipe.image || ''}")` }}
                    >
                        {!recipe.image && (
                            <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                                <span className="material-symbols-outlined text-[64px]">restaurant_menu</span>
                            </div>
                        )}
                        <div className="flex flex-col p-6 md:p-8 gap-2 z-10">
                            <div className="flex gap-2 mb-1">
                                <span className="px-2 py-1 rounded bg-white/20 backdrop-blur-sm text-xs font-semibold text-white uppercase tracking-wider">{recipe.category}</span>
                                {recipe.tags.slice(0, 3).map(tag => (
                                    <span key={tag} className="px-2 py-1 rounded bg-white/20 backdrop-blur-sm text-xs font-semibold text-white uppercase tracking-wider">{tag}</span>
                                ))}
                                {recipe.archived && (
                                    <span className="px-2 py-1 rounded bg-white/20 backdrop-blur-sm text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[14px]">archive</span> Archived
                                    </span>
                                )}
                            </div>
                            <h1 className="text-white text-3xl md:text-5xl font-bold font-display leading-tight drop-shadow-sm">{recipe.name}</h1>
                            <div className="flex items-center gap-2 text-white/90 text-sm">
                                <div className="flex text-yellow-400">
                                    {[1,2,3,4,5].map(i => (
                                        <span key={i} className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: `'FILL' ${i <= Math.round(visualStars) ? 1 : 0}` }}>star</span>
                                    ))}
                                </div>
                                <span className="font-bold">
                                    {avgRating > 0 ? `${avgRating.toFixed(1)}/10 (${recipe.reviews?.length || 0})` : 'No ratings'}
                                </span>
                            </div>
                            <p className="text-gray-200 text-sm md:text-base max-w-2xl line-clamp-2 mt-2">{recipe.description}</p>
                        </div>
                    </div>
                </div>

                {/* Stats & Actions Row */}
                <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
                    {/* Stats */}
                    <div className="flex flex-wrap gap-3 w-full md:w-auto">
                        <div className="flex min-w-[90px] flex-1 md:flex-none flex-col gap-1 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-3 items-center text-center shadow-sm">
                            <p className="text-text-main dark:text-white text-xl font-bold leading-tight">{recipe.prepTime || 0}m</p>
                            <div className="flex items-center gap-1 text-text-muted">
                                <span className="material-symbols-outlined text-[16px]">schedule</span>
                                <p className="text-xs font-medium uppercase tracking-wide">Prep</p>
                            </div>
                        </div>
                        <div className="flex min-w-[90px] flex-1 md:flex-none flex-col gap-1 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-3 items-center text-center shadow-sm">
                            <p className="text-text-main dark:text-white text-xl font-bold leading-tight">{recipe.cookTime || 0}m</p>
                            <div className="flex items-center gap-1 text-text-muted">
                                <span className="material-symbols-outlined text-[16px]">outdoor_grill</span>
                                <p className="text-xs font-medium uppercase tracking-wide">Cook</p>
                            </div>
                        </div>
                        <div className="flex min-w-[90px] flex-1 md:flex-none flex-col gap-1 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-3 items-center text-center shadow-sm">
                            <p className="text-text-main dark:text-white text-xl font-bold leading-tight">{originalServings}</p>
                            <div className="flex items-center gap-1 text-text-muted">
                                <span className="material-symbols-outlined text-[16px]">restaurant</span>
                                <p className="text-xs font-medium uppercase tracking-wide">Yield</p>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-4 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 items-center no-scrollbar">
                        <button onClick={() => setIsCookMode(true)} className="flex items-center gap-2 bg-accent-light dark:bg-accent-dark hover:bg-primary hover:text-white text-primary dark:text-primary-dark dark:hover:text-white font-medium py-2 px-4 rounded-xl transition-all group shadow-sm h-[60px] whitespace-nowrap">
                            <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
                            <span className="text-sm">Start Cooking</span>
                        </button>
                        <div className="h-8 w-[1px] bg-gray-200 dark:bg-white/10 hidden md:block"></div>
                        <div className="flex gap-2">
                             <button onClick={handleShare} className="flex flex-col items-center justify-center gap-1 min-w-[64px] group">
                                <div className="rounded-full bg-accent-light dark:bg-accent-dark p-2.5 group-hover:bg-primary/20 transition-colors">
                                    <span className="material-symbols-outlined text-text-main dark:text-white text-[20px]">share</span>
                                </div>
                                <span className="text-text-main dark:text-gray-300 text-[10px] font-medium uppercase">Share</span>
                            </button>
                             <button onClick={() => window.print()} className="flex flex-col items-center justify-center gap-1 min-w-[64px] group">
                                <div className="rounded-full bg-accent-light dark:bg-accent-dark p-2.5 group-hover:bg-primary/20 transition-colors">
                                    <span className="material-symbols-outlined text-text-main dark:text-white text-[20px]">print</span>
                                </div>
                                <span className="text-text-main dark:text-gray-300 text-[10px] font-medium uppercase">Print</span>
                            </button>
                            <button onClick={copyToClipboard} className="flex flex-col items-center justify-center gap-1 min-w-[64px] group">
                                <div className="rounded-full bg-accent-light dark:bg-accent-dark p-2.5 group-hover:bg-primary/20 transition-colors">
                                    <span className="material-symbols-outlined text-text-main dark:text-white text-[20px]">data_object</span>
                                </div>
                                <span className="text-text-main dark:text-gray-300 text-[10px] font-medium uppercase">JSON</span>
                            </button>
                        </div>
                    </div>
                </div>

                <hr className="border-border-light dark:border-border-dark w-full"/>

                {/* Main Content: Ingredients & Instructions */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
                    
                    {/* Left Column: Ingredients */}
                    <div className="lg:col-span-4 flex flex-col gap-6 order-2 lg:order-1">
                         <div className="flex flex-col gap-4 bg-accent-light/30 dark:bg-accent-dark/30 p-4 rounded-xl border border-border-light dark:border-border-dark">
                             <div className="flex items-center justify-between">
                                 <h4 className="font-bold text-text-main dark:text-white flex items-center gap-2">
                                     <span className="material-symbols-outlined text-primary">layers</span> Scale Recipe
                                 </h4>
                             </div>
                             
                             {/* Custom Scaling Input */}
                             <div className={`flex items-center bg-white dark:bg-surface-dark rounded-lg border shadow-sm ${currentServings === '' || currentServings === 0 ? 'border-red-400' : 'border-border-light dark:border-border-dark'}`}>
                                 <button 
                                    onClick={() => adjustServings(-1)}
                                    className="p-3 md:p-4 text-text-muted hover:text-primary hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border-r border-border-light dark:border-border-dark rounded-l-lg"
                                    aria-label="Decrease servings"
                                 >
                                    <span className="material-symbols-outlined">remove</span>
                                 </button>
                                 
                                 <div className="flex-1 flex flex-col items-center justify-center py-1">
                                     <label className="text-[10px] uppercase font-bold text-text-muted">Servings</label>
                                     <div className="flex items-baseline gap-1">
                                         <input 
                                            type="number" 
                                            min="0.5"
                                            step="0.5"
                                            value={currentServings}
                                            onChange={(e) => handleServingsChange(e.target.value)}
                                            onBlur={handleServingsBlur}
                                            className="w-16 bg-transparent border-none p-0 text-xl font-bold focus:ring-0 text-text-main dark:text-white text-center"
                                         />
                                         {scalingFactor !== 1 && (
                                             <span className="text-xs font-medium text-text-muted">
                                                 ({scalingFactor.toFixed(2)}x)
                                             </span>
                                         )}
                                     </div>
                                 </div>

                                 <button 
                                    onClick={() => adjustServings(1)}
                                    className="p-3 md:p-4 text-text-muted hover:text-primary hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border-l border-border-light dark:border-border-dark rounded-r-lg"
                                    aria-label="Increase servings"
                                 >
                                    <span className="material-symbols-outlined">add</span>
                                 </button>
                             </div>

                             <div className="flex items-center justify-between mt-2">
                                <h3 className="text-xl font-bold text-text-main dark:text-white">Ingredients</h3>
                             </div>
                             <button onClick={addToShoppingList} className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-green-600 text-white font-medium py-3 px-4 rounded-xl transition-all active:scale-[0.98] shadow-md shadow-primary/20">
                                <span className="material-symbols-outlined text-[20px]">shopping_cart</span> Add to List
                            </button>
                         </div>

                         {/* Ingredient Lists */}
                         <div className="flex flex-col gap-4">
                             {groupedIngredients.map((group, gIdx) => (
                                 <details key={`grp-${gIdx}`} className="group bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden" open>
                                     <summary className="flex items-center justify-between p-4 cursor-pointer bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                                         <span className="font-bold text-text-main dark:text-white">{group.title}</span>
                                         <span className="material-symbols-outlined transition-transform group-open:rotate-180 text-gray-500">expand_more</span>
                                     </summary>
                                     <div className="flex flex-col p-2 pt-0">
                                         {group.items.map((ing, idx) => (
                                             <label key={`${group.title}-${idx}`} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer transition-all group/item">
                                                 <div className="relative flex items-center pt-1">
                                                    <input type="checkbox" checked={checkedIngredients.has(`${group.title}-${ing.id}`)} onChange={() => toggleIngredient(`${group.title}-${ing.id}`)} className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-gray-300 dark:border-gray-600 checked:bg-primary checked:border-primary transition-all" />
                                                    <span className="material-symbols-outlined absolute pointer-events-none opacity-0 peer-checked:opacity-100 text-white text-[16px] left-[2px] top-[5px]">check</span>
                                                 </div>
                                                 <div className="flex-1">
                                                     <p className={`text-sm md:text-base font-medium transition-colors ${checkedIngredients.has(`${group.title}-${ing.id}`) ? 'line-through opacity-50' : ''}`}>
                                                         {renderIngredient(ing)}
                                                     </p>
                                                 </div>
                                             </label>
                                         ))}
                                     </div>
                                 </details>
                             ))}
                         </div>
                    </div>

                    {/* Right Column: Instructions, Media */}
                    <div className="lg:col-span-8 flex flex-col gap-8 order-1 lg:order-2">
                        
                        {/* Video */}
                        {recipe.video?.url && (
                             <div className="w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-lg border border-border-light dark:border-border-dark">
                                <iframe src={recipe.video.url} className="w-full h-full" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
                            </div>
                        )}

                        {/* Instructions */}
                        <div>
                             <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold font-display text-text-main dark:text-white">Focused Instructions</h3>
                                <span className="text-xs font-medium text-text-muted">{recipe.instructions.length + (recipe.components?.reduce((a, b) => a + b.instructions.length, 0) || 0)} steps</span>
                            </div>

                            <div className="flex flex-col gap-10">
                                {groupedInstructions.map((group, gIdx) => (
                                    <div key={gIdx}>
                                        {group.title && (
                                            <h4 className="text-lg font-bold font-display text-text-main dark:text-white mb-6 border-b border-border-light dark:border-border-dark pb-2">
                                                {group.title}
                                            </h4>
                                        )}
                                        <div className="flex flex-col gap-8">
                                            {group.steps.map((step, idx) => {
                                                const text = getInstructionText(step);
                                                const title = getInstructionTitle(step);
                                                const timerDuration = getInstructionTimer(step);
                                                const stepId = getInstructionId(step) || `${gIdx}-${idx}`; // Fallback ID if string
                                                globalStepCounter++;
                                                
                                                const timeRemaining = activeTimers[stepId];
                                                const isActive = timeRemaining !== undefined;

                                                return (
                                                    <div key={idx} className="flex gap-4 relative group">
                                                        <div className="flex-none z-10">
                                                            <div className="flex items-center justify-center size-10 rounded-full bg-surface-light dark:bg-surface-dark border-2 border-border-light dark:border-gray-600 text-gray-500 font-bold group-hover:border-primary group-hover:text-primary transition-colors shadow-sm">
                                                                {globalStepCounter}
                                                            </div>
                                                        </div>
                                                        {/* Connecting Line */}
                                                        {idx !== group.steps.length - 1 && (
                                                            <div className="absolute left-[19px] top-10 bottom-[-32px] w-[2px] bg-border-light dark:bg-white/5"></div>
                                                        )}
                                                        <div className="flex flex-col gap-2 pt-1 pb-4 flex-1">
                                                            {title && <h4 className="font-bold text-lg text-text-main dark:text-white">{title}</h4>}
                                                            <p className="text-lg text-text-main dark:text-gray-200 leading-relaxed font-medium group-hover:text-black dark:group-hover:text-white transition-colors">
                                                                {text}
                                                            </p>
                                                            {timerDuration !== undefined && timerDuration !== null && (
                                                                <button 
                                                                    onClick={() => toggleTimer(stepId, timerDuration)}
                                                                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold w-fit transition-all ${
                                                                        isActive 
                                                                            ? timeRemaining === 0 
                                                                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 animate-pulse'
                                                                                : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' 
                                                                            : 'bg-primary/10 text-primary hover:bg-primary/20'
                                                                    }`}
                                                                >
                                                                    {isActive ? (
                                                                        <>
                                                                            {timeRemaining === 0 ? <RotateCcw size={16} /> : <Square size={16} fill="currentColor" />}
                                                                            {timeRemaining === 0 ? "Done! Reset?" : formatTime(timeRemaining)}
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <Play size={16} fill="currentColor" />
                                                                            Start Timer ({timerDuration}m)
                                                                        </>
                                                                    )}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* Storage & Info Block (Moved to Bottom) */}
                <div className="w-full bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/20 rounded-xl p-5 shadow-sm mt-4">
                    <div className="flex flex-col sm:flex-row gap-6">
                        <div className="flex-1 flex flex-col gap-3">
                            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 mb-1">
                                <span className="material-symbols-outlined">inventory_2</span>
                                <h3 className="font-bold text-lg font-display">Storage & Reheating</h3>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                {recipe.storageNotes || "No storage instructions provided. Generally keeps for 3-4 days in the fridge."}
                            </p>
                        </div>
                    </div>
                </div>
                
                <div className="h-10"></div>
            </div>
        </main>
    </div>
  );
};

export default RecipeDetail;
