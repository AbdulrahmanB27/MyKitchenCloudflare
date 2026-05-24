
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Recipe, Instruction, Ingredient, Review } from '../types';
import * as db from '../services/db';
import { v4 as uuidv4 } from 'uuid';
import CookMode from './CookMode';
import { Play, Square, RotateCcw, Lightbulb, Bell, Clock, CookingPot, AlertCircle, ExternalLink, User, Share, Users, Check, X, Link as LinkIcon, FileText, Heart } from 'lucide-react';
import Checkbox from './Checkbox';
import { formatFraction } from '../utils/format';

interface RecipeDetailProps {
  recipeId: string;
  mergedTenantIds?: string[];
  onClose: () => void;
  isCookMode: boolean;
  setIsCookMode: (val: boolean) => void;
  onEdit: (recipe: Recipe) => void;
  onRefreshList: () => void;
  showToast?: (message: string, type?: 'success' | 'error') => void;
  showAlert?: (title: string, message: string, onConfirm?: () => void) => void;
  showConfirm?: (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => void;
  enableExperimentalVoice?: boolean;
}

interface ActiveTimer {
    startTime: number;
    duration: number;
    notified: boolean;
}

const RecipeDetail: React.FC<RecipeDetailProps> = ({ recipeId, mergedTenantIds, onClose, isCookMode, setIsCookMode, onEdit, onRefreshList, showToast, showAlert, showConfirm, enableExperimentalVoice }) => {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set());
  const [currentServings, setCurrentServings] = useState<number | ''>(1); // Allow empty string state
  
  // Review State
  const [isRatingOpen, setIsRatingOpen] = useState(false);

  // Share State
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [availableSessions, setAvailableSessions] = useState<any[]>([]);

  // Stopwatch Timers State: Map of step.id -> Timer Data
  const [activeTimers, setActiveTimers] = useState<{ [key: string]: ActiveTimer }>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    const loadData = async () => {
        setLoading(true);
        try {
            const data = await db.getRecipe(recipeId);
            setRecipe(data || null);
            setAvailableSessions(db.getSavedSessions());
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

  // Stopwatch Logic
  // We use a state update to force re-render every second, but the source of truth is startTime
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
      
      setActiveTimers(prev => {
        const next = { ...prev };
        let hasChanges = false;
        const currentTime = Date.now();
        
        Object.keys(next).forEach(key => {
            const timer = next[key];
            const elapsed = Math.floor((currentTime - timer.startTime) / 1000);

            // Check for notification trigger (once)
            if (timer.duration > 0 && elapsed >= timer.duration && !timer.notified) {
                audioRef.current?.play().catch(() => {});
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                timer.notified = true;
                hasChanges = true;
            }
        });
        
        return hasChanges ? next : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Escape key listener for modals
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            if (isShareOpen) setIsShareOpen(false);
            if (isRatingOpen) setIsRatingOpen(false);
        }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isShareOpen, isRatingOpen]);

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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-white dark:bg-bg-dark">
          <div className="text-forest-green dark:text-white font-bold">Loading Recipe...</div>
      </div>
  );

  if (!recipe) return null;

  const originalServings = recipe.servings || 1;
  const scalingFactor = (typeof currentServings === 'number' && currentServings > 0) ? (currentServings / originalServings) : 1;

  if (isCookMode) {
      return <CookMode recipe={recipe} scalingFactor={scalingFactor} onClose={() => setIsCookMode(false)} showToast={showToast} showAlert={showAlert} showConfirm={showConfirm} enableExperimentalVoice={enableExperimentalVoice} />;
  }

  const toggleIngredient = (id: string) => {
    const next = new Set(checkedIngredients);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCheckedIngredients(next);
  };

  const getRecipeText = () => {
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
    return shareText;
  };



  async function getShareLinkUrl() {
    const token = await db.shareRecipe(recipe.id);
    const baseUrl = window.location.href.split('?')[0];
    return `${baseUrl}?recipeId=${recipe.id}&share=${token}`;
  };

