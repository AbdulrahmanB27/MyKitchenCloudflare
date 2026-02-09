
import React from 'react';
import { Recipe } from '../types';
import { Clock, Star } from 'lucide-react';

interface RecipeCardProps {
  recipe: Recipe;
  onClick: (recipe: Recipe) => void;
  onToggleFavorite: (e: React.MouseEvent, recipe: Recipe) => void;
}

const RecipeCard: React.FC<RecipeCardProps> = ({ recipe, onClick, onToggleFavorite }) => {
  // Calculate average rating from 1-10 scale
  const avgRating = recipe.reviews && recipe.reviews.length > 0
    ? (recipe.reviews.reduce((a, b) => a + b.rating, 0) / recipe.reviews.length)
    : null;

  // Convert to 5-star scale for visualization
  const visualRating = avgRating ? avgRating / 2 : 0;

  // Calculate Total Time safely (ensuring numbers)
  const totalTime = (Number(recipe.prepTime) || 0) + (Number(recipe.cookTime) || 0);

  return (
    <div 
      onClick={() => onClick(recipe)}
      className="bg-card-light dark:bg-card-dark rounded-xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group relative flex flex-col h-full border border-transparent dark:border-border-dark cursor-pointer"
    >
      <div className="relative h-48 overflow-hidden bg-gray-200 dark:bg-gray-800">
        {recipe.image ? (
          <div 
            className="w-full h-full bg-cover bg-center transform group-hover:scale-110 transition-transform duration-500"
            style={{ backgroundImage: `url("${recipe.image}")` }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-background-light dark:bg-border-dark">
            <span className="text-4xl">🍳</span>
          </div>
        )}
        
        {/* Favorite Button */}
        <button
          onClick={(e) => onToggleFavorite(e, recipe)}
          className="absolute top-3 right-3 p-2 bg-white/90 dark:bg-black/50 backdrop-blur-sm rounded-full shadow-sm hover:bg-white dark:hover:bg-black/70 transition-colors group/btn"
        >
          <Star 
            size={20} 
            className={`${recipe.favorite ? 'fill-yellow-500 text-yellow-500' : 'text-text-light/30 dark:text-white/30 hover:text-yellow-500'} transition-colors`} 
          />
        </button>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <div className="flex justify-between items-start gap-2 mb-2">
          <h3 className="text-text-light dark:text-white text-lg font-bold leading-tight line-clamp-1">{recipe.name}</h3>
          {avgRating && (
             <div className="flex items-center gap-1 text-xs font-bold text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-0.5 rounded-full shrink-0">
                 <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                 <span>{visualRating.toFixed(1)}</span>
                 <span className="opacity-70 font-normal">({recipe.reviews?.length})</span>
             </div>
          )}
        </div>
        
        {/* Tags List */}
        <div className="flex flex-wrap gap-2 mb-4 content-start">
           {recipe.tags.slice(0, 4).map(tag => (
               <span key={tag} className="px-2 py-1 rounded bg-background-light dark:bg-white/5 text-text-muted dark:text-text-muted-dark text-xs font-medium border border-border-light dark:border-white/5">
                   {tag}
               </span>
           ))}
           {recipe.tags.length === 0 && (
               <span className="text-xs text-text-muted/50 italic py-1">No tags</span>
           )}
        </div>

        <div className="mt-auto flex items-center justify-between pt-3 border-t border-border-light dark:border-border-dark min-h-[40px]">
          <div className="flex items-center gap-1.5 text-text-light dark:text-text-dark">
            <Clock size={16} />
            <span className="text-xs font-semibold">
               {totalTime > 0 ? `${totalTime} mins` : 'Quick'}
            </span>
          </div>
          
          {/* Macros Overview */}
          {recipe.nutrition && (
              <div className="flex items-center gap-3 text-xs font-medium text-text-muted dark:text-text-muted-dark">
                  {/* Only show calories if greater than 0 */}
                  {recipe.nutrition.calories && recipe.nutrition.calories > 0 ? (
                      <span>{recipe.nutrition.calories} kcal</span>
                  ) : null}
                  
                  {recipe.nutrition.protein && recipe.nutrition.protein > 0 ? (
                      <span className="font-bold">{recipe.nutrition.protein}g Prot</span>
                  ) : null}
              </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecipeCard;
