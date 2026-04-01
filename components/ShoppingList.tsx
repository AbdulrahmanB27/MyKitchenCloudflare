
import React, { useState, useEffect, useMemo } from 'react';
import { ShoppingItem } from '../types';
import * as db from '../services/db';
import { v4 as uuidv4 } from 'uuid';
import { formatFraction, normalizeIngredient } from '../utils/format';
import Checkbox from './Checkbox';

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
  <Checkbox checked={checked} onChange={onChange} size="md" />
);

const ShoppingList: React.FC<ShoppingListProps> = ({ onOpenMenu, allTags, pinnedTags, onOpenRecipe }) => {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('combined');
  const [newItemAmount, setNewItemAmount] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('');
  const [newItemItem, setNewItemItem] = useState('');

  const parseAmount = (val: string | number): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const str = val.trim();
    if (str.includes('/')) {
        const parts = str.split(' ');
        if (parts.length === 2) {
            const whole = parseFloat(parts[0]);
            const [num, den] = parts[1].split('/').map(Number);
            return !isNaN(whole) && !isNaN(num) && !isNaN(den) && den !== 0 ? whole + (num / den) : 0;
        } else {
            const [num, den] = str.split('/').map(Number);
            return !isNaN(num) && !isNaN(den) && den !== 0 ? num / den : 0;
        }
    }
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
  };

  useEffect(() => {
    loadItems();
  }, []);

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemItem.trim()) return;

    const amount = parseAmount(newItemAmount);
    const unit = newItemUnit.trim();
    const item = newItemItem.trim();

    // Construct display text: "2 cups Flour" or just "Flour"
    let text = item;
    if (amount > 0) {
        text = unit ? `${newItemAmount} ${unit} ${item}` : `${newItemAmount} ${item}`;
    }

    const newItem: ShoppingItem = {
      id: uuidv4(),
      text: text,
      isChecked: false,
      structured: {
        amount,
        unit,
        item
      }
    };

    await db.upsertShoppingItem(newItem);
    setItems(prev => [...prev, newItem]);
    setNewItemAmount('');
    setNewItemUnit('');
    setNewItemItem('');
  };

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

  const deleteItem = async (id: string) => {
    await db.deleteShoppingItem(id);
    setItems(prev => prev.filter(i => i.id !== id));
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
      const key = item.recipeName || 'Manual';
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
          // Key is normalized item name + unit for merging (e.g. "flour-cups")
          // We use normalizeIngredient to handle plurals, punctuation, etc.
          key = `${normalizeIngredient(name)}-${unit}`;
      } else {
          // Fallback for legacy items: Use text
          name = item.text;
          key = normalizeIngredient(name);
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
      
      // Heuristic for "best" display name: prefer capitalized, prefer plural if total > 1
      // For now, stick to capitalization preference
      if (name && name[0] === name[0].toUpperCase() && entry.text[0] !== name[0]) {
          entry.text = name;
      }
      // If we have "egg" and now see "Eggs", maybe prefer "Eggs"?
      // If the entry text is shorter than current name, and current name starts with entry text (e.g. Egg vs Eggs), swap to longer?
      // Only do this if we are normalizing plurals.
      if (name.length > entry.text.length && name.toLowerCase().startsWith(entry.text.toLowerCase())) {
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
          ? `${formatFraction(item.qty)} ${item.unit} ${item.text}` 
          : `${item.text}${item.qty > 1 ? ` (x${formatFraction(item.qty)})` : ''}`;
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

  if (loading) return <div className="p-8 text-center text-text-secondary">Loading list...</div>;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 scroll-smooth bg-bg-white dark:bg-bg-dark">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Mobile Header */}
        <div className="md:hidden flex items-center gap-4 mb-6">
          <button onClick={onOpenMenu} className="text-text-main dark:text-white p-1 -ml-1">
            <span className="material-symbols-outlined">menu</span>
          </button>
          <h1 className="text-2xl font-bold font-display text-text-main dark:text-white">Shopping List</h1>
        </div>

        {/* Shopping List Controls */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-border-thin dark:border-border-dark">
            <div className="flex flex-col gap-1">
                <h2 className="text-3xl font-bold tracking-tight text-text-main dark:text-white font-display">Shopping List</h2>
                <div className="flex gap-2 text-sm mt-1">
                    <button 
                         onClick={() => setViewMode('combined')}
                         className={`px-3 py-1 rounded-full border transition-colors ${viewMode === 'combined' ? 'bg-forest-green dark:bg-accent-herb text-white dark:text-black border-forest-green dark:border-accent-herb' : 'text-text-secondary border-border-thin dark:border-gray-700'}`}
                    >
                        Combined
                    </button>
                    <button 
                        onClick={() => setViewMode('by-recipe')}
                        className={`px-3 py-1 rounded-full border transition-colors ${viewMode === 'by-recipe' ? 'bg-forest-green dark:bg-accent-herb text-white dark:text-black border-forest-green dark:border-accent-herb' : 'text-text-secondary border-border-thin dark:border-gray-700'}`}
                    >
                        By Recipe
                    </button>
                </div>
            </div>
            
            <div className="flex flex-wrap gap-3">
              <button 
                onClick={handleCopy}
                className="px-4 py-2 rounded-lg bg-white dark:bg-card-dark border border-border-thin dark:border-border-dark text-text-main dark:text-gray-300 text-sm font-medium hover:bg-bg-subtle dark:hover:bg-white/5 transition-colors flex items-center gap-2"
                title="Copy Ingredients"
              >
                <span className="material-symbols-outlined text-base">content_copy</span>
                Copy
              </button>
              <button 
                onClick={clearPurchased}
                className="px-4 py-2 rounded-lg bg-white dark:bg-card-dark border border-border-thin dark:border-border-dark text-text-main dark:text-gray-300 text-sm font-medium hover:bg-bg-subtle dark:hover:bg-white/5 transition-colors flex items-center gap-2"
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

          {/* Add Item Form */}
          <form onSubmit={addItem} className="flex flex-col sm:flex-row gap-2">
            <div className="flex gap-2 flex-1">
              <input
                type="text"
                value={newItemAmount}
                onChange={(e) => setNewItemAmount(e.target.value)}
                placeholder="Amt"
                className="w-20 px-4 py-2 rounded-lg bg-white dark:bg-card-dark border border-border-thin dark:border-border-dark text-text-main dark:text-white focus:outline-none focus:ring-2 focus:ring-forest-green dark:focus:ring-accent-herb transition-all"
              />
              <input
                type="text"
                value={newItemUnit}
                onChange={(e) => setNewItemUnit(e.target.value)}
                placeholder="Unit"
                className="w-24 px-4 py-2 rounded-lg bg-white dark:bg-card-dark border border-border-thin dark:border-border-dark text-text-main dark:text-white focus:outline-none focus:ring-2 focus:ring-forest-green dark:focus:ring-accent-herb transition-all"
              />
              <input
                type="text"
                value={newItemItem}
                onChange={(e) => setNewItemItem(e.target.value)}
                placeholder="Item (e.g. Flour)"
                className="flex-1 px-4 py-2 rounded-lg bg-white dark:bg-card-dark border border-border-thin dark:border-border-dark text-text-main dark:text-white focus:outline-none focus:ring-2 focus:ring-forest-green dark:focus:ring-accent-herb transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={!newItemItem.trim()}
              className="px-6 py-2 rounded-lg bg-forest-green dark:bg-accent-herb text-white dark:text-black font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-base">add</span>
              Add
            </button>
          </form>

          {items.length === 0 && (
             <div className="text-center py-10 text-text-secondary">
                Your shopping list is empty. Add items from recipes!
             </div>
          )}

          {/* LIST VIEW: BY RECIPE */}
          {viewMode === 'by-recipe' && (
              <>
                {(Object.entries(itemsByRecipe) as [string, ShoppingItem[]][]).map(([recipeName, recipeItems]) => (
                    <div key={recipeName} className="bg-white dark:bg-card-dark rounded-xl shadow-sm border border-border-thin dark:border-border-dark overflow-hidden">
                    <div className="p-4 bg-bg-subtle dark:bg-white/5 border-b border-border-thin dark:border-border-dark flex justify-between items-center group">
                        <div className="flex items-center gap-2">
                             <h3 className="text-lg font-bold text-text-main dark:text-white font-display">{recipeName}</h3>
                             {recipeItems[0]?.recipeId && (
                                 <button 
                                    onClick={() => onOpenRecipe(recipeItems[0].recipeId!)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-forest-green dark:text-accent-herb hover:bg-forest-green/10 dark:hover:bg-accent-herb/10 rounded"
                                    title="Go to Recipe"
                                 >
                                    <span className="material-symbols-outlined text-lg">open_in_new</span>
                                 </button>
                             )}
                        </div>
                        <span className="text-xs font-medium px-2 py-1 rounded bg-bg-subtle dark:bg-white/10 text-text-secondary dark:text-gray-300">
                        {recipeItems.length} Items
                        </span>
                    </div>
                    <div className="p-4 space-y-1">
                        {recipeItems.map(item => (
                        <div 
                            key={item.id} 
                            className="flex items-center gap-3 p-2 hover:bg-bg-subtle dark:hover:bg-bg-dark rounded-lg group transition-colors"
                        >
                            <div className="flex-1 flex items-center gap-3 cursor-pointer" onClick={() => toggleItem(item)}>
                                <CustomCheckbox checked={item.isChecked} onChange={() => toggleItem(item)} />
                                <span className={`flex-1 text-text-main dark:text-gray-200 font-medium group-hover:text-forest-green dark:group-hover:text-accent-herb transition-colors ${item.isChecked ? 'line-through opacity-60' : ''}`}>
                                {item.text}
                                </span>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                                className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all"
                                title="Remove Item"
                            >
                                <span className="material-symbols-outlined text-lg">delete</span>
                            </button>
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
                        className="flex items-start gap-3 p-4 bg-white dark:bg-card-dark rounded-xl shadow-sm border border-border-thin dark:border-border-dark group transition-all"
                    >
                        <div className="mt-1 cursor-pointer" onClick={() => toggleCombinedItem(item)}>
                            <CustomCheckbox checked={item.isChecked} onChange={() => toggleCombinedItem(item)} />
                        </div>
                        <div className="flex-1 flex flex-col cursor-pointer" onClick={() => toggleCombinedItem(item)}>
                            <span className={`text-text-main dark:text-gray-200 font-bold group-hover:text-forest-green dark:group-hover:text-accent-herb transition-colors ${item.isChecked ? 'line-through opacity-60' : ''}`}>
                                {/* Format quantity nicely */}
                                {item.unit ? `${formatFraction(item.qty)} ${item.unit} ${item.text}` : `${item.text}${item.qty > 1 ? ` (x${formatFraction(item.qty)})` : ''}`}
                            </span>
                            {item.sourceRecipeNames.size > 0 && (
                                <span className="text-xs text-text-secondary dark:text-gray-500 mt-0.5">
                                    From: {Array.from(item.sourceRecipeNames).join(', ')}
                                </span>
                            )}
                        </div>
                        <button 
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                if (window.confirm(`Remove all ${item.text} from list?`)) {
                                    item.itemIds.forEach(id => deleteItem(id));
                                }
                            }}
                            className="opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                            title="Remove All"
                        >
                            <span className="material-symbols-outlined">delete</span>
                        </button>
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
