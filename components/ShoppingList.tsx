
import React, { useState, useEffect, useMemo } from 'react';
import { ShoppingItem } from '../types';
import * as db from '../services/db';

interface ShoppingListProps {
  onOpenMenu: () => void;
  allTags: string[];
  pinnedTags: string[];
  onOpenRecipe: (recipeId: string) => void;
}

type ViewMode = 'by-recipe' | 'combined';

interface CombinedItem {
  id: string; // Composite ID
  text: string;
  qty: number;
  unit: string;
  isChecked: boolean;
  sourceRecipeIds: string[];
  sourceRecipeNames: Set<string>;
  itemIds: string[]; // All underlying item IDs
}

// Custom Checkbox Component matching the "Show Archived" style
const CustomCheckbox = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
  <div 
    onClick={(e) => { e.stopPropagation(); onChange(); }}
    className={`w-5 h-5 rounded-[6px] border-[2px] flex items-center justify-center transition-all duration-200 cursor-pointer shrink-0 ${
        checked 
            ? 'bg-primary border-primary' 
            : 'border-gray-400 dark:border-gray-500 hover:border-primary bg-transparent'
    }`}
  >
    <span className={`material-symbols-outlined text-white text-[14px] font-bold transform transition-transform ${checked ? 'scale-100' : 'scale-0'}`}>check</span>
  </div>
);

