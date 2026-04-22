
import React from 'react';
import { AlertCircle, X, ShoppingCart, ArrowRight } from 'lucide-react';
import { Recipe } from '../types';

interface MissingIngredientsBannerProps {
  missingRecipes: Recipe[];
  onDismiss: () => void;
  onAction: () => void;
}

const MissingIngredientsBanner: React.FC<MissingIngredientsBannerProps> = ({ missingRecipes, onDismiss, onAction }) => {
  if (missingRecipes.length === 0) return null;

  const recipeNames = missingRecipes.map(r => r.name).join(', ');
  const message = missingRecipes.length === 1 
    ? `Missing ingredients for ${missingRecipes[0].name}!`
    : `Missing ingredients for ${missingRecipes.length} upcoming meals!`;

  return (
    <div className="w-full bg-forest-green dark:bg-accent-herb text-white dark:text-black py-2 px-4 shadow-lg flex items-center justify-between gap-4 animate-in slide-in-from-top duration-300">
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="bg-white/20 p-1.5 rounded-full shrink-0">
          <AlertCircle size={18} />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 overflow-hidden">
          <p className="text-sm font-bold truncate leading-tight">{message}</p>
          <p className="hidden md:block text-xs opacity-90 truncate leading-tight">({recipeNames})</p>
        </div>
      </div>
      
      <div className="flex items-center gap-2 shrink-0">
        <button 
          onClick={onAction}
          className="flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-bold transition-all"
        >
          <ShoppingCart size={14} />
          <span className="hidden xs:inline">Check List</span>
          <ArrowRight size={14} />
        </button>
        <button 
          onClick={onDismiss}
          className="p-1 hover:bg-black/10 rounded-full transition-colors"
          title="Dismiss"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
};

export default MissingIngredientsBanner;