  async function handleLinkAction(action: 'copy' | 'share') {
    try {
        const url = await getShareLinkUrl();
        if (action === 'copy') {
            navigator.clipboard.writeText(url);
            showToast?.("Public link copied to clipboard!");
            setIsShareOpen(false);
        } else {
            if (navigator.share) {
                await navigator.share({ title: recipe.name, url });
                setIsShareOpen(false);
            } else {
                showToast?.("Sharing not supported on this device");
            }
        }
    } catch (e: any) {
        console.error("Share failed", e);
        const msg = e.message || "Unknown error";
        showToast?.(`Failed to generate link: ${msg}`);
    }
  };

  async function handleTextAction(action: 'copy' | 'share') {
    const text = getRecipeText();
    if (action === 'copy') {
        navigator.clipboard.writeText(text);
        showToast?.("Recipe text copied to clipboard!");
        setIsShareOpen(false);
    } else {
        if (navigator.share) {
            try {
                await navigator.share({ title: recipe.name, text });
                setIsShareOpen(false);
            } catch (e) {
                // Ignore aborts
            }
        } else {
            showToast?.("Sharing not supported on this device");
        }
    }
  };

  async function persistUpdate(updated: Recipe, localOnly = false) {
      await db.upsertRecipe(updated, { localOnly });
      setRecipe(updated);
      onRefreshList();
  };

  async function toggleArchive() {
      const updated = { ...recipe, archived: !recipe.archived };
      await persistUpdate(updated);
  };

  async function toggleFavorite() {
      const updated = { ...recipe, favorite: !recipe.favorite };
      await persistUpdate(updated, true); // Local only!
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

  const renderIngredient = (ing: Ingredient) => {
      const scaledAmount = ing.amount * scalingFactor;
      let secondaryText = '';
      if (ing.secondaryAmount) {
          const scaledSecondary = ing.secondaryAmount * scalingFactor;
          secondaryText = `(${formatFraction(scaledSecondary)} ${ing.secondaryUnit || ''})`.trim();
      }

      return (
          <span>
              <span className="font-bold text-primary dark:text-primary-dark mr-1">{formatFraction(scaledAmount)} {ing.unit}</span>
              {secondaryText && <span className="text-text-muted dark:text-gray-400 text-sm mr-1.5 font-medium">{secondaryText}</span>}
              <span className="text-text-main dark:text-gray-200">{ing.item}</span>
              {ing.notes && <span className="text-text-muted text-sm italic ml-1">({ing.notes})</span>}
              {ing.substitution && <span className="text-text-muted text-sm ml-2 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded">Sub: {ing.substitution}</span>}
              {ing.optional && <span className="text-blue-500 text-[10px] font-bold uppercase ml-2 bg-blue-50 dark:bg-blue-900/10 px-1.5 py-0.5 rounded">Optional</span>}
          </span>
      );
  };

  async function addToShoppingList() {
    // Only collect ingredients that are NOT checked off
    const itemsToAdd: Ingredient[] = [];

    groupedIngredients.forEach(group => {
        group.items.forEach(ing => {
            const key = `${group.title}-${ing.id}`;
            // If checking means "I have this" or "Done", we add items that are NOT in the set
            if (!checkedIngredients.has(key)) {
                itemsToAdd.push(ing);
            }
        });
    });

    if (itemsToAdd.length === 0) {
        showToast?.("No ingredients selected (all checked items were skipped).");
        return;
    }

    const items = itemsToAdd.map(ing => {
      const scaledAmount = ing.amount * scalingFactor;
      const displayText = `${formatFraction(scaledAmount)} ${ing.unit} ${ing.item}`; 
      
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
    showToast?.(`Added ${items.length} items to Shopping List`);
  };

  const getInstructionText = (inst: string | Instruction) => typeof inst === 'string' ? inst : inst.text;
  const getInstructionTitle = (inst: string | Instruction) => typeof inst === 'string' ? null : inst.title;
  const getInstructionTimer = (inst: string | Instruction) => typeof inst === 'string' ? null : inst.timer;
  const getInstructionTip = (inst: string | Instruction) => typeof inst === 'string' ? null : inst.tip;
  const getInstructionOptional = (inst: string | Instruction) => typeof inst === 'string' ? false : inst.optional;
  const getInstructionId = (inst: string | Instruction) => typeof inst === 'string' ? null : inst.id;
  const getInstructionImage = (inst: string | Instruction) => typeof inst === 'string' ? null : inst.image;


  async function handleRate(score: number) {
      const newReview: Review = {
          id: uuidv4(),
          targetId: recipe.id,
          targetType: 'recipe',
          rating: score,
          date: Date.now()
      };
      await db.addReview(newReview);
      
      // Reload to get updated stats
      const updated = await db.getRecipe(recipe.id);
      if (updated) {
          setRecipe(updated);
          onRefreshList();
      }
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
              next[stepId] = {
                  startTime: Date.now(),
                  duration: minutes * 60,
                  notified: false
              };
          }
          return next;
      });
  };

