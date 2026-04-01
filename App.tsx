
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Recipe, AppSettings, RecipeCategory, SortOption, Review } from './types';
import * as db from './services/db';
import { ENABLE_RESTAURANTS } from './constants';
import { v4 as uuidv4 } from 'uuid';
import { sanitize } from './utils/validation';
import RecipeCard from './components/RecipeCard';
import RecipeDetail from './components/RecipeDetail';
import RecipeForm from './components/RecipeForm';
import ShoppingList from './components/ShoppingList';
import MealPlanner from './components/MealPlanner';
import Recommendations from './components/Recommendations';
import RestaurantList from './components/RestaurantList';
import AuthModal from './components/AuthModal';
import ExportModal, { ExportOptions } from './components/ExportModal';
import PublicRecipeView from './components/PublicRecipeView';
import SortMenu from './components/SortMenu';
import DeleteConfirmationModal from './components/DeleteConfirmationModal';
import { Search, Moon, Sun, Plus, ChevronLeft, ChevronRight, Cloud, CloudOff, Upload, Users, User, RefreshCw, Download, Loader2, UtensilsCrossed, LogOut, RefreshCcw, AlertCircle, Check, BookOpen, Sparkles, Calendar, ShoppingCart, Menu, X as CloseIcon, Archive, Refrigerator } from 'lucide-react';
import Checkbox from './components/Checkbox';

