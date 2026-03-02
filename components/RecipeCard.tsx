
import React from 'react';
import { Recipe } from '../types';
import { Clock, Heart } from 'lucide-react';

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
      className="group relative flex flex-col h-full cursor-pointer"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100 rounded-xl">
        {recipe.image ? (
          <div 
            className="w-full h-full bg-cover bg-center transform group-hover:scale-105 transition-transform duration-700"
            style={{ backgroundImage: `url("${recipe.image}")` }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <span className="text-4xl">🍳</span>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col flex-1">
        <div className="flex justify-between items-start gap-2 mb-2">
          <h3 className="text-accent-black text-xl font-bold tracking-tight leading-tight group-hover:underline decoration-1 underline-offset-4 line-clamp-2">{recipe.name}</h3>
          <span className="text-[10px] font-bold border border-accent-black px-2 py-0.5 rounded-full uppercase tracking-widest shrink-0">
              {recipe.category || 'Recipe'}
          </span>
        </div>
        
        <p className="text-sm text-text-secondary font-light leading-relaxed mb-4 line-clamp-2">
            {recipe.description || (recipe.instructions && Array.isArray(recipe.instructions) ? recipe.instructions.map(i => i.text).join(' ').substring(0, 100) : '')}
        </p>

        <div className="mt-auto flex items-center justify-between pt-4">
          <div className="flex items-center gap-1.5 text-accent-black">
            <Clock size={16} />
            <span className="text-xs font-bold">
               {timeDisplay}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
              {avgRating > 0 && (
                 <div className="flex items-center gap-1 text-[10px] font-black text-accent-black uppercase tracking-tighter">
                     <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                     <span>{visualRating.toFixed(1)}</span>
                 </div>
              )}
              <button
                onClick={(e) => {
                   e.stopPropagation();
                   onToggleFavorite(e, recipe);
                }}
                className="text-gray-400 hover:text-accent-black transition-colors"
              >
                <Heart 
                  size={18} 
                  className={`${recipe.favorite ? 'fill-red-500 text-red-500' : 'text-gray-400 hover:text-accent-black'} transition-colors`} 
                />
              </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecipeCard;