  const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatRange = (min?: number, max?: number) => {
      if (!min && min !== 0) return '0m';
      if (max && max > min) return `${min}-${max}m`;
      return `${min}m`;
  };

  // Calculate Average Rating (Scale 1-10)
  const avgRating = recipe.averageRating || 0;
  const reviewCount = recipe.reviewCount || 0;

  // Convert to 5-star scale for visual
  const visualStars = avgRating / 2;

  // Calculate global step index for sequential numbering
  let globalStepCounter = 0;

  return (
    <div className="recipe-detail-view w-full h-full bg-bg-white dark:bg-bg-dark overflow-y-auto animate-in fade-in duration-200 overscroll-contain pb-24">
        
        {/* Sticky Header */}
        <header className="sticky top-0 z-50 flex w-full items-center justify-between border-b border-forest-green/20 dark:border-white/10 bg-white/95 dark:bg-bg-dark/95 backdrop-blur-md px-4 py-3 md:px-6">
            <div className="flex items-center gap-4">
                <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <h2 className="text-lg font-bold font-display text-text-main dark:text-white line-clamp-1">{recipe.name}</h2>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={toggleArchive} className={`flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-sm font-medium ${recipe.archived ? 'text-forest-green dark:text-accent-herb' : ''} transition-colors`} title={recipe.archived ? "Unarchive" : "Archive"}>
                    <span className="material-symbols-outlined text-[18px]">{recipe.archived ? 'unarchive' : 'archive'}</span>
                </button>
                <button onClick={() => onEdit(recipe)} className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-sm font-medium" title="Edit Recipe">
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                </button>
                <button onClick={() => setIsRatingOpen(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-sm font-medium hover:text-forest-green dark:hover:text-accent-herb transition-colors" title="Rate Recipe">
                    <span className="material-symbols-outlined text-[18px]">star</span>
                </button>
                <button onClick={toggleFavorite} className={`flex items-center justify-center p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 ${recipe.favorite ? 'text-red-500' : 'text-gray-400'}`} title={recipe.favorite ? "Remove from Favorites" : "Add to Favorites"}>
                    <Heart size={20} className={recipe.favorite ? "fill-current" : ""} />
                </button>
            </div>
        </header>

        {/* Rating Modal */}
        {isRatingOpen && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setIsRatingOpen(false)}>
                <div className="bg-white dark:bg-card-dark rounded-xl p-6 w-full max-w-sm border border-border-thin dark:border-border-dark shadow-2xl transform scale-100" onClick={e => e.stopPropagation()}>
                    <div className="text-center mb-6">
                        <h3 className="text-xl font-bold font-display mb-1 dark:text-white">Rate this Recipe</h3>
                        <p className="text-sm text-text-secondary">How was it? (1-10)</p>
                    </div>
                    <div className="grid grid-cols-5 gap-3 mb-4">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(score => (
                            <button 
                                key={score}
                                onClick={() => handleRate(score)}
                                className="aspect-square flex items-center justify-center rounded-lg border-2 border-border-thin dark:border-border-dark hover:border-forest-green dark:hover:border-accent-herb hover:bg-forest-green/5 dark:hover:bg-accent-herb/10 hover:text-forest-green dark:hover:text-accent-herb font-bold text-lg transition-all dark:text-white"
                            >
                                {score}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => setIsRatingOpen(false)} className="w-full py-3 rounded-lg bg-gray-100 dark:bg-white/5 text-sm font-bold text-text-secondary hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
                        Cancel
                    </button>
                </div>
            </div>
        )}

        {/* Share Modal */}
        {isShareOpen && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setIsShareOpen(false)}>
                <div className="bg-white dark:bg-card-dark rounded-xl w-full max-w-sm border border-border-thin dark:border-border-dark shadow-2xl transform scale-100 overflow-hidden" onClick={e => e.stopPropagation()}>
                    
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-border-thin dark:border-border-dark bg-gray-50/50 dark:bg-white/5">
                        <h3 className="text-lg font-bold font-display dark:text-white flex items-center gap-2">
                            <Share size={18} className="text-forest-green dark:text-accent-herb"/> Share Recipe
                        </h3>
                        <button onClick={() => setIsShareOpen(false)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 transition-colors text-text-secondary">
                            <X size={20} />
                        </button>
                    </div>
                    
                    <div className="p-6 flex flex-col gap-4">
                        
                        {/* Copy Link Split Button */}
                        <div className="flex flex-col gap-1">
                            <div className="flex w-full rounded-xl border border-border-thin dark:border-border-dark overflow-hidden shadow-sm group">
                                <button 
                                    onClick={() => handleLinkAction('copy')}
                                    className="flex-1 flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left bg-white dark:bg-card-dark"
                                >
                                    <div className="p-2 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                                        <LinkIcon size={20} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-bold text-text-main dark:text-white text-sm">Copy Link</p>
                                        <p className="text-xs text-text-secondary">Share view-only web link</p>
                                    </div>
                                </button>
                                <div className="w-[1px] bg-border-thin dark:border-border-dark"></div>
                                <button 
                                    onClick={() => handleLinkAction('share')}
                                    className="w-14 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-text-secondary hover:text-forest-green dark:hover:text-accent-herb bg-gray-50/50 dark:bg-white/5"
                                    title="Share Link via..."
                                >
                                    <Share size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Copy Text Split Button */}
                        <div className="flex flex-col gap-1">
                            <div className="flex w-full rounded-xl border border-border-thin dark:border-border-dark overflow-hidden shadow-sm group">
                                <button 
                                    onClick={() => handleTextAction('copy')}
                                    className="flex-1 flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left bg-white dark:bg-card-dark"
                                >
                                    <div className="p-2 rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                                        <FileText size={20} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-bold text-text-main dark:text-white text-sm">Copy Text</p>
                                        <p className="text-xs text-text-secondary">Ingredients & Instructions</p>
                                    </div>
                                </button>
                                <div className="w-[1px] bg-border-thin dark:border-border-dark"></div>
                                <button 
                                    onClick={() => handleTextAction('share')}
                                    className="w-14 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-text-secondary hover:text-forest-green dark:hover:text-accent-herb bg-gray-50/50 dark:bg-white/5"
                                    title="Share Text via..."
                                >
                                    <Share size={20} />
                                </button>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        )}

