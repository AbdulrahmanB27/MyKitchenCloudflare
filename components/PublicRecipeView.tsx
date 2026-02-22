import React, { useState, useEffect, useMemo } from 'react';
import { Recipe, Ingredient, Instruction } from '../types';
import { formatFraction } from '../utils/format';
import { User, ExternalLink, CookingPot, Lightbulb, Clock } from 'lucide-react';

interface PublicRecipeViewProps {
    recipeId: string;
    onClose: () => void;
}

const PublicRecipeView: React.FC<PublicRecipeViewProps> = ({ recipeId, onClose }) => {
    const [recipe, setRecipe] = useState<Recipe | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [currentServings, setCurrentServings] = useState<number>(1);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch(`/api/public_recipe?id=${recipeId}`);
                if (!res.ok) throw new Error("Recipe not found");
                const data = await res.json();
                setRecipe(data);
                setCurrentServings(data.servings || 1);
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [recipeId]);

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

    if (loading) return <div className="flex items-center justify-center h-screen text-primary font-bold">Loading...</div>;
    if (error || !recipe) return <div className="flex items-center justify-center h-screen text-red-500 font-bold">{error || "Recipe not found"}</div>;

    const originalServings = recipe.servings || 1;
    const scalingFactor = currentServings / originalServings;

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
            </span>
        );
    };

    let globalStepCounter = 0;

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
                <div className="text-sm font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
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
                    <div className="flex flex-wrap gap-3">
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

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
                        {/* Ingredients */}
                        <div className="lg:col-span-4 flex flex-col gap-6 order-2 lg:order-1">
                            <div className="flex flex-col gap-4 bg-accent-light/30 dark:bg-accent-dark/30 p-4 rounded-xl border border-border-light dark:border-border-dark">
                                <h3 className="text-xl font-bold text-text-main dark:text-white">Ingredients</h3>
                                <div className="flex flex-col gap-4">
                                    {groupedIngredients.map((group, gIdx) => (
                                        <div key={gIdx} className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden">
                                            <div className="p-3 bg-gray-50 dark:bg-white/5 font-bold text-text-main dark:text-white border-b border-border-light dark:border-border-dark">
                                                {group.title}
                                            </div>
                                            <div className="flex flex-col p-2">
                                                {group.items.map((ing, idx) => (
                                                    <div key={idx} className="flex items-start gap-3 p-3 border-b last:border-0 border-border-light dark:border-white/5">
                                                        <div className="flex-1 text-sm md:text-base font-medium">
                                                            {renderIngredient(ing)}
                                                        </div>
                                                    </div>
                                                ))}
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
                                                                <div className="flex items-start gap-2 bg-yellow-50 dark:bg-yellow-900/10 text-yellow-800 dark:text-yellow-200 p-3 rounded-lg border border-yellow-200 dark:border-yellow-900/30 text-sm font-medium">
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
        </div>
    );
};

export default PublicRecipeView;