const ShoppingList: React.FC<ShoppingListProps> = ({ onOpenMenu, allTags, pinnedTags, onOpenRecipe }) => {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('combined');

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    const data = await db.getShoppingList();
    setItems(data);
    setLoading(false);
  };

  const toggleItem = async (item: ShoppingItem) => {
    const updated = { ...item, isChecked: !item.isChecked };
    await db.upsertShoppingItem(updated);
    setItems(prev => prev.map(i => i.id === item.id ? updated : i));
  };

  const toggleCombinedItem = async (combined: CombinedItem) => {
    const newCheckedState = !combined.isChecked;
    const promises = combined.itemIds.map(id => {
       const original = items.find(i => i.id === id);
       if (original) {
         return db.upsertShoppingItem({ ...original, isChecked: newCheckedState });
       }
       return Promise.resolve();
    });
    
    await Promise.all(promises);
    
    // Update local state
    setItems(prev => prev.map(i => {
       if (combined.itemIds.includes(i.id)) {
         return { ...i, isChecked: newCheckedState };
       }
       return i;
    }));
  };

  const clearPurchased = async () => {
    await db.clearShoppingList(true);
    await loadItems();
  };

  const clearAll = async () => {
    if (window.confirm('Clear entire shopping list? This cannot be undone.')) {
      try {
        await db.clearShoppingList(false);
        setItems([]); // Update state immediately to reflect empty list
        await loadItems(); // Re-fetch to ensure sync
      } catch (error) {
        console.error("Failed to clear list", error);
        alert("There was an error clearing the list.");
      }
    }
  };

  // --- Grouping Logic ---
  
  // 1. By Recipe
  const itemsByRecipe = useMemo(() => {
    return items.reduce((acc, item) => {
      const key = item.recipeName || 'Misc';
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {} as Record<string, ShoppingItem[]>);
  }, [items]);

  // 2. Combined (Smarter merging with structured data)
  const sortedCombinedItems = useMemo(() => {
    const map = new Map<string, CombinedItem>();

    items.forEach(item => {
      let key = '';
      let amount = 0;
      let unit = '';
      let name = '';

      if (item.structured) {
          // Use structured data
          name = item.structured.item.trim();
          unit = item.structured.unit.trim().toLowerCase();
          amount = item.structured.amount;
          // Key is item name + unit for merging (e.g. "Flour-cups")
          key = `${name.toLowerCase()}-${unit}`;
      } else {
          // Fallback for legacy items: Use text
          name = item.text;
          key = name.toLowerCase();
          amount = 1; // Default
      }

      if (!map.has(key)) {
        map.set(key, {
          id: key,
          text: name,
          qty: 0,
          unit: unit,
          isChecked: true, // Will start true, AND with all items
          sourceRecipeIds: [],
          sourceRecipeNames: new Set(),
          itemIds: []
        });
      }

      const entry = map.get(key)!;
      entry.qty += amount;
      entry.itemIds.push(item.id);
      if (item.recipeId) entry.sourceRecipeIds.push(item.recipeId);
      if (item.recipeName) entry.sourceRecipeNames.add(item.recipeName);
      if (!item.isChecked) entry.isChecked = false; // If any is unchecked, the group is unchecked
      
      // Capitalization preference
      if (name && name[0] === name[0].toUpperCase() && entry.text[0] !== name[0]) {
          entry.text = name;
      }
    });

    return Array.from(map.values()).sort((a, b) => a.text.localeCompare(b.text));
  }, [items]);

  const handleCopy = async () => {
    if (sortedCombinedItems.length === 0) {
        alert("List is empty");
        return;
    }

    const text = sortedCombinedItems.map(item => {
      // Format nicely: "2 cups Flour" or "Onions (x2)"
      return item.unit 
          ? `${Number(item.qty.toFixed(2))} ${item.unit} ${item.text}` 
          : `${item.text}${item.qty > 1 ? ` (x${item.qty})` : ''}`;
    }).join('\n');

    try {
        await navigator.clipboard.writeText(text);
        alert('Ingredients copied to clipboard!');
    } catch (err) {
        console.error('Failed to copy', err);
        alert('Failed to copy. Please allow clipboard access.');
    }
  };

  // --- Render ---

  if (loading) return <div className="p-8 text-center text-text-muted">Loading list...</div>;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 scroll-smooth">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Mobile Header */}
        <div className="md:hidden flex items-center gap-4 mb-6">
          <button onClick={onOpenMenu} className="text-text-main dark:text-white p-1 -ml-1">
            <span className="material-symbols-outlined">menu</span>
          </button>
          <h1 className="text-2xl font-bold font-display">Shopping List</h1>
        </div>

        {/* Shopping List Controls */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-border-light dark:border-border-dark">
            <div className="flex flex-col gap-1">
                <h2 className="text-3xl font-bold tracking-tight text-text-main dark:text-white font-display">Shopping List</h2>
                <div className="flex gap-2 text-sm mt-1">
                    <button 
                         onClick={() => setViewMode('combined')}
                         className={`px-3 py-1 rounded-full border transition-colors ${viewMode === 'combined' ? 'bg-primary text-white border-primary' : 'text-text-muted border-border-light dark:border-gray-700'}`}
                    >
                        Combined
                    </button>
                    <button 
                        onClick={() => setViewMode('by-recipe')}
                        className={`px-3 py-1 rounded-full border transition-colors ${viewMode === 'by-recipe' ? 'bg-primary text-white border-primary' : 'text-text-muted border-border-light dark:border-gray-700'}`}
                    >
                        By Recipe
                    </button>
                </div>
            </div>
            
            <div className="flex flex-wrap gap-3">
              <button 
                onClick={handleCopy}
                className="px-4 py-2 rounded-lg bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-main dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
                title="Copy Ingredients"
              >
                <span className="material-symbols-outlined text-base">content_copy</span>
                Copy
              </button>
              <button 
                onClick={clearPurchased}
                className="px-4 py-2 rounded-lg bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-main dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-base">check_circle</span>
                Clear Purchased
              </button>
              <button 
                onClick={clearAll}
                className="px-4 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-base">delete</span>
                Clear All
              </button>
            </div>
          </div>

          {items.length === 0 && (
             <div className="text-center py-10 text-text-muted dark:text-text-muted-dark">
                Your shopping list is empty. Add items from recipes!
             </div>
          )}

          {/* LIST VIEW: BY RECIPE */}
          {viewMode === 'by-recipe' && (
              <>
                {(Object.entries(itemsByRecipe) as [string, ShoppingItem[]][]).map(([recipeName, recipeItems]) => (
                    <div key={recipeName} className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-border-light dark:border-border-dark overflow-hidden">
                    <div className="p-4 bg-gray-50/50 dark:bg-white/5 border-b border-border-light dark:border-border-dark flex justify-between items-center group">
                        <div className="flex items-center gap-2">
                             <h3 className="text-lg font-bold text-text-main dark:text-white font-display">{recipeName}</h3>
                             {recipeItems[0]?.recipeId && (
                                 <button 
                                    onClick={() => onOpenRecipe(recipeItems[0].recipeId!)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-primary hover:bg-primary/10 rounded"
                                    title="Go to Recipe"
                                 >
                                    <span className="material-symbols-outlined text-lg">open_in_new</span>
                                 </button>
                             )}
                        </div>
                        <span className="text-xs font-medium px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        {recipeItems.length} Items
                        </span>
                    </div>
                    <div className="p-4 space-y-1">
                        {recipeItems.map(item => (
                        <div 
                            key={item.id} 
                            onClick={() => toggleItem(item)}
                            className="flex items-center gap-3 p-2 hover:bg-background-light dark:hover:bg-background-dark rounded-lg cursor-pointer group transition-colors"
                        >
                            <CustomCheckbox checked={item.isChecked} onChange={() => toggleItem(item)} />
                            <span className={`flex-1 text-text-main dark:text-gray-200 font-medium group-hover:text-primary transition-colors ${item.isChecked ? 'line-through opacity-60' : ''}`}>
                            {item.text}
                            </span>
                        </div>
                        ))}
                    </div>
                    </div>
                ))}
              </>
          )}

          {/* LIST VIEW: COMBINED */}
          {viewMode === 'combined' && (
             <div className="space-y-2">
                {sortedCombinedItems.map(item => (
                    <div 
                        key={item.id} 
                        onClick={() => toggleCombinedItem(item)}
                        className="flex items-start gap-3 p-4 bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-border-light dark:border-border-dark cursor-pointer group transition-all"
                    >
                        <div className="mt-1">
                            <CustomCheckbox checked={item.isChecked} onChange={() => toggleCombinedItem(item)} />
                        </div>
                        <div className="flex-1 flex flex-col">
                            <span className={`text-text-main dark:text-gray-200 font-bold group-hover:text-primary transition-colors ${item.isChecked ? 'line-through opacity-60' : ''}`}>
                                {/* Format quantity nicely */}
                                {item.unit ? `${Number(item.qty.toFixed(2))} ${item.unit} ${item.text}` : `${item.text} (x${item.qty})`}
                            </span>
                            {item.sourceRecipeNames.size > 0 && (
                                <span className="text-xs text-text-muted dark:text-gray-500 mt-0.5">
                                    From: {Array.from(item.sourceRecipeNames).join(', ')}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
             </div>
          )}

        </div>
        
        <div className="h-10"></div>
      </div>
    </div>
  );
};

export default ShoppingList;
    