        <main className="flex flex-col items-center w-full">
            <div className="flex flex-col w-full max-w-[1024px] px-4 md:px-6 py-6 gap-8">
                
                {/* Hero Image */}
                <div className="w-full">
                    <div className="relative group overflow-hidden rounded-2xl min-h-[300px] md:min-h-[400px] shadow-lg bg-gray-100 dark:bg-gray-900">
                        {recipe.image && !imageError ? (
                            <>
                                <img 
                                    src={db.resolveImageUrl(recipe.image)} 
                                    alt={recipe.name}
                                    className="absolute inset-0 w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                    onError={() => setImageError(true)}
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none"></div>
                            </>
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-900 border border-border-thin dark:border-border-dark">
                                <span className="material-symbols-outlined text-[64px]">restaurant_menu</span>
                                <span className="mt-2 text-sm font-medium opacity-50 uppercase tracking-widest">{recipe.category}</span>
                            </div>
                        )}
                        
                        <div className="absolute inset-x-0 bottom-0 flex flex-col p-6 md:p-8 gap-2 z-10">
                            <div className="flex gap-2 mb-1">
                                {availableSessions.length > 1 && recipe.shareToFamily && (
                                    <span className="px-2 py-1 rounded bg-primary/80 backdrop-blur-sm text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1">
                                        <Users size={12} />
                                        {mergedTenantIds && mergedTenantIds.length > 0 
                                            ? mergedTenantIds.map(tid => availableSessions.find(s => s.id === tid)?.name || 'Unknown').join(', ')
                                            : recipe.tenantIds && recipe.tenantIds.length > 0 
                                                ? recipe.tenantIds.map(tid => availableSessions.find(s => s.id === tid)?.name || 'Unknown').join(', ')
                                                : availableSessions.find(s => s.id === recipe.familyId)?.name || 'Family'
                                        }
                                    </span>
                                )}
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
                                    {avgRating > 0 ? `${avgRating.toFixed(1)}/10 (${reviewCount})` : 'No ratings'}
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
                        <div className="flex min-w-[90px] flex-1 md:flex-none flex-col gap-1 rounded-xl border border-forest-green/20 dark:border-white/10 bg-white dark:bg-card-dark p-3 items-center text-center shadow-sm">
                            <p className="text-text-main dark:text-white text-xl font-bold leading-tight">{formatRange(recipe.prepTime, recipe.prepTimeMax)}</p>
                            <div className="flex items-center gap-1 text-forest-green dark:text-accent-herb">
                                <span className="material-symbols-outlined text-[16px]">schedule</span>
                                <p className="text-xs font-medium uppercase tracking-wide">Prep</p>
                            </div>
                        </div>
                        <div className="flex min-w-[90px] flex-1 md:flex-none flex-col gap-1 rounded-xl border border-forest-green/20 dark:border-white/10 bg-white dark:bg-card-dark p-3 items-center text-center shadow-sm">
                            <p className="text-text-main dark:text-white text-xl font-bold leading-tight">{formatRange(recipe.cookTime, recipe.cookTimeMax)}</p>
                            <div className="flex items-center gap-1 text-forest-green dark:text-accent-herb">
                                <span className="material-symbols-outlined text-[16px]">outdoor_grill</span>
                                <p className="text-xs font-medium uppercase tracking-wide">Cook</p>
                            </div>
                        </div>
                        <div className="flex min-w-[80px] flex-1 md:flex-none flex-col gap-1 rounded-xl border border-forest-green/20 dark:border-white/10 bg-white dark:bg-card-dark p-3 items-center text-center shadow-sm">
                            <div className="text-text-main dark:text-white text-xl font-bold leading-tight flex flex-col items-center">
                                <span>{originalServings}</span>
                                <span className="text-[10px] sm:text-xs font-normal text-text-secondary dark:text-text-secondary-dark block mt-0.5">{recipe.yieldUnit || 'srv'}</span>
                            </div>
                            <div className="flex items-center gap-1 text-forest-green dark:text-accent-herb">
                                <span className="material-symbols-outlined text-[16px]">restaurant</span>
                                <p className="text-xs font-medium uppercase tracking-wide">Yield</p>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 w-full md:w-auto items-center">
                        <button onClick={() => setIsCookMode(true)} className="flex items-center gap-2 bg-forest-green hover:bg-green-900 text-white font-medium py-2 px-6 rounded-xl transition-all group shadow-sm h-[50px] whitespace-nowrap">
                            <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
                            <span className="text-sm">Start Cooking</span>
                        </button>
                        
