
import React, { useState } from 'react';
import { Recipe } from '../types';
import { Clock, Heart, Flame, Star, UtensilsCrossed } from 'lucide-react';

interface RecipeCardProps {
  recipe: Recipe;
  onClick: (recipe: Recipe) => void;
  onToggleFavorite: (e: React.MouseEvent, recipe: Recipe) => void;
  compact?: boolean;
}

const RecipeCard: React.FC<RecipeCardProps> = ({ recipe, onClick, onToggleFavorite, compact }) => {
  // Use cached rating from recipe object
  const avgRating = recipe.averageRating || 0;
  const reviewCount = recipe.reviewCount || 0;

  // Convert to 5-star scale for visualization (assuming 1-10 scale)
  const visualRating = avgRating > 0 ? avgRating / 2 : 0;

  // Calculate Total Time Range
  const minPrep = recipe.prepTime || 0;
  const maxPrep = recipe.prepTimeMax || minPrep;
  const minCook = recipe.cookTime || 0;
  const maxCook = recipe.cookTimeMax || minCook;

  const minTotal = minPrep + minCook;
  const maxTotal = maxPrep + maxCook;

  const timeDisplay = minTotal === maxTotal 
    ? (minTotal > 0 ? `${minTotal} mins` : 'Quick')
    : `${minTotal}-${maxTotal} mins`;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(recipe);
    }
  };

  const [imageError, setImageError] = useState(false);

  return (
    <div 
      onClick={() => onClick(recipe)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`View recipe: ${recipe.name}`}
      className={`bg-white dark:bg-card-dark rounded-xl overflow-hidden shadow-card hover:shadow-hover transition-all duration-300 group cursor-pointer relative flex flex-col h-full hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-forest-green dark:focus:ring-accent-herb ${compact ? 'rounded-lg' : 'rounded-xl'}`}
    >
      <div className={`${compact ? 'aspect-square' : 'aspect-[4/3]'} relative overflow-hidden bg-bg-subtle dark:bg-white/10`}>
        {recipe.image && !imageError ? (
          <img 
            src={recipe.image} 
            alt={recipe.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            referrerPolicy="no-referrer"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-[#2d333f] text-gray-400 dark:text-[#4a5568]">
            <UtensilsCrossed size={48} strokeWidth={1.5} />
          </div>
        )}
        
        <button
          onClick={(e) => {
             e.stopPropagation();
             onToggleFavorite(e, recipe);
          }}
          className={`absolute ${compact ? 'top-1.5 right-1.5 p-1.5' : 'top-3 right-3 p-2'} bg-white/90 dark:bg-black/50 backdrop-blur-sm rounded-full shadow-sm hover:bg-white dark:hover:bg-black/70 transition-colors z-10`}
        >
          <Heart 
            size={compact ? 16 : 20} 
            className={`${recipe.favorite ? 'fill-red-500 text-red-500' : 'text-gray-400 dark:text-white/50 hover:text-red-500'} transition-colors`} 
          />
        </button>
      </div>

      <div className={`${compact ? 'p-3' : 'p-5'} flex flex-col flex-1`}>
        <div className={`flex justify-between items-start ${compact ? 'mb-1' : 'mb-2'} gap-2`}>
            <h3 className={`font-bold ${compact ? 'text-sm' : 'text-lg'} leading-tight text-text-main dark:text-white group-hover:text-forest-green dark:group-hover:text-accent-herb transition-colors line-clamp-1`}>{recipe.name}</h3>
            {avgRating > 0 && (
                <div className={`flex items-center gap-1 ${compact ? 'text-[10px]' : 'text-xs'} font-bold text-yellow-500 dark:text-yellow-400 shrink-0`}>
                    <Star size={compact ? 12 : 14} className="fill-current" />
                    <span>{visualRating.toFixed(1)}</span>
                </div>
            )}
        </div>
        
        {recipe.description && recipe.description.trim() !== '' && !compact && (
            <p className="text-sm text-text-secondary dark:text-gray-400 line-clamp-2 mb-4 flex-1">
                {recipe.description}
            </p>
        )}

        <div className={`flex items-center justify-between ${compact ? 'text-[10px]' : 'text-xs'} font-medium text-text-secondary dark:text-gray-500 ${compact ? 'pt-2' : 'pt-4'} border-t border-border-thin dark:border-border-dark mt-auto`}>
            <div className="flex items-center gap-1">
                <Clock size={compact ? 12 : 16} className="text-forest-green dark:text-gray-500" />
                <span>{timeDisplay.replace(' mins', 'm')}</span>
            </div>
            
            {recipe.nutrition?.calories && (
                <div className="flex items-center gap-1">
                    <Flame size={compact ? 12 : 16} className="text-forest-green dark:text-gray-500" />
                    <span>{recipe.nutrition.calories}{compact ? '' : ' kcal'}</span>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(RecipeCard);
