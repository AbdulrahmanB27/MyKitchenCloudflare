import React, { useState, useRef, useEffect } from 'react';
import { Recipe } from '../types';
import { X, ArrowRight, Heart, ChefHat, CheckCircle } from 'lucide-react';
import { isNotEmpty } from '../utils/validation';

interface SwipeableRecipeCardProps { 
    recipe: Recipe;
    onVote: (val: number) => void;
    onStartAnimating?: () => void;
    isBackground?: boolean;
}

const SwipeableRecipeCard = React.forwardRef<{ triggerVote: (val: number) => void }, SwipeableRecipeCardProps>(({ 
    recipe, 
    onVote,
    onStartAnimating,
    isBackground = false
}, ref) => {
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [result, setResult] = useState<'like' | 'nope' | 'skip' | null>(null);
    const [animating, setAnimating] = useState(false);
    
    // Allow parent to trigger votes via ref
    React.useImperativeHandle(ref, () => ({
        triggerVote: (val: number) => {
            if (!animating && !isBackground) finishVote(val);
        }
    }));
    
    const startPos = useRef({ x: 0, y: 0 });
    const cardRef = useRef<HTMLDivElement>(null);

    const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
        if (animating || isBackground) return;
        setIsDragging(true);
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        startPos.current = { x: clientX, y: clientY };
    };

    const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (!isDragging || animating || isBackground) return;
        
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        
        const deltaX = clientX - startPos.current.x;
        const deltaY = clientY - startPos.current.y;

        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            setOffset({ x: deltaX, y: deltaY * 0.2 }); 
        } else {
            setOffset({ x: deltaX * 0.2, y: deltaY });
        }
    };

    const handleTouchEnd = () => {
        if (!isDragging || animating || isBackground) return;
        setIsDragging(false);
        
        const threshold = 100; 
        
        if (offset.x > threshold) {
            finishVote(1); // Like
        } else if (offset.x < -threshold) {
            finishVote(-1); // Nope
        } else if (Math.abs(offset.y) > threshold) {
            finishVote(0); // Skip
        } else {
            setOffset({ x: 0, y: 0 });
        }
    };

    const finishVote = (val: number) => {
        if (isBackground) return;
        setAnimating(true);
        if (onStartAnimating) onStartAnimating();
        let endX = 0;
        let endY = 0;
        
        if (val === 1) { endX = window.innerWidth; setResult('like'); }
        else if (val === -1) { endX = -window.innerWidth; setResult('nope'); }
        else { endY = offset.y > 0 ? window.innerHeight : -window.innerHeight; setResult('skip'); }

        setOffset({ x: endX, y: endY });
        
        setTimeout(() => {
            onVote(val);
            setOffset({ x: 0, y: 0 });
            setResult(null);
            setAnimating(false);
        }, 300);
    };

    const opacityRight = Math.min(Math.max(offset.x / 100, 0), 1);
    const opacityLeft = Math.min(Math.max(-offset.x / 100, 0), 1);
    const opacitySkip = Math.min(Math.max(Math.abs(offset.y) / 100, 0), 1);
    const rotation = offset.x / 15;

    return (
        <div className={`absolute inset-0 flex items-center justify-center p-4 ${isBackground ? 'z-10' : 'z-20'} pointer-events-none`}>
            <div 
                ref={cardRef}
                className={`w-full max-w-sm h-full max-h-[75vh] bg-white dark:bg-card-dark rounded-3xl shadow-2xl overflow-hidden relative select-none ${isBackground ? '' : 'cursor-grab active:cursor-grabbing pointer-events-auto touch-none'}`}
                style={{ 
                    transform: isBackground 
                        ? 'translateY(12px) scale(0.96)' 
                        : `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg)`,
                    transition: isDragging ? 'none' : 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.15), opacity 0.3s ease',
                    opacity: isBackground ? 0.8 : (result ? 0 : 1),
                    filter: isBackground ? 'brightness(0.9)' : 'none'
                }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onMouseDown={handleTouchStart}
                onMouseMove={handleTouchMove}
                onMouseUp={handleTouchEnd}
                onMouseLeave={handleTouchEnd}
            >
                {/* Overlay Indicators */}
                {!isBackground && (
                    <>
                        <div className="absolute top-8 left-8 z-30 border-4 border-green-500 rounded-lg px-4 py-1 transform -rotate-12 transition-opacity pointer-events-none bg-green-500/10 backdrop-blur-sm" style={{ opacity: opacityRight }}>
                            <span className="text-green-500 font-extrabold text-3xl uppercase tracking-widest">Yum</span>
                        </div>
                        <div className="absolute top-8 right-8 z-30 border-4 border-red-500 rounded-lg px-4 py-1 transform rotate-12 transition-opacity pointer-events-none bg-red-500/10 backdrop-blur-sm" style={{ opacity: opacityLeft }}>
                            <span className="text-red-500 font-extrabold text-3xl uppercase tracking-widest">Nope</span>
                        </div>
                        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 border-4 border-blue-400 rounded-lg px-4 py-1 transition-opacity pointer-events-none bg-blue-400/10 backdrop-blur-sm" style={{ opacity: opacitySkip }}>
                            <span className="text-blue-400 font-extrabold text-3xl uppercase tracking-widest">Skip</span>
                        </div>
                    </>
                )}

                {/* Card Content */}
                <div className="relative h-[50%] w-full bg-bg-subtle dark:bg-white/10 pointer-events-none">
                    {recipe.image ? (
                        <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url("${recipe.image}")` }} />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 dark:bg-[#2d333f] text-gray-400 dark:text-[#4a5568]">
                            <ChefHat size={64} strokeWidth={1.5} className="mb-2" />
                            <span className="font-bold tracking-wider opacity-50 uppercase text-xs">{recipe.category}</span>
                        </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                    <div className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2">
                        {recipe.prepTime && (
                           <span className="px-3 py-1 bg-white/20 backdrop-blur-md border border-white/30 text-white text-xs font-bold rounded-full shadow-sm">
                               {recipe.prepTime + (recipe.cookTime || 0)}m
                           </span>
                        )}
                        <span className="px-3 py-1 bg-white/20 backdrop-blur-md border border-white/30 text-white text-xs font-bold rounded-full shadow-sm">
                            {recipe.category}
                        </span>
                    </div>
                </div>

                <div className="h-[50%] p-6 flex flex-col justify-between bg-white dark:bg-card-dark relative pointer-events-none">
                    <div className="overflow-hidden h-full">
                        <div className="flex justify-between items-start gap-2 mb-2">
                            <h2 className="text-2xl font-display font-extrabold text-text-main dark:text-white leading-tight line-clamp-2">{recipe.name}</h2>
                        </div>
                        
                        {recipe.ingredients && recipe.ingredients.length > 0 && (
                            <div className="mt-4">
                                <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-1">Key Ingredients</h3>
                                <div className="flex flex-wrap gap-1">
                                    {recipe.ingredients.slice(0, 5).map((ing, idx) => (
                                        <span key={idx} className="px-2 py-0.5 bg-bg-subtle dark:bg-white/5 rounded text-[10px] font-medium text-text-main dark:text-white/80 border border-border-thin dark:border-border-dark whitespace-nowrap">
                                            {ing.item}
                                        </span>
                                    ))}
                                    {recipe.ingredients.length > 5 && (
                                        <span className="px-2 py-0.5 bg-bg-subtle dark:bg-white/5 rounded text-[10px] font-medium text-text-muted">
                                            +{recipe.ingredients.length - 5} more
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                        {recipe.description && (
                            <div className="mt-3">
                                <p className="text-xs text-text-secondary line-clamp-3 italic border-l-2 border-forest-green/30 pl-2">
                                    {recipe.description}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});

interface RecipeSwipeModeProps {
    recipes: Recipe[];
    onBack: () => void;
    onOpenRecipe: (id: string) => void;
}

const RecipeSwipeMode: React.FC<RecipeSwipeModeProps> = ({ recipes, onBack, onOpenRecipe }) => {
    const [swipeIndex, setSwipeIndex] = useState(0);
    const [swipeFinished, setSwipeFinished] = useState(false);
    const [likedRecipes, setLikedRecipes] = useState<Recipe[]>([]);
    const [animating, setAnimating] = useState(false);
    
    // Create local ref to card to trigger votes from buttons
    const activeCardRef = useRef<{ triggerVote: (val: number) => void } | null>(null);
    
    // Sort recipes randomly exactly once when component mounts
    const shuffledRecipes = useRef([...recipes].sort(() => Math.random() - 0.5));

    const handleVote = (val: number) => {
        const currentRecipe = shuffledRecipes.current[swipeIndex];
        if (val === 1 && currentRecipe) {
            setLikedRecipes(prev => [...prev, currentRecipe]);
        }
        
        if (swipeIndex < shuffledRecipes.current.length - 1) {
            setSwipeIndex(prev => prev + 1);
            setAnimating(false);
        } else {
            setSwipeFinished(true); // Reached the end
            setAnimating(false);
        }
    };

    const handleReset = () => {
        shuffledRecipes.current = [...recipes].sort(() => Math.random() - 0.5);
        setSwipeIndex(0);
        setLikedRecipes([]);
        setSwipeFinished(false);
        setAnimating(false);
    };

    if (recipes.length === 0) {
        return (
            <div className="fixed inset-0 flex flex-col items-center justify-center text-center p-8 bg-bg-subtle dark:bg-bg-dark z-[200]">
                <ChefHat className="text-text-secondary/30 mb-4" size={64} />
                <h2 className="text-xl font-bold dark:text-white mb-2">No Recipes Available</h2>
                <p className="text-text-secondary mb-6 max-w-sm">You need to add some recipes to your collection before you can play.</p>
                <button onClick={onBack} className="px-6 py-2 bg-text-main dark:bg-white text-white dark:text-black font-bold rounded-lg w-full max-w-xs hover:bg-black transition-colors">
                    Go Back
                </button>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[200] bg-bg-subtle bg-gradient-to-b from-bg-subtle to-[#e8eee3] dark:from-bg-dark dark:to-[#161a22] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 flex items-center justify-between border-b border-white/20 dark:border-white/5 backdrop-blur-md sticky top-0 z-50">
                <button onClick={onBack} className="p-2 -ml-2 rounded-full text-text-main dark:text-white bg-white/50 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 backdrop-blur-md border border-white/50 dark:border-white/10 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-forest-green">
                    <X size={20} />
                </button>
                <div className="flex flex-col items-center">
                    <h1 className="font-display font-extrabold text-xl text-text-main dark:text-white tracking-tight flex items-center gap-2">
                        <Heart size={20} className="text-red-500 fill-red-500" />
                        Swipe Recipes
                    </h1>
                    {!swipeFinished && (
                        <span className="text-xs font-bold text-text-secondary uppercase tracking-widest">{swipeIndex + 1} of {shuffledRecipes.current.length}</span>
                    )}
                </div>
                <div className="w-10"></div> {/* Spacer */}
            </div>

            <div className="flex-1 relative p-4 flex flex-col items-center justify-center overflow-hidden">
                {swipeFinished ? (
                    <div className="w-full max-w-sm mx-auto bg-white dark:bg-card-dark rounded-3xl shadow-xl p-8 text-center space-y-4 animate-in zoom-in h-fit max-h-full overflow-y-auto">
                        <div className="inline-flex p-6 bg-forest-green/10 dark:bg-accent-herb/20 text-forest-green dark:text-accent-herb rounded-full mb-1 mx-auto">
                            <CheckCircle size={48} strokeWidth={1.5} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black font-display text-text-main dark:text-white mb-1">All Done!</h2>
                            <p className="text-text-secondary text-xs">You swiped through all your recipes.</p>
                        </div>
                        
                        {likedRecipes.length > 0 ? (
                            <div className="text-left bg-bg-subtle dark:bg-white/5 p-4 rounded-xl border border-border-thin dark:border-border-dark mt-4 mb-4 max-h-60 overflow-y-auto">
                                <h3 className="font-bold text-xs text-text-main dark:text-white mb-2 uppercase tracking-wide">Your Favorites ({likedRecipes.length})</h3>
                                <ul className="space-y-2">
                                    {likedRecipes.filter(Boolean).map((r, idx) => (
                                        <li key={r.id || idx} className="text-sm p-2 bg-white dark:bg-bg-dark rounded-lg flex items-center justify-between border border-border-thin dark:border-border-dark">
                                            <span className="font-medium truncate mr-2 dark:text-white/90">{r.name}</span>
                                            <button onClick={() => onOpenRecipe(r.id)} className="text-forest-green dark:text-accent-herb hover:underline text-xs whitespace-nowrap shrink-0">View</button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <div className="p-8 text-sm text-text-secondary italic">You didn't like any recipes this time.</div>
                        )}

                        <div className="pt-4 grid grid-cols-2 gap-3">
                            <button onClick={onBack} className="w-full py-3 text-text-main dark:text-white bg-white dark:bg-card-dark border border-border-thin dark:border-border-dark font-bold rounded-xl hover:bg-bg-subtle dark:hover:bg-white/5 transition-colors text-sm">
                                Close
                            </button>
                            <button onClick={handleReset} className="w-full py-3 bg-forest-green dark:bg-accent-herb text-white dark:text-black font-bold rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap text-sm px-4">
                                Play Again
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="w-full max-w-sm flex-1 flex flex-col items-center justify-center relative mb-24">
                        <div className="w-full aspect-[3/4.5] relative">
                            {swipeIndex + 1 < shuffledRecipes.current.length && (
                                <SwipeableRecipeCard 
                                    key={shuffledRecipes.current[swipeIndex + 1].id + (swipeIndex + 1)} 
                                    recipe={shuffledRecipes.current[swipeIndex + 1]} 
                                    onVote={() => {}} 
                                    isBackground
                                />
                            )}
                            {shuffledRecipes.current[swipeIndex] && (
                                <SwipeableRecipeCard 
                                    key={shuffledRecipes.current[swipeIndex].id + swipeIndex} 
                                    recipe={shuffledRecipes.current[swipeIndex]} 
                                    onVote={handleVote}
                                    ref={activeCardRef}
                                    onStartAnimating={() => setAnimating(true)}
                                />
                            )}
                        </div>
                        
                        {/* Control Buttons moved here to ensure they always work and stay visible until transition */}
                        <div className="absolute -bottom-24 left-0 right-0 px-8 flex items-center justify-center gap-6 sm:gap-10 z-50">
                            <button 
                                onClick={() => activeCardRef.current?.triggerVote(-1)} 
                                disabled={animating} 
                                className="group flex items-center justify-center size-14 sm:size-16 rounded-full bg-white dark:bg-card-dark shadow-xl hover:scale-110 active:scale-95 transition-all duration-200 border border-border-thin dark:border-border-dark disabled:opacity-50"
                            >
                                <X className="text-red-500" size={28} />
                            </button>
                            <button 
                                onClick={() => activeCardRef.current?.triggerVote(0)} 
                                disabled={animating} 
                                className="group flex items-center justify-center size-10 sm:size-12 rounded-full bg-white dark:bg-card-dark shadow-xl hover:scale-110 active:scale-95 transition-all duration-200 border border-border-thin dark:border-border-dark disabled:opacity-50"
                            >
                                <ArrowRight className="text-blue-400" size={20} />
                            </button>
                            <button 
                                onClick={() => activeCardRef.current?.triggerVote(1)} 
                                disabled={animating} 
                                className="group flex items-center justify-center size-14 sm:size-16 rounded-full bg-forest-green dark:bg-accent-herb shadow-xl hover:scale-110 active:scale-95 transition-all duration-200 disabled:opacity-50"
                            >
                                <Heart className="text-white dark:text-black fill-current" size={28} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RecipeSwipeMode;