                        <button onClick={() => setIsShareOpen(true)} className="flex flex-col items-center justify-center gap-1 min-w-[64px] group rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 p-2 transition-colors">
                            <div className="rounded-full p-1">
                                <span className="material-symbols-outlined text-text-main dark:text-white text-[24px]">share</span>
                            </div>
                            <span className="text-text-main dark:text-gray-300 text-[10px] font-medium uppercase">Share</span>
                        </button>
                    </div>
                </div>

                <hr className="border-accent-herb dark:border-white/10 w-full"/>

                {/* Required Cookware Section */}
                {recipe.cookware && recipe.cookware.length > 0 && (
                    <div className="flex flex-col gap-3">
                        <h3 className="text-lg font-bold text-text-main dark:text-white flex items-center gap-2">
                             <CookingPot className="text-forest-green dark:text-accent-herb" size={20} />
                             Required Equipment
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {recipe.cookware.map((item, idx) => (
                                <span key={idx} className="px-3 py-1.5 rounded-lg bg-white dark:bg-card-dark border border-forest-green/20 dark:border-white/10 text-sm font-medium text-text-main dark:text-gray-200">
                                    {item}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Main Content: Ingredients & Instructions */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
                    
                    {/* Left Column: Ingredients */}
                    <div className="lg:col-span-4 flex flex-col gap-4">
                         
                         <div className="bg-white dark:bg-card-dark rounded-xl border border-accent-herb dark:border-white/10 overflow-hidden shadow-sm">
                             {/* Header with Scaler */}
                             <div className="flex items-center justify-between p-3 md:p-4 border-b border-accent-herb dark:border-white/10 bg-gray-50/80 dark:bg-white/5 backdrop-blur-sm">
                                <h3 className="font-bold text-forest-green dark:text-white text-lg">Ingredients</h3>
                                
                                {/* Compact Scaling Input */}
                                <div className="flex items-center bg-white dark:bg-white/10 rounded-lg border border-accent-herb dark:border-white/10 overflow-hidden h-10">
                                     <button 
                                        onClick={() => adjustServings(-1)}
                                        className="w-10 h-full flex items-center justify-center text-text-secondary hover:text-forest-green dark:hover:text-accent-herb hover:bg-gray-50 dark:hover:bg-white/10 transition-colors border-r border-accent-herb dark:border-white/10"
                                        aria-label="Decrease servings"
                                     >
                                        <span className="material-symbols-outlined text-[20px]">remove</span>
                                     </button>
                                     
                                     <div className="h-full flex flex-col items-center justify-center w-16">
                                         <input 
                                            type="number" 
                                            min="0.5"
                                            step="0.5"
                                            value={currentServings}
                                            onChange={(e) => handleServingsChange(e.target.value)}
                                            onBlur={handleServingsBlur}
                                            className="w-full bg-transparent border-none p-0 text-lg font-bold focus:ring-0 text-text-main dark:text-white text-center leading-none appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                         />
                                         <span className="text-[10px] uppercase font-bold text-text-secondary dark:text-text-secondary-dark leading-none mt-0.5">{recipe.yieldUnit || 'Srv'}</span>
                                     </div>

                                     <button 
                                        onClick={() => adjustServings(1)}
                                        className="w-10 h-full flex items-center justify-center text-text-secondary hover:text-forest-green dark:hover:text-accent-herb hover:bg-gray-50 dark:hover:bg-white/10 transition-colors border-l border-accent-herb dark:border-white/10"
                                        aria-label="Increase servings"
                                     >
                                        <span className="material-symbols-outlined text-[20px]">add</span>
                                     </button>
                                 </div>
                             </div>

                             {/* Ingredients List */}
                             <div className="flex flex-col">
                                 {groupedIngredients.map((group, gIdx) => (
                                     <div key={`grp-${gIdx}`} className={groupedIngredients.length > 1 ? "border-b last:border-0 border-accent-herb dark:border-white/10" : ""}>
                                         {groupedIngredients.length > 1 && (
                                             <div className="px-4 py-2 bg-gray-50/50 dark:bg-white/5 text-xs font-bold text-text-secondary dark:text-text-secondary-dark uppercase tracking-wider border-b border-accent-herb dark:border-white/10">
                                                 {group.title}
                                             </div>
                                         )}
                                         <div className="p-2">
                                             {group.items.map((ing, idx) => (
                                                <div key={`${group.title}-${idx}`} onClick={() => toggleIngredient(`${group.title}-${ing.id}`)} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer transition-all group/item">
                                                     <div className="relative flex items-center pt-0.5">
                                                        <Checkbox 
                                                            checked={checkedIngredients.has(`${group.title}-${ing.id}`)} 
                                                            onChange={() => toggleIngredient(`${group.title}-${ing.id}`)} 
                                                            size="sm"
                                                        />
                                                     </div>
                                                     <div className="flex-1">
                                                         <p className={`text-sm md:text-base font-medium transition-colors group-hover/item:text-forest-green dark:group-hover/item:text-accent-herb ${checkedIngredients.has(`${group.title}-${ing.id}`) ? 'line-through opacity-50' : ''}`}>
                                                             {renderIngredient(ing)}
                                                         </p>
                                                     </div>
                                                 </div>
                                             ))}
                                         </div>
                                     </div>
                                 ))}
                             </div>
                         </div>

                         {/* Add to List Button */}
                         <button onClick={addToShoppingList} className="w-full flex items-center justify-center gap-2 bg-forest-green hover:bg-green-900 text-white font-bold py-3 px-4 rounded-xl transition-all active:scale-[0.98] shadow-sm">
                            <span className="material-symbols-outlined text-[20px]">shopping_cart</span> 
                            <span className="whitespace-nowrap">Add to List</span>
                        </button>
                    </div>

                    {/* Right Column: Instructions, Media */}
                    <div className="lg:col-span-8 flex flex-col gap-8">
                        
                        {/* Video */}
                        {recipe.video?.url && (
                             <div className="w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-lg border border-border-thin dark:border-border-dark no-print">
                                <iframe src={recipe.video.url} className="w-full h-full" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
                            </div>
                        )}

                        {/* Instructions */}
                        <div>
                             <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold font-display text-text-main dark:text-white">Focused Instructions</h3>
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-24 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full w-1/4 bg-gradient-to-r from-accent-herb to-forest-green rounded-full"></div>
                                    </div>
                                    <span className="text-xs font-medium text-text-secondary dark:text-text-secondary-dark">{recipe.instructions.length + (recipe.components?.reduce((a, b) => a + b.instructions.length, 0) || 0)} steps</span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-10">
                                {groupedInstructions.map((group, gIdx) => (
                                    <div key={gIdx}>
                                        {group.title && (
                                            <h4 className="text-lg font-bold font-display text-text-main dark:text-white mb-6 border-b border-border-thin dark:border-border-dark pb-2">
                                                {group.title}
                                            </h4>
                                        )}
                                        <div className="flex flex-col gap-8">
                                            {group.steps.map((step, idx) => {
                                                const text = getInstructionText(step);
                                                const title = getInstructionTitle(step);
                                                const timerDuration = getInstructionTimer(step);
                                                const tip = getInstructionTip(step);
                                                const optional = getInstructionOptional(step);
                                                const stepImage = getInstructionImage(step);
                                                const stepId = getInstructionId(step) || `${gIdx}-${idx}`; // Fallback ID if string
                                                
                                                if (!optional) {
                                                    globalStepCounter++;
                                                }
                                                
                                                const timerData = activeTimers[stepId];
                                                const isRunning = timerData !== undefined;
                                                const elapsed = isRunning ? Math.floor((now - timerData.startTime) / 1000) : 0;
                                                const target = timerData?.duration || 0;
                                                const isOvertime = target > 0 && elapsed >= target;

                                                return (
                                                    <div key={idx} className="flex gap-4 relative group">
                                                        <div className="flex-none z-10">
                                                            <div className={`flex items-center justify-center size-10 rounded-full border-2 font-bold transition-colors shadow-sm ${
                                                                optional 
                                                                    ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 text-blue-600' 
                                                                    : 'bg-white dark:bg-card-dark border-accent-herb dark:border-gray-600 text-gray-500 group-hover:border-forest-green group-hover:text-forest-green dark:group-hover:border-accent-herb dark:group-hover:text-accent-herb'
                                                            }`}>
                                                                {optional ? <span className="text-[10px] uppercase">Opt</span> : globalStepCounter}
                                                            </div>
                                                        </div>
                                                        {/* Connecting Line */}
                                                        {idx !== group.steps.length - 1 && (
                                                            <div className="absolute left-[19px] top-10 bottom-[-32px] w-[2px] bg-accent-herb/30 dark:bg-white/5"></div>
                                                        )}
                                                        <div className="flex flex-col gap-2 pt-1 pb-4 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                {title && <h4 className="font-bold text-lg text-text-main dark:text-white">{title}</h4>}
                                                                {optional && (
                                                                    <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">
                                                                        Optional
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-lg text-text-main dark:text-gray-200 leading-relaxed font-medium group-hover:text-black dark:group-hover:text-white transition-colors">
                                                                {text}
                                                            </p>
                                                            {tip && (
                                                                <div className="flex items-start gap-2 bg-yellow-50 dark:bg-yellow-900/10 text-yellow-800 dark:text-yellow-200 p-3 rounded-lg border border-yellow-200 dark:border-yellow-900/30 text-sm font-medium whitespace-pre-wrap">
                                                                    <Lightbulb size={16} className="shrink-0 mt-0.5" />
                                                                    <span className="flex-1 min-w-0 break-words">{tip}</span>
                                                                </div>
                                                            )}
                                                            {stepImage && (
                                                                <div className="mt-2 rounded-xl overflow-hidden border border-border-thin dark:border-border-dark shadow-sm">
                                                                    <img src={db.resolveImageUrl(stepImage)} alt="Step image" className="w-full h-auto object-cover max-h-[300px]" referrerPolicy="no-referrer" />
                                                                </div>
                                                            )}
                                                            {timerDuration !== undefined && timerDuration !== null && (
                                                                <button 
                                                                    onClick={() => toggleTimer(stepId, timerDuration)}
                                                                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold w-fit transition-all no-print ${
                                                                        isRunning 
                                                                            ? isOvertime
                                                                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 animate-pulse'
                                                                                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                                                                            : 'bg-forest-green/5 text-forest-green hover:bg-forest-green/10 dark:bg-accent-herb/10 dark:text-accent-herb dark:hover:bg-accent-herb/20'
                                                                    }`}
                                                                >
                                                                    {isRunning ? (
                                                                        <>
                                                                            {isOvertime ? <Bell size={16} /> : <Square size={16} fill="currentColor" />}
                                                                            <span>{formatTime(elapsed)}</span>
                                                                            <span className="opacity-70 font-normal">/ {formatTime(target)}</span>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <Clock size={16} />
                                                                            Start Stopwatch (Target: {timerDuration}m)
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
                
                {/* Storage & Info Block */}
                {recipe.storageNotes && (
                    <div className="w-full bg-sidebar-mint dark:bg-blue-900/10 border border-forest-green/20 dark:border-blue-900/20 rounded-xl p-5 shadow-sm mt-4">
                        <div className="flex flex-col sm:flex-row gap-6">
                            <div className="flex-1 flex flex-col gap-3">
                                <div className="flex items-center gap-2 text-forest-green dark:text-blue-400 mb-1">
                                    <span className="material-symbols-outlined">inventory_2</span>
                                    <h3 className="font-bold text-lg font-display">Storage & Reheating</h3>
                                </div>
                                <p className="text-sm text-gray-700 dark:text-gray-300">
                                    {recipe.storageNotes}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Source & Attribution - Moved to bottom */}
                {(recipe.source?.name || recipe.addedBy) && (
                    <div className="w-full mt-6 pt-6 border-t border-border-thin dark:border-border-dark flex flex-col sm:flex-row justify-between gap-4 text-sm text-text-secondary dark:text-text-secondary-dark">
                        {recipe.addedBy && (
                            <div className="flex items-center gap-2">
                                <User size={16} />
                                <span>Added by <span className="font-medium text-text-main dark:text-white">{recipe.addedBy}</span></span>
                            </div>
                        )}
                        {(recipe.source?.name || recipe.source?.url) && (
                            <div className="flex items-center gap-2">
                                <ExternalLink size={16} />
                                <span>Source:</span>
                                {recipe.source?.url ? (
                                    <a href={recipe.source.url} target="_blank" rel="noopener noreferrer" className="text-forest-green dark:text-accent-herb hover:underline font-medium">
                                        {recipe.source.name || 'Link'}
                                    </a>
                                ) : (
                                    <span className="font-medium text-text-main dark:text-white">{recipe.source?.name}</span>
                                )}
                            </div>
                        )}
                    </div>
                )}
                
                <div className="h-10"></div>
            </div>
        </main>
    </div>
  );
};

export default RecipeDetail;
