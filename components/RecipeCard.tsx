
import React from 'react';
import { Recipe } from '../types';
import { Clock, Heart, Flame } from 'lucide-react';

interface RecipeCardProps {
  recipe: Recipe;
  onClick: (recipe: Recipe) => void;
  onToggleFavorite: (e: React.MouseEvent, recipe: Recipe) => void;
}

const RecipeCard: React.FC<RecipeCardProps> = ({ recipe, onClick, onToggleFavorite }) => {
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

  return (
    <div 
      onClick={() => onClick(recipe)}
      className="bg-white dark:bg-card-dark rounded-xl overflow-hidden shadow-card hover:shadow-hover transition-all duration-300 group cursor-pointer border-t-4 border-transparent hover:border-forest-green border-x border-b border-border-thin dark:border-border-dark relative flex flex-col h-full"
    >
      <div className="aspect-[4/3] relative overflow-hidden bg-bg-subtle dark:bg-white/10">
        {recipe.image ? (
          <img 
            src={recipe.image} 
            alt={recipe.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-bg-subtle dark:bg-white/5 text-4xl">
            🍳
          </div>
        )}
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4 justify-center">
            <button className="bg-white dark:bg-accent-herb text-black px-4 py-2 rounded-full text-xs font-bold shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                View Recipe
            </button>
        </div>

        <button
          onClick={(e) => {
             e.stopPropagation();
             onToggleFavorite(e, recipe);
          }}
          className="absolute top-3 right-3 p-2 bg-white/90 dark:bg-black/50 backdrop-blur-sm rounded-full shadow-sm hover:bg-white dark:hover:bg-black/70 transition-colors z-10"
        >
          <Heart 
            size={20} 
            className={`${recipe.favorite ? 'fill-red-500 text-red-500' : 'text-text-secondary dark:text-text-secondary-dark hover:text-red-500'} transition-colors`} 
          />
        </button>
      </div>

      <div className="p-5 flex flex-col flex-1">
        <div className="flex justify-between items-start mb-2 gap-2">
            <h3 className="font-bold text-lg leading-tight text-text-main dark:text-white group-hover:text-forest-green dark:group-hover:text-accent-herb transition-colors line-clamp-1">{recipe.name}</h3>
            {avgRating > 0 && (
                <div className="flex items-center gap-1 text-xs font-bold bg-forest-green/10 dark:bg-lime-900/30 text-forest-green dark:text-lime-200 px-2 py-1 rounded-md shrink-0">
                    <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                    <span>{visualRating.toFixed(1)}</span>
                </div>
            )}
        </div>
        
        <p className="text-sm text-text-secondary dark:text-text-secondary-dark line-clamp-2 mb-4 flex-1">
            {recipe.description || "No description available."}
        </p>

        <div className="flex items-center justify-between text-xs font-medium text-text-secondary dark:text-text-secondary-dark pt-4 border-t border-border-thin dark:border-border-dark mt-auto">
            <div className="flex items-center gap-1.5">
                <Clock size={16} className="text-forest-green dark:text-text-secondary-dark" />
                <span>{timeDisplay}</span>
            </div>
            
            {recipe.nutrition?.calories && (
                <div className="flex items-center gap-1.5">
                    <Flame size={16} className="text-forest-green dark:text-text-secondary-dark" />
                    <span>{recipe.nutrition.calories} kcal</span>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default RecipeCard;
