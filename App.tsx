
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Recipe, AppSettings, RecipeCategory, SortOption } from './types';
import * as db from './services/db';
import RecipeCard from './components/RecipeCard';
import RecipeDetail from './components/RecipeDetail';
import RecipeForm from './components/RecipeForm';
import ShoppingList from './components/ShoppingList';
import MealPlanner from './components/MealPlanner';
import Recommendations from './components/Recommendations';
import AuthModal from './components/AuthModal';
import ExportModal, { ExportOptions } from './components/ExportModal';
import { Search, Moon, Sun, Plus, ChevronLeft, ChevronRight, ArrowUpDown, Cloud, CloudOff, Upload, Users, User, RefreshCw, Download, Loader2 } from 'lucide-react';

const App: React.FC = () => {
  // --- State ---
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [pinnedTags, setPinnedTags] = useState<string[]>(['Dinner', 'Healthy', 'Quick']); // Defaults
  const [settings, setSettings] = useState<AppSettings>({ theme: 'system', autoSync: true });
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncIds, setPendingSyncIds] = useState<Set<string>>(new Set());
  
  // View State
  const [currentView, setCurrentView] = useState<'recipes' | 'shopping' | 'planner' | 'settings' | 'recommendations'>('recipes');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<RecipeCategory | 'All'>('All');
  
  // Filters
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [familyFilter, setFamilyFilter] = useState<'all' | 'mine' | 'family'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  // Auth State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  
  // State to hold a recipe that is waiting for authentication to be saved
  const [pendingRecipeSave, setPendingRecipeSave] = useState<Recipe | null>(null);

  // --- Import Logic ---
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const imported = JSON.parse(content);
        
        let recipesToImport: any[] = [];
        if (Array.isArray(imported)) {
            recipesToImport = imported;
        } else if (imported.recipes && Array.isArray(imported.recipes)) {
            recipesToImport = imported.recipes;
        } else {
            recipesToImport = [imported];
        }
        
        let count = 0;
        for (const r of recipesToImport) {
            if (r.name && r.ingredients && r.instructions) {
                const shouldShare = r.shareToFamily !== undefined ? r.shareToFamily : false;
                await db.upsertRecipe({ ...r, shareToFamily: shouldShare });
                count++;
            }
        }
        await loadData();
        alert(`Imported ${count} recipes.`);
      } catch (err) {
        console.error(err);
        alert('Failed to import recipes. Invalid JSON.');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleExport = (options: ExportOptions) => {
    const dataToExport: any = {
      version: 1,
      timestamp: Date.now(),
      recipes: recipes, 
    };

    if (!options.includeReviews) {
        dataToExport.recipes = recipes.map(r => {
            const { reviews, ...rest } = r;
            return { ...rest, reviews: [] };
        });
    }

    if (options.includeSettings) {
      dataToExport.settings = settings;
    }

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mykitchen_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExportModal(false);
  };

  // --- Effects ---

  const loadData = async () => {
    try {
      const [loadedRecipes, queue] = await Promise.all([
          db.getAllRecipes(),
          db.getSyncQueue()
      ]);
      setRecipes(loadedRecipes);
      // Track which IDs are pending sync
      const pendingIds = new Set(queue.map(q => q.id));
      setPendingSyncIds(pendingIds);
      return loadedRecipes;
    } catch (err) {
      console.error("Failed to load recipes", err);
      return [];
    }
  };

  useEffect(() => {
    const init = async () => {
        try {
            const [loadedRecipes, loadedSettings] = await Promise.all([
                db.getAllRecipes(),
                db.getSettings()
            ]);
            setRecipes(loadedRecipes);
            setSettings(loadedSettings);
            applyTheme(loadedSettings.theme);
            
            // Check queue initially
            const queue = await db.getSyncQueue();
            setPendingSyncIds(new Set(queue.map(q => q.id)));
        } catch (e) {
            console.error("Initialization failed", e);
        } finally {
            setLoading(false);
        }
    };
    init();

    // Listen for auth requests from DB service
    db.setAuthCallback(() => setShowAuthModal(true));

    // Listen for background sync updates
    const handleUpdates = () => loadData();
    window.addEventListener('recipes-updated', handleUpdates);
    
    return () => window.removeEventListener('recipes-updated', handleUpdates);
  }, []);

  // Monitor Online Status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const applyTheme = (theme: 'light' | 'dark' | 'system') => {
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  };

  const toggleTheme = () => {
    const isCurrentlyDark = document.documentElement.classList.contains('dark');
    const newTheme: 'light' | 'dark' = isCurrentlyDark ? 'light' : 'dark';
    const newSettings: AppSettings = { ...settings, theme: newTheme };
    setSettings(newSettings);
    applyTheme(newTheme);
    db.saveSettings(newSettings);
  };

  const toggleAutoSync = () => {
      const newSettings = { ...settings, autoSync: !settings.autoSync };
      setSettings(newSettings);
      db.saveSettings(newSettings);
      if (newSettings.autoSync) loadData(); 
  };

  // --- Computed ---

  const filteredRecipes = useMemo(() => {
    let result = recipes;

    if (!showArchived) result = result.filter(r => !r.archived);
    if (selectedCategory !== 'All') result = result.filter(r => r.category === selectedCategory);
    if (filterFavorites) result = result.filter(r => r.favorite);
    if (familyFilter === 'mine') result = result.filter(r => !r.shareToFamily);
    else if (familyFilter === 'family') result = result.filter(r => r.shareToFamily);

    if (selectedTags.size > 0) {
        result = result.filter(r => {
            for (const tag of selectedTags) {
                if (!r.tags.includes(tag)) return false;
            }
            return true;
        });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r => 
        r.name.toLowerCase().includes(q) || 
        r.ingredients.some(i => i.item.toLowerCase().includes(q))
      );
    }

    return result.sort((a, b) => {
        if (a.favorite && !b.favorite) return -1;
        if (!a.favorite && b.favorite) return 1;

        switch (sortBy) {
            case 'name': return a.name.localeCompare(b.name);
            case 'time': return ((a.prepTime || 0) + (a.cookTime || 0)) - ((b.prepTime || 0) + (b.cookTime || 0));
            case 'rating': 
                const rateA = a.reviews?.length ? a.reviews.reduce((s, r) => s + r.rating, 0) / a.reviews.length : 0;
                const rateB = b.reviews?.length ? b.reviews.reduce((s, r) => s + r.rating, 0) / b.reviews.length : 0;
                return rateB - rateA;
            case 'calories': return (a.nutrition?.calories || 9999) - (b.nutrition?.calories || 9999);
            default: return a.name.localeCompare(b.name);
        }
    });
  }, [recipes, selectedCategory, searchQuery, showArchived, sortBy, selectedTags, filterFavorites, familyFilter]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    recipes.forEach(r => r.tags.forEach(t => tags.add(t)));
    return ['All', 'Favorites', ...Array.from(tags).sort()];
  }, [recipes]);

  // --- Handlers ---

  const handleToggleTag = (tag: string) => {
    if (tag === 'All') {
        setSelectedTags(new Set());
        setFilterFavorites(false);
        return;
    }
    if (tag === 'Favorites') {
        setFilterFavorites(!filterFavorites);
        return;
    }
    const next = new Set(selectedTags);
    if (next.has(tag)) next.delete(tag); else next.add(tag);
    setSelectedTags(next);
  };

  const performSave = async (recipe: Recipe) => {
      await db.upsertRecipe(recipe);
      await loadData();
      setIsFormOpen(false);
      setEditingRecipe(null);
      setPendingRecipeSave(null);
  };

  const handleSaveRecipe = async (recipe: Recipe) => {
    if (recipe.shareToFamily && !db.hasAuthToken()) {
        setPendingRecipeSave(recipe);
        setShowAuthModal(true);
        return;
    }
    await performSave(recipe);
  };

  const handleAuthSuccess = () => {
      if (pendingRecipeSave) {
          performSave(pendingRecipeSave);
      }
      db.getAllRecipes(); 
  };

  const handleToggleFavorite = async (e: React.MouseEvent | null, recipe: Recipe) => {
    if (e) e.stopPropagation();
    const updated = { ...recipe, favorite: !recipe.favorite };
    await db.upsertRecipe(updated);
    await loadData();
  };

  const handleDeleteRecipe = async (id: string) => {
    const recipe = recipes.find(r => r.id === id);
    if (recipe?.shareToFamily && !db.hasAuthToken()) {
        setShowAuthModal(true);
        return;
    }
    if(!confirm('Delete this recipe? This cannot be undone.')) return;
    await db.deleteRecipe(id);
    await loadData();
    setIsFormOpen(false);
    setEditingRecipe(null);
    setActiveRecipeId(null);
  };

  const getSyncStatus = () => {
      if (!settings.autoSync) return { icon: <RefreshCw size={10} />, text: 'Paused', color: 'text-gray-400' };
      if (!isOnline) return { icon: <CloudOff size={10} />, text: 'Offline', color: 'text-yellow-500' };
      if (pendingSyncIds.size > 0) return { icon: <Loader2 size={10} className="animate-spin" />, text: 'Syncing...', color: 'text-blue-500' };
      return { icon: <Cloud size={10} />, text: 'Synced', color: 'text-primary' };
  };

  const syncStatus = getSyncStatus();

  // --- Render ---

  if (loading) return <div className="flex items-center justify-center h-screen bg-background-light dark:bg-background-dark text-primary">Loading MyKitchen...</div>;

  return (
    <div className="flex h-screen overflow-hidden font-display bg-background-light dark:bg-background-dark text-text-main dark:text-text-main-dark transition-colors duration-200">
      
      {/* Sidebar */}
      <aside 
        className={`fixed md:relative inset-y-0 left-0 z-40 transform transition-all duration-300 border-r border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark flex flex-col ${isMobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'} ${isSidebarCollapsed ? 'md:w-20' : 'md:w-64'}`}
      >
        <div className={`p-6 flex items-center h-[72px] ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
            {!isSidebarCollapsed ? (
                <div>
                    <h1 className="text-xl font-bold dark:text-white whitespace-nowrap">MyKitchen</h1>
                    <button onClick={toggleAutoSync} className={`text-xs whitespace-nowrap flex items-center gap-1 ${syncStatus.color} hover:underline`} title="Click to toggle auto-sync">
                        {syncStatus.icon} {syncStatus.text}
                    </button>
                </div>
            ) : (
                <span className="material-symbols-outlined text-primary text-3xl">local_dining</span>
            )}
            <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden"><span className="material-symbols-outlined">close</span></button>
        </div>

        {/* Desktop Sidebar Toggle */}
        <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden md:flex absolute -right-3 top-20 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-full p-1 text-text-muted hover:text-primary shadow-sm z-50 items-center justify-center"
        >
            {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto mt-2">
            <div className="pb-4">
                <button 
                    onClick={() => { setCurrentView('recipes'); setIsMobileMenuOpen(false); }} 
                    className={`nav-btn ${currentView === 'recipes' ? 'active' : ''} ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
                    title="Recipes"
                >
                    <span className="material-symbols-outlined">menu_book</span> 
                    {!isSidebarCollapsed && "Recipes"}
                </button>
                <button 
                    onClick={() => { setCurrentView('recommendations'); setIsMobileMenuOpen(false); }} 
                    className={`nav-btn ${currentView === 'recommendations' ? 'active' : ''} ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
                    title="Recommendations"
                >
                    <span className="material-symbols-outlined">kitchen</span> 
                    {!isSidebarCollapsed && "What can I make?"}
                </button>
                <button 
                    onClick={() => { setCurrentView('planner'); setIsMobileMenuOpen(false); }} 
                    className={`nav-btn ${currentView === 'planner' ? 'active' : ''} ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
                    title="Planner"
                >
                    <span className="material-symbols-outlined">calendar_month</span> 
                    {!isSidebarCollapsed && "Planner"}
                </button>
                <button 
                    onClick={() => { setCurrentView('shopping'); setIsMobileMenuOpen(false); }} 
                    className={`nav-btn ${currentView === 'shopping' ? 'active' : ''} ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
                    title="Shopping List"
                >
                    <span className="material-symbols-outlined">shopping_cart</span> 
                    {!isSidebarCollapsed && "Shopping List"}
                </button>
            </div>
            
             <div className={`border-t border-border-light dark:border-border-dark pt-4 ${isSidebarCollapsed ? 'flex flex-col items-center gap-4' : 'space-y-1'}`}>
                 {!isSidebarCollapsed && <h4 className="text-xs font-bold uppercase text-text-muted px-3 mb-2">Filters</h4>}
                 
                 {!isSidebarCollapsed ? (
                    <>
                        <div onClick={() => setShowArchived(!showArchived)} className="flex items-center gap-3 px-3 py-2 cursor-pointer text-sm text-text-muted hover:text-text-main dark:hover:text-white transition-colors select-none">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${showArchived ? 'bg-primary border-primary' : 'border-gray-400 bg-transparent'}`}>
                                {showArchived && <span className="material-symbols-outlined text-white text-[10px]">check</span>}
                            </div>
                            <span className="font-medium">Show Archived</span>
                        </div>
                        
                        <div className="px-3 py-2">
                             <div className="flex bg-gray-100 dark:bg-white/5 rounded-lg p-1">
                                 <button onClick={() => setFamilyFilter('all')} className={`flex-1 text-xs font-bold py-1 rounded ${familyFilter === 'all' ? 'bg-white dark:bg-surface-dark shadow text-primary' : 'text-text-muted'}`}>All</button>
                                 <button onClick={() => setFamilyFilter('mine')} className={`flex-1 text-xs font-bold py-1 rounded ${familyFilter === 'mine' ? 'bg-white dark:bg-surface-dark shadow text-primary' : 'text-text-muted'}`}>Mine</button>
                                 <button onClick={() => setFamilyFilter('family')} className={`flex-1 text-xs font-bold py-1 rounded ${familyFilter === 'family' ? 'bg-white dark:bg-surface-dark shadow text-primary' : 'text-text-muted'}`}>Family</button>
                             </div>
                        </div>
                    </>
                 ) : (
                    <>
                         <button onClick={() => setShowArchived(!showArchived)} className={`nav-btn justify-center px-0 ${showArchived ? 'text-primary' : ''}`} title="Archived">
                            <span className="material-symbols-outlined">archive</span>
                         </button>
                         <button onClick={() => setFamilyFilter(familyFilter === 'all' ? 'mine' : 'all')} className={`nav-btn justify-center px-0 ${familyFilter !== 'all' ? 'text-primary' : ''}`} title="Family Filter">
                            <Users size={20} />
                         </button>
                    </>
                 )}
             </div>
        </nav>
        <div className={`p-4 border-t border-border-light dark:border-border-dark flex items-center ${isSidebarCollapsed ? 'justify-center flex-col gap-4' : 'justify-between'}`}>
            <div className={`flex items-center ${isSidebarCollapsed ? 'flex-col gap-4' : 'gap-3'}`}>
                <button onClick={handleImportClick} className="text-gray-500 hover:text-primary transition-colors" title="Import Recipes"><Upload size={18} /></button>
                <button onClick={() => setShowExportModal(true)} className="text-gray-500 hover:text-primary transition-colors" title="Backup/Export"><Download size={18} /></button>
            </div>
            <button onClick={toggleTheme} className="text-gray-500 hover:text-primary transition-colors">{settings.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
        </div>
        <input type="file" ref={fileInputRef} onChange={handleFileImport} className="hidden" accept=".json" />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full relative">
        
        {currentView === 'planner' && <MealPlanner onOpenMenu={() => setIsMobileMenuOpen(true)} allRecipes={recipes} />}
        {currentView === 'shopping' && <ShoppingList onOpenMenu={() => setIsMobileMenuOpen(true)} allTags={availableTags} pinnedTags={pinnedTags} onOpenRecipe={(id) => setActiveRecipeId(id)} />}
        {currentView === 'recommendations' && <Recommendations onOpenMenu={() => setIsMobileMenuOpen(true)} recipes={recipes} onOpenRecipe={(r) => setActiveRecipeId(r.id)} />}

        {currentView === 'recipes' && (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                <div className="md:hidden p-4 flex items-center gap-3 bg-surface-light dark:bg-surface-dark border-b border-border-light dark:border-border-dark sticky top-0 z-10">
                    <button onClick={() => setIsMobileMenuOpen(true)} className="p-1 -ml-1 shrink-0 text-text-main dark:text-white">
                        <span className="material-symbols-outlined">menu</span>
                    </button>
                    <div className="relative flex-1">
                         <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                         <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search recipes..." className="w-full pl-10 pr-4 py-2 rounded-lg bg-background-light dark:bg-background-dark border-none focus:ring-2 focus:ring-primary text-sm text-text-main dark:text-white placeholder:text-text-muted" />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-8">
                     <div className="max-w-7xl mx-auto space-y-6">
                         <div className="flex flex-col md:flex-row gap-4 justify-between">
                             <div className="relative flex-1 max-w-lg hidden md:block">
                                 <Search className="absolute left-3 top-2.5 text-text-muted" size={18} />
                                 <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search recipes..." className="w-full pl-10 pr-4 py-2 rounded-lg bg-surface-light dark:bg-surface-dark border-none focus:ring-2 focus:ring-primary" />
                             </div>
                             <div className="flex gap-2 items-center">
                                 <div className="relative group">
                                     <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                                         <ArrowUpDown size={14} className="text-text-muted" />
                                     </div>
                                     <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className="pl-8 pr-8 py-2 rounded-lg bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark focus:ring-2 focus:ring-primary appearance-none cursor-pointer text-sm font-bold text-text-muted hover:text-text-main dark:hover:text-white transition-colors">
                                         <option value="name">Name (A-Z)</option>
                                         <option value="time">Fastest</option>
                                         <option value="rating">Highest Rated</option>
                                         <option value="calories">Lowest Calories</option>
                                     </select>
                                 </div>
                             </div>
                         </div>

                         <div className="flex gap-2">
                             {['All', 'Entrees', 'Sides', 'Desserts'].map(cat => (
                                 <button key={cat} onClick={() => setSelectedCategory(cat as any)} className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${selectedCategory === cat ? 'bg-primary text-white' : 'bg-surface-light dark:bg-surface-dark text-text-muted hover:bg-gray-100 dark:hover:bg-white/5'}`}>
                                     {cat}
                                 </button>
                             ))}
                         </div>

                         <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                             {availableTags.map(tag => {
                                 const isActive = tag === 'All' ? (selectedTags.size === 0 && !filterFavorites) : (tag === 'Favorites' ? filterFavorites : selectedTags.has(tag));
                                 return (
                                     <button key={tag} onClick={() => handleToggleTag(tag)} className={`px-3 py-1 rounded border text-xs font-bold whitespace-nowrap transition-colors ${isActive ? 'bg-text-main dark:bg-white text-white dark:text-text-main border-transparent' : 'border-border-light dark:border-border-dark text-text-muted'}`}>
                                         {tag}
                                     </button>
                                 );
                             })}
                         </div>

                         {filteredRecipes.length === 0 ? (
                             <div className="text-center py-20 text-text-muted border-2 border-dashed border-border-light dark:border-border-dark rounded-2xl">
                                 <p>No recipes found.</p>
                             </div>
                         ) : (
                             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
                                 {filteredRecipes.map(recipe => (
                                     <RecipeCard key={recipe.id} recipe={recipe} onClick={(r) => setActiveRecipeId(r.id)} onToggleFavorite={handleToggleFavorite} />
                                 ))}
                             </div>
                         )}
                     </div>
                </div>

                <button onClick={() => { setEditingRecipe(null); setIsFormOpen(true); }} className="absolute bottom-6 right-6 size-14 bg-primary text-white rounded-full shadow-xl flex items-center justify-center hover:scale-105 transition-transform z-30">
                    <Plus size={28} />
                </button>
            </div>
        )}

      </main>

      {(isFormOpen || editingRecipe) && (
        <RecipeForm 
            initialData={editingRecipe} 
            onClose={() => { setIsFormOpen(false); setEditingRecipe(null); }} 
            onSave={handleSaveRecipe} 
            onDelete={handleDeleteRecipe}
        />
      )}

      {activeRecipeId && !editingRecipe && (
        <RecipeDetail 
            recipeId={activeRecipeId}
            onClose={() => setActiveRecipeId(null)} 
            onEdit={(r) => { setActiveRecipeId(null); setEditingRecipe(r); }} 
            onRefreshList={loadData}
        />
      )}

      {showAuthModal && <AuthModal onClose={() => { setShowAuthModal(false); setPendingRecipeSave(null); }} onSuccess={handleAuthSuccess} />}
      {showExportModal && <ExportModal onClose={() => setShowExportModal(false)} onExport={handleExport} totalRecipes={recipes.length} />}
      
      {isMobileMenuOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>}

      <style>{`
        .nav-btn { display: flex; align-items: center; gap: 0.75rem; width: 100%; padding: 0.75rem 1rem; border-radius: 0.5rem; color: #4e9767; font-weight: 500; font-size: 0.875rem; transition: all; }
        .nav-btn:hover { background-color: rgba(23, 207, 84, 0.1); color: #17cf54; }
        .nav-btn.active { background-color: rgba(23, 207, 84, 0.1); color: #17cf54; font-weight: 700; }
        .dark .nav-btn { color: #8bc49e; }
        .dark .nav-btn:hover, .dark .nav-btn.active { color: #17cf54; }
        .btn-secondary { display: flex; align-items: center; justify-content: center; padding: 0.5rem 1rem; background-color: white; border-radius: 0.5rem; font-size: 0.75rem; font-weight: 700; color: #0e1b12; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); cursor: pointer; }
        .dark .btn-secondary { background-color: #1a2c20; color: white; }
        .btn-secondary:hover { background-color: #f3f4f6; }
        .dark .btn-secondary:hover { background-color: #2a4030; }
      `}</style>
    </div>
  );
};

export default App;