const App: React.FC = () => {
  const NAV_BTN_BASE = "flex items-center gap-4 px-5 py-3 rounded-lg text-sm font-medium transition-all w-full";
  const NAV_BTN_INACTIVE = "text-text-secondary dark:text-text-secondary-dark hover:bg-white/5 dark:hover:bg-white/5 hover:text-forest-green dark:hover:text-white";
  const NAV_BTN_ACTIVE = "bg-forest-green text-white dark:bg-active-green dark:text-accent-herb font-bold shadow-sm hover:bg-forest-green/90 dark:hover:bg-active-green/90";

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [pinnedTags, setPinnedTags] = useState<string[]>(['Dinner', 'Healthy', 'Quick']); // Defaults
  const [settings, setSettings] = useState<AppSettings>({ theme: 'system', autoSync: true });
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncIds, setPendingSyncIds] = useState<Set<string>>(new Set());
  
  // View State
  const [currentView, setCurrentView] = useState<'recipes' | 'shopping' | 'planner' | 'settings' | 'recommendations' | 'restaurants'>('recipes');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sharedRecipeId, setSharedRecipeId] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);

  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<RecipeCategory | 'All'>('All');
  
  // Filters
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [familyFilter, setFamilyFilter] = useState<'all' | 'mine' | 'family'>('all');
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('name');
  
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  // Auth State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalView, setAuthModalView] = useState<'login' | 'register' | 'switch'>('login');
  const [showExportModal, setShowExportModal] = useState(false);
  
  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [recipeToDelete, setRecipeToDelete] = useState<Recipe | null>(null);
  
  // State to hold a recipe that is waiting for authentication to be saved
  const [pendingRecipeSave, setPendingRecipeSave] = useState<Recipe | null>(null);

  // Toast State
  const [toast, setToast] = useState<{ message: string, visible: boolean, type?: 'success' | 'error' }>({ message: '', visible: false, type: 'success' });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
      setToast({ message, visible: true, type });
      setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
  };

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
        let reviewsToImport: any[] = [];

        if (Array.isArray(imported)) {
            recipesToImport = imported;
        } else {
            if (imported.recipes && Array.isArray(imported.recipes)) {
                recipesToImport = imported.recipes;
            } else if (imported.name) {
                 recipesToImport = [imported];
            }
            
            if (imported.reviews && Array.isArray(imported.reviews)) {
                reviewsToImport = imported.reviews;
            }
        }
        
        let count = 0;
        let reviewCount = 0;

        // Import reviews from top-level if exists
        for (const r of reviewsToImport) {
            await db.addReview(r);
            reviewCount++;
        }

        for (const r of recipesToImport) {
            if (r.name && r.ingredients && r.instructions) {
                const shouldShare = r.shareToFamily !== undefined ? r.shareToFamily : false;
                
                // Extract legacy embedded reviews
                if (r.reviews && Array.isArray(r.reviews)) {
                    for (const oldR of r.reviews) {
                        const newReview: Review = {
                            id: oldR.id || uuidv4(),
                            targetId: r.id,
                            targetType: 'recipe',
                            rating: oldR.rating,
                            date: oldR.date,
                            text: oldR.text
                        };
                        await db.addReview(newReview);
                        reviewCount++;
                    }
                }

                // Remove legacy reviews if present in import
                const { reviews, ...cleanRecipe } = r;
                await db.upsertRecipe({ ...cleanRecipe, shareToFamily: shouldShare });
                count++;
            }
        }

        await loadData();
        showToast(`Imported ${count} recipes and ${reviewCount} reviews.`, 'success');
      } catch (err) {
        console.error(err);
        showToast('Failed to import recipes. Invalid JSON.', 'error');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleExport = async (options: ExportOptions) => {
    const dataToExport: any = {
      version: 1,
      timestamp: Date.now(),
      recipes: recipes, 
    };

    if (options.includeReviews) {
        const allReviews = await db.getAllReviews();
        dataToExport.reviews = allReviews;
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
            
            // Preload restaurants if enabled
            if (ENABLE_RESTAURANTS) {
                db.getRestaurants(); 
            }

            // Sync Process:
            // 1. Push pending local changes
            // 2. Pull remote changes
            if (navigator.onLine && db.hasAuthToken()) {
                await db.retrySync();
                db.syncDown();
            }
        } catch (e) {
            console.error("Initialization failed", e);
        } finally {
            setLoading(false);
        }
    };
    init();

    // Listen for auth requests from DB service
    db.setAuthCallback(() => {
        setAuthModalView('login');
        setShowAuthModal(true);
    });

    // Listen for background sync updates - NOW ONLY RELOADS LOCAL DATA
    const handleUpdates = () => loadData();
    window.addEventListener('recipes-updated', handleUpdates);
    
    // Listen for queue updates separately to update status indicator instantly
    const handleQueueUpdate = async () => {
        const queue = await db.getSyncQueue();
        setPendingSyncIds(new Set(queue.map(q => q.id)));
    };
    window.addEventListener('queue-updated', handleQueueUpdate);
    
    // Check for shared recipe link
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get('shared_recipe') || params.get('recipeId');
    const token = params.get('share');
    
    if (sharedId && token) {
        setSharedRecipeId(sharedId);
        setShareToken(token);
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
    } else if (sharedId) {
        // Legacy support or internal link
        setSharedRecipeId(sharedId);
        window.history.replaceState({}, '', window.location.pathname);
    }

    // Listen for visibility change to sync when app comes to foreground
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && navigator.onLine && db.hasAuthToken()) {
            console.log("App foregrounded, syncing...");
            db.retrySync();
            db.syncDown();
        }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
        window.removeEventListener('recipes-updated', handleUpdates);
        window.removeEventListener('queue-updated', handleQueueUpdate);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Monitor Online Status
  useEffect(() => {
    const handleOnline = () => {
        setIsOnline(true);
        if (db.hasAuthToken()) {
            db.retrySync();
            db.syncDown();
        }
    };
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
      if (newSettings.autoSync) {
          db.syncDown();
          loadData(); 
      }
  };

  // --- Computed ---

  const currentFamilyId = db.getCurrentFamilyId();

  const joinedFamilies = useMemo(() => {
    const sessions = db.getSavedSessions();
    return sessions.map(s => ({
      ...s,
      recipeCount: recipes.filter(r => r.shareToFamily && (r.familyId === s.id || (r.tenantIds && r.tenantIds?.includes(s.id)))).length
    })).sort((a, b) => b.recipeCount - a.recipeCount);
  }, [recipes]);

  const filteredRecipes = useMemo(() => {
    let result = recipes;

    // Filter Logic
    if (familyFilter === 'mine') {
        // Show local only (not shared)
        result = result.filter(r => !r.shareToFamily);
    } else if (familyFilter === 'family') {
        // Show recipes for a specific family if selected, otherwise all shared
        if (selectedFamilyId) {
            result = result.filter(r => r.shareToFamily && (r.familyId === selectedFamilyId || (r.tenantIds && r.tenantIds.includes(selectedFamilyId))));
        } else {
            result = result.filter(r => r.shareToFamily);
        }
    } else if (familyFilter === 'all') {
        // "All" shows all recipes from all joined families (shared recipes)
        // We also include private recipes here to match "All" expectation, 
        // but the user specifically asked for "all recipes from all joined families".
        // I'll include both for a true "All" view, or just shared if that's the intent.
        // Given the request, I'll filter to shared recipes only for "All".
        result = result.filter(r => r.shareToFamily);
    }

    if (!showArchived) result = result.filter(r => !r.archived);
    if (selectedCategory !== 'All') result = result.filter(r => r.category === selectedCategory);
    if (filterFavorites) result = result.filter(r => r.favorite);

    if (selectedTags.size > 0) {
        result = result.filter(r => {
            for (const tag of selectedTags) {
                const hasTag = r.tags.includes(tag);
                const isAuthor = r.addedBy === tag;
                if (!hasTag && !isAuthor) return false;
            }
            return true;
        });
    }

    if (searchQuery) {
      const q = sanitize(searchQuery).toLowerCase();
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
  }, [recipes, selectedCategory, searchQuery, showArchived, sortBy, selectedTags, filterFavorites, familyFilter, currentFamilyId]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    recipes.forEach(r => {
        r.tags.forEach(t => tags.add(t));
        if (r.addedBy) tags.add(r.addedBy);
    });
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
        setAuthModalView('login');
        setShowAuthModal(true);
        return;
    }
    await performSave(recipe);
  };

  const handleAuthSuccess = () => {
      if (pendingRecipeSave) {
          performSave(pendingRecipeSave);
      }
      loadData(); 
  };

  const handleToggleFavorite = async (e: React.MouseEvent | null, recipe: Recipe) => {
    if (e) e.stopPropagation();
    const updated = { ...recipe, favorite: !recipe.favorite };
    // Pass localOnly: true to prevent syncing favorite status
    await db.upsertRecipe(updated, { localOnly: true });
    await loadData();
  };

  const handleDeleteRecipe = async (id: string) => {
    const recipe = recipes.find(r => r.id === id);
    if (!recipe) return;

    if (recipe.shareToFamily && !db.hasAuthToken()) {
        setAuthModalView('login');
        setShowAuthModal(true);
        return;
    }
    
    setRecipeToDelete(recipe);
    setShowDeleteModal(true);
  };

  const confirmDeleteRecipe = async (selectedFamilyIds: string[]) => {
      if (!recipeToDelete) return;

      const currentFamilyId = db.getCurrentFamilyId();
      const promises: Promise<any>[] = [];

      for (const familyId of selectedFamilyIds) {
          if (familyId === 'private' || familyId === currentFamilyId) {
              // Local Delete (handles sync if needed)
              promises.push(db.deleteRecipe(recipeToDelete.id));
          } else {
              // Cross Delete
              promises.push(db.crossDeleteRecipe(recipeToDelete.id, familyId));
          }
      }

      try {
          await Promise.all(promises);
          await loadData();
          setIsFormOpen(false);
          setEditingRecipe(null);
          setActiveRecipeId(null);
      } catch (e: any) {
          console.error(e);
          showToast(`Failed to delete: ${e.message}`, 'error');
      } finally {
          setShowDeleteModal(false);
          setRecipeToDelete(null);
      }
  };

  const getSyncStatus = () => {
      if (!settings.autoSync) return { icon: <RefreshCw size={10} />, text: 'Paused', color: 'text-gray-400' };
      if (!isOnline) return { icon: <CloudOff size={10} />, text: 'Offline', color: 'text-yellow-500' };
      if (pendingSyncIds.size > 0) return { icon: <Loader2 size={10} className="animate-spin" />, text: 'Syncing...', color: 'text-blue-500' };
      return { icon: <Cloud size={10} />, text: 'Synced', color: 'text-primary' };
  };

  const syncStatus = getSyncStatus();
  const currentFamilyName = db.getCurrentFamilyName();

  // --- Render ---

  if (loading) return <div className="flex items-center justify-center h-screen bg-background-light dark:bg-background-dark text-primary">Loading MyKitchen...</div>;

  if (sharedRecipeId) {
      return <PublicRecipeView recipeId={sharedRecipeId} onClose={() => setSharedRecipeId(null)} />;
  }

  return (
    <div className="flex h-screen overflow-hidden font-sans bg-bg-white dark:bg-bg-dark text-text-main dark:text-white transition-colors duration-200">
      
      {/* Sidebar */}
      <aside 
        className={`fixed md:relative inset-y-0 left-0 z-[100] transform transition-all duration-300 border-r border-border-thin dark:border-border-dark bg-sidebar-mint dark:bg-sidebar-dark flex flex-col ${isMobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'} ${isSidebarCollapsed ? 'md:w-20' : 'md:w-64'}`}
      >
        <div className={`p-6 flex items-center h-24 ${isSidebarCollapsed ? 'justify-center' : 'justify-start gap-3'}`}>
            {!isSidebarCollapsed ? (
                <>
                    <UtensilsCrossed className="size-8 text-accent-herb" />
                    <h1 className="text-2xl font-black tracking-tightest text-text-main dark:text-white uppercase">MyKitchen</h1>
                </>
            ) : (
                <UtensilsCrossed className="size-8 text-accent-herb" />
            )}
            <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden ml-auto text-text-secondary hover:text-text-main dark:hover:text-white transition-colors">
                <CloseIcon size={24} />
            </button>
        </div>

        {/* Desktop Sidebar Toggle */}
        <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden md:flex absolute -right-3 top-20 bg-white dark:bg-card-dark border border-border-thin dark:border-border-dark rounded-full p-1 text-text-secondary hover:text-forest-green dark:hover:text-white shadow-sm z-50 items-center justify-center transition-colors"
        >
            {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto mt-2">
            <div className="pb-4 space-y-1">
                <button 
                    onClick={() => { setCurrentView('recipes'); setIsMobileMenuOpen(false); setActiveRecipeId(null); }} 
                    className={`${NAV_BTN_BASE} ${currentView === 'recipes' && !activeRecipeId ? NAV_BTN_ACTIVE : NAV_BTN_INACTIVE} ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
                    title="Recipes"
                >
                    <BookOpen size={20} className={currentView === 'recipes' && !activeRecipeId ? 'text-white dark:text-accent-herb' : ''} /> 
                    {!isSidebarCollapsed && "Recipes"}
                </button>
                <button 
                    onClick={() => { setCurrentView('recommendations'); setIsMobileMenuOpen(false); setActiveRecipeId(null); }} 
                    className={`${NAV_BTN_BASE} ${currentView === 'recommendations' ? NAV_BTN_ACTIVE : NAV_BTN_INACTIVE} ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
                    title="What can I make?"
                >
                    <Refrigerator size={20} className={currentView === 'recommendations' ? 'text-white dark:text-accent-herb' : ''} /> 
                    {!isSidebarCollapsed && "What can I make?"}
                </button>
                <button 
                    onClick={() => { setCurrentView('planner'); setIsMobileMenuOpen(false); setActiveRecipeId(null); }} 
                    className={`${NAV_BTN_BASE} ${currentView === 'planner' ? NAV_BTN_ACTIVE : NAV_BTN_INACTIVE} ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
                    title="Planner"
                >
                    <Calendar size={20} className={currentView === 'planner' ? 'text-white dark:text-accent-herb' : ''} /> 
                    {!isSidebarCollapsed && "Planner"}
                </button>
                <button 
                    onClick={() => { setCurrentView('shopping'); setIsMobileMenuOpen(false); setActiveRecipeId(null); }} 
                    className={`${NAV_BTN_BASE} ${currentView === 'shopping' ? NAV_BTN_ACTIVE : NAV_BTN_INACTIVE} ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
                    title="Shopping List"
                >
                    <ShoppingCart size={20} className={currentView === 'shopping' ? 'text-white dark:text-accent-herb' : ''} /> 
                    {!isSidebarCollapsed && "Shopping List"}
                </button>
                
                {/* Eat Out Module */}
                {ENABLE_RESTAURANTS && (
                    <button 
                        onClick={() => { setCurrentView('restaurants'); setIsMobileMenuOpen(false); setActiveRecipeId(null); }} 
                        className={`${NAV_BTN_BASE} ${currentView === 'restaurants' ? NAV_BTN_ACTIVE : NAV_BTN_INACTIVE} ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
                        title="Eat Out"
                    >
                        <UtensilsCrossed size={20} className={currentView === 'restaurants' ? 'text-white dark:text-accent-herb' : ''} />
                        {!isSidebarCollapsed && "Eat Out"}
                    </button>
                )}
            </div>
            
             <div className={`border-t border-border-thin dark:border-border-dark pt-4 ${isSidebarCollapsed ? 'flex flex-col items-center gap-4' : 'space-y-1'}`}>
                 {!isSidebarCollapsed && <h4 className="text-xs font-bold uppercase text-text-secondary px-3 mb-2 tracking-wider">Filters</h4>}
                 
                 {!isSidebarCollapsed ? (
                    <>
                        <div className="px-3 py-2">
                            <Checkbox 
                                checked={showArchived} 
                                onChange={setShowArchived} 
                                label="Show Archived" 
                                size="md"
                                className="hover:bg-white dark:hover:bg-white/5 p-2 -m-2 rounded-lg transition-colors"
                            />
                        </div>
                        
                        <div className="px-3 py-2">
                                     <div className="flex bg-gray-200 dark:bg-black/40 rounded-lg p-1 relative">
                                         {['all', 'mine', 'family'].map((filter) => (
                                             <button 
                                                key={filter}
                                                onClick={() => setFamilyFilter(filter as any)} 
                                                className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-colors relative z-10 ${
                                                    familyFilter === filter 
                                                        ? 'text-white dark:text-white' 
                                                        : 'text-text-secondary dark:text-text-secondary-dark hover:text-text-main dark:hover:text-white'
                                                }`}
                                             >
                                                 {filter.charAt(0).toUpperCase() + filter.slice(1)}
                                                 {familyFilter === filter && (
                                                     <motion.div
                                                         layoutId="activeFilter"
                                                         className="absolute inset-0 bg-forest-green dark:bg-accent-herb rounded-md shadow-sm -z-10"
                                                         transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                                     />
                                                 )}
                                             </button>
                                         ))}
                                     </div>
                        </div>

                        {familyFilter === 'family' && joinedFamilies.length > 1 && (
                            <motion.div 
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="px-3 space-y-2 mt-2"
                            >
                                <h5 className="text-[10px] font-bold uppercase text-text-secondary px-1 mb-1 tracking-widest">Shared Libraries</h5>
                                {joinedFamilies.map((family, idx) => {
                                    const colors = [
                                        'bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/50',
                                        'bg-amber-50/50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-800/50',
                                        'bg-rose-50/50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-800/50',
                                        'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/50',
                                    ];
                                    const colorClass = colors[idx % colors.length];
                                    const isActive = selectedFamilyId === family.id;

                                    return (
                                        <button
                                            key={family.id}
                                            onClick={() => setSelectedFamilyId(isActive ? null : family.id)}
                                            className={`w-full text-left p-3 rounded-xl transition-all border group relative overflow-hidden ${
                                                isActive 
                                                    ? 'ring-2 ring-forest-green dark:ring-accent-herb border-transparent shadow-md scale-[1.02]' 
                                                    : `${colorClass} hover:scale-[1.01] hover:shadow-sm`
                                            }`}
                                        >
                                            <div className={`font-bold text-sm transition-colors ${isActive ? 'text-forest-green dark:text-accent-herb' : 'text-text-main dark:text-white'}`}>
                                                {family.name}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1.5">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                                    isActive 
                                                        ? 'bg-forest-green text-white dark:bg-accent-herb dark:text-black' 
                                                        : 'bg-black/5 dark:bg-white/10 text-text-secondary dark:text-gray-400'
                                                }`}>
                                                    {family.recipeCount} recipes
                                                </span>
                                            </div>
                                            {isActive && (
                                                <div className="absolute top-2 right-2">
                                                    <Check size={14} className="text-forest-green dark:text-accent-herb" />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </motion.div>
                        )}
                    </>
                 ) : (
                    <>
                         <button onClick={() => setShowArchived(!showArchived)} className={`${NAV_BTN_BASE} justify-center px-0 ${showArchived ? 'text-forest-green dark:text-accent-herb' : ''}`} title="Archived">
                            <Archive size={20} />
                         </button>
                         <button onClick={() => setFamilyFilter(familyFilter === 'all' ? 'mine' : 'all')} className={`${NAV_BTN_BASE} justify-center px-0 ${familyFilter !== 'all' ? 'text-forest-green dark:text-accent-herb' : ''}`} title="Family Filter">
                            <Users size={20} />
                         </button>
                    </>
                 )}
             </div>
        </nav>
        <div className={`p-4 border-t border-border-thin dark:border-border-dark flex items-center ${isSidebarCollapsed ? 'justify-center flex-col gap-4' : 'justify-between'}`}>
            <div className={`flex items-center ${isSidebarCollapsed ? 'flex-col gap-4' : 'gap-1'}`}>
                <button onClick={handleImportClick} className="p-2 text-text-secondary hover:text-forest-green dark:hover:text-white hover:bg-white dark:hover:bg-white/5 rounded-full transition-all" title="Import Recipes"><Upload size={18} /></button>
                <button onClick={() => setShowExportModal(true)} className="p-2 text-text-secondary hover:text-forest-green dark:hover:text-white hover:bg-white dark:hover:bg-white/5 rounded-full transition-all" title="Backup/Export"><Download size={18} /></button>
                <button 
                    onClick={() => { setAuthModalView('switch'); setShowAuthModal(true); }} 
                    className="p-2 text-text-secondary hover:text-forest-green dark:hover:text-white hover:bg-white dark:hover:bg-white/5 rounded-full transition-all" 
                    title="Switch Family / Logout"
                >
                    <Users size={18}/>
                </button>
            </div>
            <button onClick={toggleTheme} className="p-2 text-text-secondary hover:text-forest-green dark:hover:text-white hover:bg-white dark:hover:bg-white/5 rounded-full transition-all">{settings.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
        </div>
        <input type="file" ref={fileInputRef} onChange={handleFileImport} className="hidden" accept=".json" />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full relative bg-bg-subtle dark:bg-bg-dark">
        
        {activeRecipeId && !editingRecipe ? (
            <RecipeDetail 
                recipeId={activeRecipeId}
                onClose={() => setActiveRecipeId(null)} 
                onEdit={(r) => { setEditingRecipe(r); }} 
                onRefreshList={loadData}
            />
        ) : (
            <>
                {currentView === 'planner' && <MealPlanner onOpenMenu={() => setIsMobileMenuOpen(true)} allRecipes={recipes} />}
                {currentView === 'shopping' && <ShoppingList onOpenMenu={() => setIsMobileMenuOpen(true)} allTags={availableTags} pinnedTags={pinnedTags} onOpenRecipe={(id) => setActiveRecipeId(id)} />}
                {currentView === 'recommendations' && <Recommendations onOpenMenu={() => setIsMobileMenuOpen(true)} recipes={recipes} onOpenRecipe={(r) => setActiveRecipeId(r.id)} />}
                {currentView === 'restaurants' && ENABLE_RESTAURANTS && <RestaurantList onOpenMenu={() => setIsMobileMenuOpen(true)} />}

                {currentView === 'recipes' && (
                    <div className="flex-1 flex flex-col h-full overflow-hidden">
                        <div className="md:hidden p-4 flex items-center gap-3 bg-bg-white dark:bg-sidebar-dark border-b border-border-thin dark:border-border-dark sticky top-0 z-10">
                            <button onClick={() => setIsMobileMenuOpen(true)} className="p-1 -ml-1 shrink-0 text-text-main dark:text-white">
                                <Menu size={24} />
                            </button>
                            <div className="relative flex-1 group">
                                <Search className="absolute left-0 top-1/2 -translate-y-1/2 text-text-secondary dark:text-text-secondary-dark group-focus-within:text-forest-green dark:group-focus-within:text-accent-herb transition-colors" size={18} />
                                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search for recipes..." className="w-full pl-8 pr-4 py-2 bg-transparent border-b border-border-thin dark:border-border-dark focus:border-forest-green dark:focus:border-accent-herb focus:ring-0 text-base text-text-main dark:text-white placeholder:text-text-secondary outline-none transition-all font-normal" />
                            </div>
                            <SortMenu 
                                currentSort={sortBy} 
                                onSortChange={(val) => setSortBy(val as SortOption)} 
                                options={[
                                    { label: 'Name (A-Z)', value: 'name' },
                                    { label: 'Fastest', value: 'time' },
                                    { label: 'Top Rated', value: 'rating' },
                                    { label: 'Lowest Calories', value: 'calories' }
                                ]}
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 md:p-8">
                            <div className="max-w-7xl mx-auto space-y-8">
                                <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                                    <div className="relative flex-1 max-w-xl hidden md:block group">
                                        <Search className="absolute left-0 top-1/2 -translate-y-1/2 text-text-secondary dark:text-text-secondary-dark group-focus-within:text-forest-green dark:group-focus-within:text-accent-herb transition-colors" size={20} />
                                        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search for recipes..." className="w-full pl-8 pr-4 py-3 bg-transparent border-b border-border-thin dark:border-border-dark focus:border-forest-green dark:focus:border-accent-herb focus:ring-0 text-base text-text-main dark:text-white placeholder:text-text-secondary outline-none transition-all font-normal" />
                                    </div>
                                    <div className="hidden md:flex gap-2 items-center">
                                        <SortMenu 
                                            currentSort={sortBy} 
                                            onSortChange={(val) => setSortBy(val as SortOption)} 
                                            options={[
                                                { label: 'Name (A-Z)', value: 'name' },
                                                { label: 'Fastest', value: 'time' },
                                                { label: 'Top Rated', value: 'rating' },
                                                { label: 'Lowest Calories', value: 'calories' }
                                            ]}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center gap-4">
                                        <div className="flex gap-2">
                                            {['All', 'Entrees', 'Sides', 'Desserts'].map(cat => (
                                                <button key={cat} onClick={() => setSelectedCategory(cat as any)} className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${selectedCategory === cat ? 'bg-forest-green dark:bg-accent-herb text-white dark:text-white shadow-md transform scale-105' : 'bg-white dark:bg-card-dark text-text-secondary dark:text-text-secondary-dark hover:bg-gray-50 dark:hover:bg-card-hover border border-border-thin dark:border-border-dark hover:border-forest-green dark:hover:border-accent-herb'}`}>
                                                    {cat}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar items-center">
                                        {availableTags.map(tag => {
                                            const isActive = tag === 'All' ? (selectedTags.size === 0 && !filterFavorites) : (tag === 'Favorites' ? filterFavorites : selectedTags.has(tag));
                                            
                                            let activeClass = "bg-forest-green dark:bg-accent-herb text-white dark:text-white border-forest-green dark:border-accent-herb";
                                            if (tag === 'All') {
                                                activeClass = "bg-forest-green dark:bg-white text-white dark:text-black border-forest-green dark:border-white";
                                            } else if (tag === 'Favorites') {
                                                activeClass = "bg-forest-green dark:bg-card-dark text-white dark:text-accent-herb border-forest-green dark:border-border-dark";
                                            }

                                            return (
                                                <button key={tag} onClick={() => handleToggleTag(tag)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${isActive ? activeClass + ' shadow-sm' : 'bg-transparent border-border-thin dark:border-border-dark text-text-secondary dark:text-text-secondary-dark hover:border-forest-green dark:hover:border-gray-500'}`}>
                                                    {tag}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {filteredRecipes.length === 0 ? (
                                    <div className="text-center py-20 text-text-secondary rounded-2xl bg-white/50 dark:bg-card-dark/30">
                                        <p className="text-lg">No recipes found.</p>
                                        <p className="text-sm mt-2 opacity-70">Try adjusting your search or filters.</p>
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

                        <button onClick={() => { setEditingRecipe(null); setIsFormOpen(true); }} className="absolute bottom-8 right-8 size-16 bg-forest-green dark:bg-accent-herb text-white rounded-full shadow-xl hover:bg-forest-green/90 dark:hover:bg-herb-hover hover:scale-105 transition-all duration-300 group flex items-center justify-center z-30">
                            <Plus size={32} className="group-hover:rotate-90 transition-transform duration-300" />
                        </button>
                    </div>
                )}
            </>
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

      {showAuthModal && <AuthModal initialView={authModalView} onClose={() => { setShowAuthModal(false); setPendingRecipeSave(null); }} onSuccess={handleAuthSuccess} />}
      {showExportModal && <ExportModal onClose={() => setShowExportModal(false)} onExport={handleExport} totalRecipes={recipes.length} />}
      {showDeleteModal && recipeToDelete && (
          <DeleteConfirmationModal 
              isOpen={showDeleteModal} 
              itemName={recipeToDelete.name} 
              onClose={() => { setShowDeleteModal(false); setRecipeToDelete(null); }} 
              onConfirm={confirmDeleteRecipe} 
          />
      )}
      
      {isMobileMenuOpen && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] md:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>}

      {/* Toast Notification */}
      {toast.visible && (
          <div className={`fixed bottom-4 left-4 z-[200] px-4 py-3 rounded-lg shadow-xl text-white text-sm font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-300 ${toast.type === 'error' ? 'bg-red-500' : 'bg-forest-green dark:bg-white dark:text-black'}`}>
              {toast.type === 'error' ? <AlertCircle size={16} /> : <Check size={16} />}
              {toast.message}
          </div>
      )}
    </div>
  );
};

export default App;
