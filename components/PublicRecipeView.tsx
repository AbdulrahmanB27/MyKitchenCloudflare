import React, { useState, useEffect, useMemo } from 'react';
import { Recipe, Ingredient, Instruction, ShoppingItem } from '../types';
import { formatFraction } from '../utils/format';
import { User, ExternalLink, CookingPot, Lightbulb, Clock, Play, Share, Check, ShoppingCart, Copy, Link as LinkIcon, X, FileText } from 'lucide-react';
import CookMode from './CookMode';
import * as db from '../services/db';
import { v4 as uuidv4 } from 'uuid';

interface PublicRecipeViewProps {
    recipeId: string;
    shareToken?: string | null;
    onClose: () => void;
}

const PublicRecipeView: React.FC<PublicRecipeViewProps> = ({ recipeId, shareToken, onClose }) => {
    const [recipe, setRecipe] = useState<Recipe | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [currentServings, setCurrentServings] = useState<number>(1);
    const [isCookMode, setIsCookMode] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());

    const [toast, setToast] = useState<{ message: string, visible: boolean }>({ message: '', visible: false });

    // Escape key listener
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && showShareModal) {
                setShowShareModal(false);
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [showShareModal]);

    const showToast = (message: string) => {
        setToast({ message, visible: true });
        setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
    };

    useEffect(() => {
        const load = async () => {
            try {
                let url = '';
                if (shareToken) {
                    url = `/api/share/recipe?recipeId=${recipeId}&token=${shareToken}`;
                } else {
                    url = `/api/share?id=${recipeId}`; 
                }

                const res = await fetch(url);
                if (!res.ok) {
                    const errorText = await res.text();
                    try {
                        const errorJson = JSON.parse(errorText);
                        throw new Error(errorJson.error || "Recipe not found or link invalid");
                    } catch (e) {
                         throw new Error(errorText || "Recipe not found or link invalid");
                    }
                }
                const data = await res.json();
                setRecipe(data);
                setCurrentServings(data.servings || 1);
            } catch (e: any) {
                console.error("Failed to load shared recipe:", e);
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [recipeId, shareToken]);

    const groupedIngredients = useMemo(() => {
        if (!recipe) return [];
        const groups = new Map<string, Ingredient[]>();
        
        recipe.ingredients.forEach(ing => {
            const key = ing.section || 'Main';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(ing);
        });
  
        if (recipe.components) {
            recipe.components.forEach(comp => {
                groups.set(comp.label, comp.ingredients);
            });
        }
  
        const result: { title: string, items: Ingredient[] }[] = [];
        if (groups.has('Main')) result.push({ title: 'Main Ingredients', items: groups.get('Main')! });
        
        groups.forEach((items, key) => {
            if (key !== 'Main') result.push({ title: key, items });
        });
        return result;
    }, [recipe]);
  
    const groupedInstructions = useMemo(() => {
        if (!recipe) return [];
        const groups = new Map<string, Instruction[]>();
  
        recipe.instructions.forEach(inst => {
            const key = inst.section || 'Main';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(inst);
        });
  
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

    const getShareUrl = () => {
        const baseUrl = window.location.origin + window.location.pathname;
        if (shareToken) {
            return `${baseUrl}?recipeId=${recipeId}&share=${shareToken}`;
        }
        return `${baseUrl}?recipeId=${recipeId}`;
    };

    const getRecipeText = () => {
        if (!recipe) return '';
        let text = `${recipe.name}\n\n`;
        text += `Prep: ${recipe.prepTime}m | Cook: ${recipe.cookTime}m | Servings: ${recipe.servings}\n\n`;
        
        text += `INGREDIENTS:\n`;
        groupedIngredients.forEach(group => {
            if (group.title) text += `\n${group.title}:\n`;
            group.items.forEach(ing => {
                text += `- ${formatFraction(ing.amount)} ${ing.unit} ${ing.item}`;
                if (ing.notes) text += ` (${ing.notes})`;
                text += `\n`;
            });
        });

        text += `\nINSTRUCTIONS:\n`;
        groupedInstructions.forEach(group => {
            if (group.title) text += `\n${group.title}:\n`;
            group.steps.forEach((step, idx) => {
                const stepText = typeof step === 'string' ? step : step.text;
                text += `${idx + 1}. ${stepText}\n`;
            });
        });

        text += `\nShared via MyKitchen: ${getShareUrl()}`;
        return text;
    };

    const handleLinkAction = (action: 'copy' | 'share') => {
        const url = getShareUrl();
        if (action === 'copy') {
            navigator.clipboard.writeText(url);
            showToast('Link copied to clipboard!');
            setShowShareModal(false);
        } else {
            if (navigator.share) {
                navigator.share({ title: recipe?.name || 'Recipe', url }).catch(() => {});
                setShowShareModal(false);
            } else {
                showToast('Sharing not supported on this device');
            }
        }
    };

    const handleTextAction = (action: 'copy' | 'share') => {
        const text = getRecipeText();
        if (action === 'copy') {
            navigator.clipboard.writeText(text);
            showToast('Recipe text copied to clipboard!');
            setShowShareModal(false);
        } else {
            if (navigator.share) {
                navigator.share({ title: recipe?.name || 'Recipe', text }).catch(() => {});
                setShowShareModal(false);
            } else {
                showToast('Sharing not supported on this device');
            }
        }
    };

    const handleToggleIngredient = (idx: number) => {
        const next = new Set(checkedIngredients);
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        setCheckedIngredients(next);
    };

    const handleAddToShoppingList = async () => {
        if (!recipe) return;
        
        const itemsToAdd: ShoppingItem[] = [];
        let globalIdx = 0;

        groupedIngredients.forEach(group => {
            group.items.forEach(ing => {
                if (checkedIngredients.has(globalIdx)) {
                    itemsToAdd.push({
                        id: uuidv4(),
                        text: `${formatFraction(ing.amount * (currentServings / (recipe.servings || 1)))} ${ing.unit} ${ing.item}`,
                        isChecked: false,
                        category: ing.section || 'Uncategorized'
                    });
                }
                globalIdx++;
            });
        });

        if (itemsToAdd.length === 0) {
            // If none checked, add all
             let gIdx = 0;
             groupedIngredients.forEach(group => {
                group.items.forEach(ing => {
                    itemsToAdd.push({
                        id: uuidv4(),
                        text: `${formatFraction(ing.amount * (currentServings / (recipe.servings || 1)))} ${ing.unit} ${ing.item}`,
                        isChecked: false,
                        category: ing.section || 'Uncategorized'
                    });
                    gIdx++;
                });
            });
        }

        for (const item of itemsToAdd) {
            await db.upsertShoppingItem(item);
        }
        
        showToast(`Added ${itemsToAdd.length} items to shopping list`);
        setCheckedIngredients(new Set());
    };

    if (loading) return <div className="flex items-center justify-center h-screen text-primary font-bold">Loading...</div>;
    if (error || !recipe) return <div className="flex items-center justify-center h-screen text-text-main dark:text-white font-bold">{error || "Recipe not found"}</div>;

    const originalServings = recipe.servings || 1;
    const scalingFactor = currentServings / originalServings;

    if (isCookMode) {
        return <CookMode recipe={recipe} scalingFactor={scalingFactor} onClose={() => setIsCookMode(false)} />;
    }

    const renderIngredient = (ing: Ingredient, globalIdx: number) => {
        const scaledAmount = ing.amount * scalingFactor;
        let secondaryText = '';
        if (ing.secondaryAmount) {
            const scaledSecondary = ing.secondaryAmount * scalingFactor;
            secondaryText = `(${formatFraction(scaledSecondary)} ${ing.secondaryUnit || ''})`.trim();
        }
        
        const isChecked = checkedIngredients.has(globalIdx);

        return (
            <div className="flex items-start gap-3 w-full" onClick={() => handleToggleIngredient(globalIdx)}>
                 <div className={`mt-1 w-5 h-5 rounded border flex items-center justify-center cursor-pointer transition-colors ${isChecked ? 'bg-primary border-primary' : 'border-gray-300 dark:border-gray-600'}`}>
                    {isChecked && <Check size={14} className="text-inverse" />}
                </div>
                <span className={`flex-1 cursor-pointer ${isChecked ? 'opacity-50 line-through' : ''}`}>
                    <span className="font-bold text-primary dark:text-primary-dark mr-1">{formatFraction(scaledAmount)} {ing.unit}</span>
                    {secondaryText && <span className="text-text-muted dark:text-gray-400 text-sm mr-1.5 font-medium">{secondaryText}</span>}
                    <span className="text-text-main dark:text-gray-200">{ing.item}</span>
                    {ing.notes && <span className="text-text-muted text-sm italic ml-1">({ing.notes})</span>}
                </span>
            </div>
        );
    };

    let globalStepCounter = 0;
    let globalIngCounter = 0;

    return (
        <div className="fixed inset-0 z-50 bg-background-light dark:bg-background-dark overflow-y-auto animate-in fade-in">
            <header className="sticky top-0 z-50 flex w-full items-center justify-between border-b border-border-light dark:border-border-dark bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 md:px-6">
                <div className="flex items-center gap-4">
                    {onClose && (
                        <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                            <span className="material-symbols-outlined">arrow_back</span>
                        </button>
                    )}
                    <h2 className="text-lg font-bold font-display text-text-main dark:text-white line-clamp-1">{recipe.name}</h2>
                </div>
                <div className="text-sm font-medium text-text-main dark:text-white bg-gray-100 dark:bg-white/10 px-3 py-1 rounded-full">
                    Read Only
                </div>
            </header>

            <main className="flex flex-col items-center w-full pb-20">
                <div className="flex flex-col w-full max-w-[1024px] px-4 md:px-6 py-6 gap-8">
                    
                    {/* Hero */}
                    <div className="w-full">
                        <div 
                            className="bg-cover bg-center flex flex-col justify-end overflow-hidden rounded-2xl min-h-[300px] md:min-h-[400px] shadow-lg relative bg-gray-200 dark:bg-gray-800" 
                            style={{ backgroundImage: `linear-gradient(0deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0) 50%), url("${recipe.image || ''}")` }}
                        >
                            <div className="flex flex-col p-6 md:p-8 gap-2 z-10">
                                <div className="flex gap-2 mb-1">
                                    <span className="px-2 py-1 rounded bg-white/20 backdrop-blur-sm text-xs font-semibold text-white uppercase tracking-wider">{recipe.category}</span>
                                </div>
                                <h1 className="text-white text-3xl md:text-5xl font-bold font-display leading-tight drop-shadow-sm">{recipe.name}</h1>
                                <p className="text-gray-200 text-sm md:text-base max-w-2xl line-clamp-2 mt-2">{recipe.description}</p>
                            </div>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
                        <div className="flex flex-wrap gap-3 w-full md:w-auto">
                            <div className="flex min-w-[90px] flex-1 md:flex-none flex-col gap-1 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-3 items-center text-center shadow-sm">
                                <p className="text-text-main dark:text-white text-xl font-bold leading-tight">{recipe.prepTime}m</p>
                                <div className="flex items-center gap-1 text-text-muted">
                                    <Clock size={16} />
                                    <p className="text-xs font-medium uppercase tracking-wide">Prep</p>
                                </div>
                            </div>
                            <div className="flex min-w-[90px] flex-1 md:flex-none flex-col gap-1 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-3 items-center text-center shadow-sm">
                                <p className="text-text-main dark:text-white text-xl font-bold leading-tight">{recipe.cookTime}m</p>
                                <div className="flex items-center gap-1 text-text-muted">
                                    <CookingPot size={16} />
                                    <p className="text-xs font-medium uppercase tracking-wide">Cook</p>
                                </div>
                            </div>
                            <div className="flex min-w-[90px] flex-1 md:flex-none flex-col gap-1 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-3 items-center text-center shadow-sm">
                                <p className="text-text-main dark:text-white text-xl font-bold leading-tight">{recipe.servings}</p>
                                <div className="flex items-center gap-1 text-text-muted">
                                    <span className="material-symbols-outlined text-[16px]">restaurant</span>
                                    <p className="text-xs font-medium uppercase tracking-wide">Yield</p>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-4 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 items-center no-scrollbar">
                            <button onClick={() => setIsCookMode(true)} className="flex items-center gap-2 bg-gray-100 dark:bg-white/10 hover:bg-primary hover:text-inverse text-primary dark:text-white dark:hover:text-inverse font-medium py-2 px-4 rounded-xl transition-all group shadow-sm h-[60px] whitespace-nowrap">
                                <Play size={24} fill="currentColor" />
                                <span className="text-sm">Start Cooking</span>
                            </button>
                            <div className="h-8 w-[1px] bg-gray-200 dark:bg-white/10 hidden md:block"></div>
                            <div className="flex gap-2 ml-auto md:ml-0">
                                <button onClick={() => setShowShareModal(true)} className="flex flex-col items-center justify-center gap-1 min-w-[64px] group">
                                    <div className="rounded-full bg-gray-100 dark:bg-white/10 p-2.5 group-hover:bg-primary/20 transition-colors">
                                        <Share size={20} className="text-text-main dark:text-white" />
                                    </div>
                                    <span className="text-text-main dark:text-gray-300 text-[10px] font-medium uppercase">Share</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
                        {/* Ingredients */}
                        <div className="lg:col-span-4 flex flex-col gap-6 order-2 lg:order-1">
                            <div className="flex flex-col gap-4 bg-gray-100/30 dark:bg-white/5 p-4 rounded-xl border border-border-light dark:border-border-dark">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-xl font-bold text-text-main dark:text-white">Ingredients</h3>
                                </div>
                                <button 
                                    onClick={handleAddToShoppingList}
                                    className="w-full py-2.5 bg-primary text-inverse rounded-lg font-bold hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 shadow-sm"
                                >
                                    <ShoppingCart size={18} />
                                    <span>Add {checkedIngredients.size > 0 ? checkedIngredients.size : 'All'} to List</span>
                                </button>
                                <div className="flex flex-col gap-4">
                                    {groupedIngredients.map((group, gIdx) => (
                                        <div key={gIdx} className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden">
                                            <div className="p-3 bg-gray-50 dark:bg-white/5 font-bold text-text-main dark:text-white border-b border-border-light dark:border-border-dark">
                                                {group.title}
                                            </div>
                                            <div className="flex flex-col p-2">
                                                {group.items.map((ing, idx) => {
                                                    const currentIdx = globalIngCounter++;
                                                    return (
                                                        <div key={idx} className="flex items-start gap-3 p-3 border-b last:border-0 border-border-light dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                                            <div className="flex-1 text-sm md:text-base font-medium">
                                                                {renderIngredient(ing, currentIdx)}
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

                        {/* Instructions */}
                        <div className="lg:col-span-8 flex flex-col gap-8 order-1 lg:order-2">
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
                                                const text = typeof step === 'string' ? step : step.text;
                                                const title = typeof step === 'string' ? null : step.title;
                                                const tip = typeof step === 'string' ? null : step.tip;
                                                const optional = typeof step === 'string' ? false : step.optional;
                                                
                                                if (!optional) globalStepCounter++;

                                                return (
                                                    <div key={idx} className="flex gap-4 relative group">
                                                        <div className="flex-none z-10">
                                                            <div className={`flex items-center justify-center size-10 rounded-full border-2 font-bold transition-colors shadow-sm bg-surface-light dark:bg-surface-dark border-border-light dark:border-gray-600 text-gray-500`}>
                                                                {optional ? <span className="text-[10px] uppercase">Opt</span> : globalStepCounter}
                                                            </div>
                                                        </div>
                                                        {idx !== group.steps.length - 1 && (
                                                            <div className="absolute left-[19px] top-10 bottom-[-32px] w-[2px] bg-border-light dark:bg-white/5"></div>
                                                        )}
                                                        <div className="flex flex-col gap-2 pt-1 pb-4 flex-1">
                                                            {title && <h4 className="font-bold text-lg text-text-main dark:text-white">{title}</h4>}
                                                            <p className="text-lg text-text-main dark:text-gray-200 leading-relaxed font-medium">
                                                                {text}
                                                            </p>
                                                            {tip && (
                                                                <div className="flex items-start gap-2 bg-gray-100 dark:bg-white/10 text-text-main dark:text-white p-3 rounded-lg border border-border-light dark:border-border-dark text-sm font-medium">
                                                                    <Lightbulb size={16} className="shrink-0 mt-0.5" />
                                                                    <span>{tip}</span>
                                                                </div>
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
            </main>

            {/* Toast Notification */}
            {toast.visible && (
                <div className="fixed bottom-6 right-6 z-[100] bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-5 fade-in duration-300">
                    <Check size={20} className="text-white" />
                    <span className="font-medium text-sm">{toast.message}</span>
                </div>
            )}

            {/* Share Modal */}
            {showShareModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={() => setShowShareModal(false)}>
                    <div className="bg-surface-light dark:bg-surface-dark rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-border-light dark:border-border-dark flex justify-between items-center bg-gray-50/50 dark:bg-white/5">
                            <h3 className="font-bold text-lg flex items-center gap-2 text-text-main dark:text-white">
                                <Share size={18} className="text-primary"/> Share Recipe
                            </h3>
                            <button onClick={() => setShowShareModal(false)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 transition-colors text-text-muted">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 flex flex-col gap-4">
                            
                            {/* Copy Link Split Button */}
                            <div className="flex flex-col gap-1">
                                <div className="flex w-full rounded-xl border border-border-light dark:border-border-dark overflow-hidden shadow-sm group">
                                    <button 
                                        onClick={() => handleLinkAction('copy')}
                                        className="flex-1 flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left bg-surface-light dark:bg-surface-dark"
                                    >
                                        <div className="p-2 rounded-full bg-gray-100 text-text-main dark:bg-white/10 dark:text-white">
                                            <LinkIcon size={20} />
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-bold text-text-main dark:text-white text-sm">Copy Link</p>
                                            <p className="text-xs text-text-muted">Share view-only web link</p>
                                        </div>
                                    </button>
                                    <div className="w-[1px] bg-border-light dark:border-border-dark"></div>
                                    <button 
                                        onClick={() => handleLinkAction('share')}
                                        className="w-14 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-text-muted hover:text-primary bg-gray-50/50 dark:bg-white/5"
                                        title="Share Link via..."
                                    >
                                        <Share size={20} />
                                    </button>
                                </div>
                            </div>

                            {/* Copy Text Split Button */}
                            <div className="flex flex-col gap-1">
                                <div className="flex w-full rounded-xl border border-border-light dark:border-border-dark overflow-hidden shadow-sm group">
                                    <button 
                                        onClick={() => handleTextAction('copy')}
                                        className="flex-1 flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left bg-surface-light dark:bg-surface-dark"
                                    >
                                        <div className="p-2 rounded-full bg-gray-100 text-text-main dark:bg-white/10 dark:text-white">
                                            <FileText size={20} />
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-bold text-text-main dark:text-white text-sm">Copy Text</p>
                                            <p className="text-xs text-text-muted">Ingredients & Instructions</p>
                                        </div>
                                    </button>
                                    <div className="w-[1px] bg-border-light dark:border-border-dark"></div>
                                    <button 
                                        onClick={() => handleTextAction('share')}
                                        className="w-14 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-text-muted hover:text-primary bg-gray-50/50 dark:bg-white/5"
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
        </div>
    );
};

export default PublicRecipeView;
