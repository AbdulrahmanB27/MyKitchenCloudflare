
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Search, Moon, Sun, Plus, ChevronLeft, ChevronRight, Cloud, CloudOff, Upload, Users, User, RefreshCw, Download, Loader2, UtensilsCrossed, LogOut, RefreshCcw, AlertCircle, Check, BookOpen, Sparkles, Calendar, ShoppingCart, Menu, X as CloseIcon, Archive, Refrigerator, Settings, Link as LinkIcon, ShieldCheck, Gamepad2, Play } from 'lucide-react';
import { Recipe, AppSettings, RecipeCategory, SortOption, Review } from './types';
import * as db from './services/db';
import { ENABLE_RESTAURANTS, ENABLE_RECIPE_SWIPE, ENABLE_VOICE_EXPERIMENTAL } from './constants';
import { v4 as uuidv4 } from 'uuid';
import { sanitize } from './utils/validation';
import { checkIngredientMatch, isSeasoning } from './utils/ingredients';
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
import CustomModal from './components/CustomModal';
import SettingsModal from './components/SettingsModal';
import RecipeSwipeMode from './components/RecipeSwipeMode';
import Checkbox from './components/Checkbox';
import MissingIngredientsBanner from './components/MissingIngredientsBanner';

const getRecipeSignature = (r: Recipe) => {
    const signatureObj = {
        name: r.name,
        description: r.description,
        ingredients: r.ingredients,
        instructions: r.instructions,
        prepTime: r.prepTime,
        prepTimeMax: r.prepTimeMax,
        cookTime: r.cookTime,
        cookTimeMax: r.cookTimeMax,
        servings: r.servings,
        yieldUnit: r.yieldUnit,
        category: r.category,
        tags: r.tags,
        image: r.image,
        video: r.video,
        source: r.source,
        nutrition: r.nutrition,
        storageNotes: r.storageNotes,
        cookware: r.cookware
    };
    return JSON.stringify(signatureObj);
};

const mergeIdenticalRecipes = (recipesList: Recipe[]) => {
    const signatureMap = new Map<string, Recipe>();
    
    for (const r of recipesList) {
        const sig = getRecipeSignature(r);
        if (signatureMap.has(sig)) {
            const existing = signatureMap.get(sig)!;
            const allTenants = new Set([
                ...(existing.tenantIds || []), 
                ...(r.tenantIds || []),
                existing.familyId !== 'private' ? existing.familyId : null,
                r.familyId !== 'private' ? r.familyId : null
            ].filter(Boolean) as string[]);
            
            existing.favorite = existing.favorite || r.favorite;
            existing.tenantIds = Array.from(allTenants);
            
            if (!existing.mergedIds) existing.mergedIds = [existing.id];
            if (!existing.mergedIds.includes(r.id)) {
                existing.mergedIds.push(r.id);
            }
        } else {
            const copy = JSON.parse(JSON.stringify(r));
            copy.mergedIds = [copy.id];
            signatureMap.set(sig, copy);
        }
    }
    return Array.from(signatureMap.values());
};

const App: React.FC = () => {
  const NAV_BTN_BASE = "flex items-center gap-4 px-5 py-3 rounded-lg text-sm font-medium transition-all w-full border border-transparent";
  const NAV_BTN_INACTIVE = "text-text-secondary dark:text-text-secondary-dark hover:bg-gray-50 dark:hover:bg-white/5 hover:text-forest-green dark:hover:text-white";
  const NAV_BTN_ACTIVE = "bg-forest-green/10 text-forest-green border-forest-green/20 dark:bg-active-green dark:border-transparent dark:text-accent-herb font-bold shadow-sm hover:bg-forest-green/20 dark:hover:bg-active-green/90";

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [pinnedTags, setPinnedTags] = useState<string[]>(['Dinner', 'Healthy', 'Quick']); // Defaults
  const [settings, setSettings] = useState<AppSettings>({ 
      theme: 'system', 
      autoSync: true,
      enableRestaurants: ENABLE_RESTAURANTS,
      enableRecipeSwipe: ENABLE_RECIPE_SWIPE,
      enableExperimentalVoice: ENABLE_VOICE_EXPERIMENTAL
  });
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
  const [isRecipeSwipeMode, setIsRecipeSwipeMode] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCookMode, setIsCookMode] = useState(false);
  
  // Auth State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [authModalView, setAuthModalView] = useState<'login' | 'register' | 'switch'>('login');
  const [authModalFamilyName, setAuthModalFamilyName] = useState('');
  
  // Public Link State
  const [publicFamilyView, setPublicFamilyView] = useState<{ familyName: string, recipes: Recipe[] } | null>(null);
  const [isLoadingLink, setIsLoadingLink] = useState(false);

  const [showExportModal, setShowExportModal] = useState(false);
  
  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [recipeToDelete, setRecipeToDelete] = useState<Recipe | null>(null);
  
  // Missing ingredients reminder
  const [upcomingMissingRecipes, setUpcomingMissingRecipes] = useState<Recipe[]>([]);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);
  
  // State to hold a recipe that is waiting for authentication to be saved
  const [pendingRecipeSave, setPendingRecipeSave] = useState<Recipe | null>(null);

  // Toast State
  const [toast, setToast] = useState<{ message: string, visible: boolean, type?: 'success' | 'error' }>({ message: '', visible: false, type: 'success' });

  // Custom Modal State
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'alert' | 'confirm';
    onConfirm?: () => void;
    onCancel?: () => void;
  }>({ isOpen: false, title: '', message: '', type: 'alert' });

  const showAlert = (title: string, message: string, onConfirm?: () => void) => {
    setModalState({
      isOpen: true,
      title,
      message,
      type: 'alert',
      onConfirm: () => {
        setModalState(prev => ({ ...prev, isOpen: false }));
        onConfirm?.();
      }
    });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => {
    setModalState({
      isOpen: true,
      title,
      message,
      type: 'confirm',
      onConfirm: () => {
        setModalState(prev => ({ ...prev, isOpen: false }));
        onConfirm();
      },
      onCancel: () => {
        setModalState(prev => ({ ...prev, isOpen: false }));
        onCancel?.();
      }
    });
  };

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

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Close modals in order of priority (most specific/nested first)
        if (showDeleteModal) {
          setShowDeleteModal(false);
          return;
        }
        if (showAuthModal) {
          setShowAuthModal(false);
          return;
        }
        if (showExportModal) {
          setShowExportModal(false);
          return;
        }
        if (isFormOpen) {
          setIsFormOpen(false);
          setEditingRecipe(null);
          return;
        }
        if (activeRecipeId) {
          setActiveRecipeId(null);
          return;
        }
        if (isMobileMenuOpen) {
          setIsMobileMenuOpen(false);
          return;
        }
        if (currentView !== 'recipes') {
          setCurrentView('recipes');
          return;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showDeleteModal, showAuthModal, showExportModal, isFormOpen, activeRecipeId, isMobileMenuOpen, currentView]);

  // --- History Management for Hardware Back Button ---
  const isPoppingState = useRef(false);
  
  useEffect(() => {
      // Sync state to history whenever significant view state changes
      if (loading) return;
      if (isPoppingState.current) {
          isPoppingState.current = false;
          return;
      }

      const currentState = {
          view: currentView,
          recipeId: activeRecipeId,
          isForm: isFormOpen || !!editingRecipe,
          isCook: isCookMode
      };

      // Only push if different from current history state
      const histState = window.history.state;
      const isDifferent = !histState || 
          histState.view !== currentState.view || 
          histState.recipeId !== currentState.recipeId || 
          histState.isForm !== currentState.isForm || 
          histState.isCook !== currentState.isCook;

      if (isDifferent) {
          window.history.pushState(currentState, '');
      }
  }, [currentView, activeRecipeId, isFormOpen, editingRecipe, isCookMode, loading]);

  useEffect(() => {
      const handlePopState = (event: PopStateEvent) => {
          const state = event.state;
          isPoppingState.current = true;
          
          if (state) {
              setCurrentView(state.view || 'recipes');
              setActiveRecipeId(state.recipeId || null);
              if (!state.isForm) {
                  setIsFormOpen(false);
                  setEditingRecipe(null);
              }
              setIsCookMode(state.isCook || false);
          } else {
              // Level 0: Home
              setCurrentView('recipes');
              setActiveRecipeId(null);
              setIsFormOpen(false);
              setEditingRecipe(null);
              setIsCookMode(false);
          }
      };

      // Initialize history
      window.history.replaceState({ view: 'recipes', recipeId: null, isForm: false, isCook: false }, '');
      
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const loadData = async () => {
    try {
      const [loadedRecipes, queue] = await Promise.all([
          db.getAllRecipes(),
          db.getSyncQueue()
      ]);
      const mergedRecipes = mergeIdenticalRecipes(loadedRecipes);
      setRecipes(mergedRecipes);
      // Track which IDs are pending sync
      const pendingIds = new Set(queue.map(q => q.id));
      setPendingSyncIds(pendingIds);
      
      // Check for missing ingredients
      checkMissingIngredients(mergedRecipes);
      
      return mergedRecipes;
    } catch (err) {
      console.error("Failed to load recipes", err);
      return [];
    }
  };

  const checkMissingIngredients = async (currentRecipes: Recipe[]) => {
      try {
          const plans = await db.getMealPlans();
          const availableSet = new Set(db.getAvailableIngredients());

          const today = new Date();
          const datesToCheck = [
              today.toISOString().split('T')[0],
              new Date(today.getTime() + 86400000).toISOString().split('T')[0],
              new Date(today.getTime() + 86400000 * 2).toISOString().split('T')[0]
          ];
          
          // Get all recipes planned for the next 3 days
          const upcomingPlans = plans.filter(p => datesToCheck.includes(p.date));
          const recipesWithMissing = new Set<string>();
          
          for (const plan of upcomingPlans) {
              const recipe = currentRecipes.find(r => 
                  r.id === plan.recipeId || (r.mergedIds && r.mergedIds.includes(plan.recipeId))
              );
              
              if (!recipe) continue;

              let hasMissing = false;
              let allIngredients: any[] = [...recipe.ingredients];
              if (recipe.components) {
                  recipe.components.forEach(c => allIngredients.push(...c.ingredients));
              }

              // Filter out optional and seasonings
              const relevantIngredients = allIngredients.filter(ing => 
                  !ing.optional && !isSeasoning(ing.item)
              );

              for (const ing of relevantIngredients) {
                  if (!checkIngredientMatch(ing.item, availableSet)) {
                      hasMissing = true;
                      break;
                  }
              }

              if (hasMissing) {
                  recipesWithMissing.add(recipe.id);
              }
          }
          
          const missing = currentRecipes.filter(r => recipesWithMissing.has(r.id));
          setUpcomingMissingRecipes(missing);
      } catch (err) {
          console.error("Error checking missing ingredients", err);
      }
  };

  const handleAddMissingIngredients = async () => {
    if (upcomingMissingRecipes.length === 0) return;

    try {
        const shopping = await db.getShoppingList();
        const availableSet = new Set(db.getAvailableIngredients());
        let addedCount = 0;

        for (const recipe of upcomingMissingRecipes) {
            const existingItems = shopping.filter(i => 
                i.recipeId === recipe.id || 
                (recipe.mergedIds && i.recipeId && recipe.mergedIds.includes(i.recipeId))
            );
            
            // Collect all ingredients from the recipe
            let allIngredients = [...recipe.ingredients];
            if (recipe.components) {
                recipe.components.forEach(c => allIngredients.push(...c.ingredients));
            }

            for (const ing of allIngredients) {
                // If it's a seasoning, optional, or we already have it available, SKIP it
                if (ing.optional || isSeasoning(ing.item) || checkIngredientMatch(ing.item, availableSet)) {
                    continue;
                }

                // Check if this ingredient (by name) is already in the shopping list for this recipe
                const alreadyInList = existingItems.some(i => 
                    i.structured?.item.toLowerCase() === ing.item.toLowerCase()
                );

                if (!alreadyInList) {
                    await db.upsertShoppingItem({
                        id: uuidv4(),
                        text: `${ing.amount} ${ing.unit} ${ing.item}`.trim(),
                        structured: {
                            amount: ing.amount,
                            unit: ing.unit,
                            item: ing.item
                        },
                        isChecked: false,
                        recipeId: recipe.id,
                        recipeName: recipe.name
                    });
                    addedCount++;
                }
            }
        }

        showToast(`Added ${addedCount} missing ingredients to list!`, 'success');
        // loadData will be triggered by the custom event 'shopping-updated' dispatched in db.ts
        // which we added in the previous turn.
    } catch (e) {
        console.error("Failed to add missing ingredients", e);
        showToast("Failed to add ingredients", "error");
    }
  };

  useEffect(() => {
    const init = async () => {
        try {
            const [loadedRecipes, loadedSettings] = await Promise.all([
                db.getAllRecipes(),
                db.getSettings()
            ]);
            const mergedRecipes = await loadData();
            setSettings(loadedSettings);
            applyTheme(loadedSettings.theme);
            
            // Check queue initially
            const queue = await db.getSyncQueue();
            setPendingSyncIds(new Set(queue.map(q => q.id)));
            
            // Preload restaurants if enabled
            if (loadedSettings.enableRestaurants ?? ENABLE_RESTAURANTS) {
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
    window.addEventListener('plans-updated', handleUpdates);
    window.addEventListener('shopping-updated', handleUpdates);
    window.addEventListener('available-updated', handleUpdates);
    
    // Listen for queue updates separately to update status indicator instantly
    const handleQueueUpdate = async () => {
        const queue = await db.getSyncQueue();
        setPendingSyncIds(new Set(queue.map(q => q.id)));
    };
    window.addEventListener('queue-updated', handleQueueUpdate);
    
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

  // Check for shared recipe link and family links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedIdParam = params.get('shared_recipe') || params.get('recipeId');
    const shareTokenParam = params.get('share');
    
    const joinFamilyNameParam = params.get('join_family');
    const tempJoinToken = params.get('temp_join');
    const viewFamilyToken = params.get('view_family');

    const handleLinks = async () => {
        if (joinFamilyNameParam) {
            setAuthModalFamilyName(joinFamilyNameParam);
            setAuthModalView('login');
            setShowAuthModal(true);
            window.history.replaceState({}, '', window.location.pathname);
        } else if (tempJoinToken) {
            setIsLoadingLink(true);
            const res = await db.useFamilyJoinLink(tempJoinToken);
            setIsLoadingLink(false);
            if (res.success) {
                showToast("Joined family successfully!", "success");
                window.location.replace(window.location.pathname); // Reload totally to reflect auth
            } else {
                showToast(res.error || "Failed to join", "error");
                window.history.replaceState({}, '', window.location.pathname);
            }
        } else if (viewFamilyToken) {
            setIsLoadingLink(true);
            const data = await db.fetchPublicFamily(viewFamilyToken);
            setIsLoadingLink(false);
            if (data) {
                setPublicFamilyView(data);
            } else {
                showToast("View link invalid or expired", "error");
            }
            window.history.replaceState({}, '', window.location.pathname);
        }
    };
    handleLinks();

    if (sharedIdParam && shareTokenParam) {
        setSharedRecipeId(sharedIdParam);
        setShareToken(shareTokenParam);
        window.history.replaceState({}, '', window.location.pathname);
    } else if (sharedIdParam) {
        setSharedRecipeId(sharedIdParam);
        window.history.replaceState({}, '', window.location.pathname);
    }
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

  // Apply theme change
  const applyTheme = (theme: 'light' | 'dark' | 'system') => {
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  };

  // React to system theme changes in real-time
  useEffect(() => {
    if (settings.theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyTheme('system');

    // Modern browsers use addEventListener, older ones use addListener
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, [settings.theme]);

  const handleUpdateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    db.saveSettings(newSettings);
    applyTheme(newSettings.theme);
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
        // "All" includes all recipes (both private "mine" and shared "family")
        // No additional filtering needed here as result starts as all recipes
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
        r.name?.toLowerCase().includes(q) || 
        r.description?.toLowerCase().includes(q) ||
        r.addedBy?.toLowerCase().includes(q) ||
        r.source?.author?.toLowerCase().includes(q) ||
        r.source?.name?.toLowerCase().includes(q) ||
        r.category?.toLowerCase().includes(q) ||
        r.tags?.some(t => t.toLowerCase().includes(q)) ||
        r.cookware?.some(c => c.toLowerCase().includes(q)) ||
        r.ingredients?.some(i => i.item?.toLowerCase().includes(q)) ||
        r.components?.some(comp => comp.ingredients?.some(i => i.item?.toLowerCase().includes(q)))
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
  }, [recipes, selectedCategory, searchQuery, showArchived, sortBy, selectedTags, filterFavorites, familyFilter, currentFamilyId, selectedFamilyId]);

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
      // Remove mergedIds before saving as it's a UI-only concept
      const recipeToSave = { ...recipe };
      delete recipeToSave.mergedIds;
      
      await db.upsertRecipe(recipeToSave);
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
    
    // Remove mergedIds before saving
    const recipeToSave = { ...recipe };
    delete recipeToSave.mergedIds;
    
    const updated = { ...recipeToSave, favorite: !recipeToSave.favorite };
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
      
      const idsToDelete = recipeToDelete.mergedIds && recipeToDelete.mergedIds.length > 0 
          ? recipeToDelete.mergedIds 
          : [recipeToDelete.id];

      for (const id of idsToDelete) {
          for (const familyId of selectedFamilyIds) {
              if (familyId === 'private' || familyId === currentFamilyId) {
                  // Local Delete (handles sync if needed)
                  promises.push(db.deleteRecipe(id));
              } else {
                  // Cross Delete
                  promises.push(db.crossDeleteRecipe(id, familyId));
              }
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
      
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-[90] md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed md:relative inset-y-0 left-0 z-[100] transform transition-all duration-300 border-r border-border-thin dark:border-border-dark bg-sidebar-mint dark:bg-sidebar-dark flex flex-col ${isMobileMenuOpen ? 'translate-x-0 w-72 shadow-2xl' : '-translate-x-full md:translate-x-0'} ${isSidebarCollapsed ? 'md:w-20' : 'md:w-72'}`}
      >
        <div className={`px-4 py-6 flex items-center h-24 ${isSidebarCollapsed ? 'justify-center' : 'justify-start gap-2'}`}>
            {!isSidebarCollapsed ? (
                <div className="flex items-center gap-2 overflow-hidden w-full">
                    <div className="h-12 flex-1 w-full shrink-0 bg-forest-green dark:bg-accent-herb" style={{ WebkitMaskImage: 'url(/script.png)', WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat', WebkitMaskPosition: 'left center', maskImage: 'url(/script.png)', maskSize: 'contain', maskRepeat: 'no-repeat', maskPosition: 'left center' }}></div>
                </div>
            ) : (
                <div className="flex items-center justify-center w-full">
                    <span className="material-symbols-outlined text-forest-green dark:text-accent-herb text-2xl">cooking</span>
                </div>
            )}
        </div>

        {/* Desktop Sidebar Toggle */}
        <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden md:flex absolute -right-3 top-20 bg-white dark:bg-card-dark border border-border-thin dark:border-border-dark rounded-full p-1 text-text-secondary hover:text-forest-green dark:hover:text-white shadow-sm z-50 items-center justify-center transition-colors"
        >
            {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <nav className={`flex-1 px-4 space-y-1 overflow-y-auto mt-2 ${isSidebarCollapsed ? 'no-scrollbar' : ''}`}>
            <div className="pb-4 space-y-1">
                <button 
                    onClick={() => { setCurrentView('recipes'); setIsMobileMenuOpen(false); setActiveRecipeId(null); }} 
                    className={`${NAV_BTN_BASE} ${currentView === 'recipes' && !activeRecipeId ? NAV_BTN_ACTIVE : NAV_BTN_INACTIVE} ${isSidebarCollapsed ? 'justify-center p-3' : ''}`}
                    title="Recipes"
                >
                    <BookOpen size={isSidebarCollapsed ? 24 : 20} className={`shrink-0 ${currentView === 'recipes' && !activeRecipeId ? 'dark:text-accent-herb' : ''}`} /> 
                    {!isSidebarCollapsed && "Recipes"}
                </button>
                <button 
                    onClick={() => { setCurrentView('recommendations'); setIsMobileMenuOpen(false); setActiveRecipeId(null); }} 
                    className={`${NAV_BTN_BASE} ${currentView === 'recommendations' ? NAV_BTN_ACTIVE : NAV_BTN_INACTIVE} ${isSidebarCollapsed ? 'justify-center p-3' : ''}`}
                    title="What can I make?"
                >
                    <Refrigerator size={isSidebarCollapsed ? 24 : 20} className={`shrink-0 ${currentView === 'recommendations' ? 'dark:text-accent-herb' : ''}`} /> 
                    {!isSidebarCollapsed && "What can I make?"}
                </button>
                <button 
                    onClick={() => { setCurrentView('planner'); setIsMobileMenuOpen(false); setActiveRecipeId(null); }} 
                    className={`${NAV_BTN_BASE} ${currentView === 'planner' ? NAV_BTN_ACTIVE : NAV_BTN_INACTIVE} ${isSidebarCollapsed ? 'justify-center p-3' : ''}`}
                    title="Planner"
                >
                    <Calendar size={isSidebarCollapsed ? 24 : 20} className={`shrink-0 ${currentView === 'planner' ? 'dark:text-accent-herb' : ''}`} /> 
                    {!isSidebarCollapsed && "Planner"}
                </button>
                <button 
                    onClick={() => { setCurrentView('shopping'); setIsMobileMenuOpen(false); setActiveRecipeId(null); }} 
                    className={`${NAV_BTN_BASE} ${currentView === 'shopping' ? NAV_BTN_ACTIVE : NAV_BTN_INACTIVE} ${isSidebarCollapsed ? 'justify-center p-3' : ''}`}
                    title="Shopping List"
                >
                    <ShoppingCart size={isSidebarCollapsed ? 24 : 20} className={`shrink-0 ${currentView === 'shopping' ? 'dark:text-accent-herb' : ''}`} /> 
                    {!isSidebarCollapsed && "Shopping List"}
                </button>
                
                {/* Eat Out Module */}
                {(settings.enableRestaurants ?? ENABLE_RESTAURANTS) && (
                    <button 
                        onClick={() => { setCurrentView('restaurants'); setIsMobileMenuOpen(false); setActiveRecipeId(null); }} 
                        className={`${NAV_BTN_BASE} ${currentView === 'restaurants' ? NAV_BTN_ACTIVE : NAV_BTN_INACTIVE} ${isSidebarCollapsed ? 'justify-center p-3' : ''}`}
                        title="Eat Out"
                    >
                        <UtensilsCrossed size={isSidebarCollapsed ? 24 : 20} className={`shrink-0 ${currentView === 'restaurants' ? 'dark:text-accent-herb' : ''}`} />
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
                         <button onClick={() => setShowArchived(!showArchived)} className={`${NAV_BTN_BASE} justify-center p-3 ${showArchived ? 'text-forest-green dark:text-accent-herb' : ''}`} title="Archived">
                            <Archive size={isSidebarCollapsed ? 24 : 20} className="shrink-0" />
                         </button>
                         <button onClick={() => setFamilyFilter(familyFilter === 'all' ? 'mine' : 'all')} className={`${NAV_BTN_BASE} justify-center p-3 ${familyFilter !== 'all' ? 'text-forest-green dark:text-accent-herb' : ''}`} title="Family Filter">
                            <Users size={isSidebarCollapsed ? 24 : 20} className="shrink-0" />
                         </button>
                    </>
                 )}
             </div>
        </nav>
        <div className={`p-4 border-t border-border-thin dark:border-border-dark flex items-center ${isSidebarCollapsed ? 'justify-center flex-col gap-4' : 'justify-between'}`}>
            <div className={`flex items-center ${isSidebarCollapsed ? 'flex-col gap-4' : 'gap-1'}`}>
                <button 
                    onClick={() => { setAuthModalView('switch'); setShowAuthModal(true); }} 
                    className="p-2 text-text-secondary hover:text-forest-green dark:hover:text-white hover:bg-white dark:hover:bg-white/5 rounded-full transition-all" 
                    title="Switch Family / Logout"
                >
                    <Users size={isSidebarCollapsed ? 24 : 18} className="shrink-0" />
                </button>
            </div>
            <button onClick={() => setShowSettingsModal(true)} className="p-2 text-text-secondary hover:text-forest-green dark:hover:text-white hover:bg-white dark:hover:bg-white/5 rounded-full transition-all" title="Settings">
                <Settings size={isSidebarCollapsed ? 24 : 18} className="shrink-0"/>
            </button>
        </div>
        <input type="file" ref={fileInputRef} onChange={handleFileImport} className="hidden" accept=".json" />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full relative bg-bg-subtle dark:bg-bg-dark">
        {!isBannerDismissed && upcomingMissingRecipes.length > 0 && (
            <MissingIngredientsBanner 
                missingRecipes={upcomingMissingRecipes}
                onDismiss={() => setIsBannerDismissed(true)}
                onViewList={() => { setCurrentView('shopping'); window.scrollTo(0, 0); }}
                onAddMissing={handleAddMissingIngredients}
            />
        )}
        
        {activeRecipeId && !editingRecipe ? (
            <RecipeDetail 
                recipeId={activeRecipeId}
                mergedTenantIds={recipes.find(r => r.id === activeRecipeId)?.tenantIds}
                onClose={() => setActiveRecipeId(null)} 
                isCookMode={isCookMode}
                setIsCookMode={setIsCookMode}
                onEdit={(r) => { setEditingRecipe(r); }} 
                onRefreshList={loadData}
                showToast={showToast}
                showAlert={showAlert}
                showConfirm={showConfirm}
                enableExperimentalVoice={settings.enableExperimentalVoice}
            />
        ) : (
            <>
                {currentView === 'planner' && <MealPlanner showToast={showToast} showConfirm={showConfirm} showAlert={showAlert} onOpenMenu={() => setIsMobileMenuOpen(true)} allRecipes={recipes} />}
                {currentView === 'shopping' && <ShoppingList showToast={showToast} showConfirm={showConfirm} showAlert={showAlert} onOpenMenu={() => setIsMobileMenuOpen(true)} allTags={availableTags} pinnedTags={pinnedTags} onOpenRecipe={(id) => setActiveRecipeId(id)} />}
                {currentView === 'recommendations' && <Recommendations showToast={showToast} showAlert={showAlert} showConfirm={showConfirm} onOpenMenu={() => setIsMobileMenuOpen(true)} recipes={recipes} onOpenRecipe={(r) => setActiveRecipeId(r.id)} />}
                {currentView === 'restaurants' && (settings.enableRestaurants ?? ENABLE_RESTAURANTS) && <RestaurantList showToast={showToast} showConfirm={showConfirm} showAlert={showAlert} onOpenMenu={() => setIsMobileMenuOpen(true)} />}

                {currentView === 'recipes' && (
                    <div className="flex-1 flex flex-col h-full overflow-hidden">
                        <div className="md:hidden p-4 flex items-center gap-3 bg-bg-white dark:bg-sidebar-dark border-b border-border-thin dark:border-border-dark sticky top-0 z-40">
                            <button onClick={() => setIsMobileMenuOpen(true)} className="p-1 -ml-1 shrink-0 text-text-main dark:text-white">
                                <Menu size={24} />
                            </button>
                            <div className="relative flex-1 group">
                                <Search className="absolute left-0 top-1/2 -translate-y-1/2 text-text-secondary dark:text-text-secondary-dark group-focus-within:text-forest-green dark:group-focus-within:text-accent-herb transition-colors" size={18} />
                                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search for recipes..." className="w-full pl-8 pr-4 py-2 bg-transparent border-b border-border-thin dark:border-border-dark focus:border-forest-green dark:focus:border-accent-herb focus:ring-0 text-base text-text-main dark:text-white placeholder:text-text-secondary outline-none transition-all font-normal" />
                            </div>
                            <div className="flex items-center gap-1">
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
                                        <div className="grid grid-cols-4 gap-1.5 w-full sm:flex sm:w-auto sm:gap-2">
                                            {['All', 'Entrees', 'Sides', 'Desserts'].map(cat => (
                                                <button key={cat} onClick={() => setSelectedCategory(cat as any)} className={`px-1 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-bold transition-all whitespace-nowrap flex items-center justify-center border ${selectedCategory === cat ? 'bg-forest-green dark:bg-accent-herb text-white dark:text-white border-transparent shadow-md transform scale-105' : 'bg-white dark:bg-card-dark text-text-secondary dark:text-text-secondary-dark hover:bg-gray-50 dark:hover:bg-card-hover border border-border-thin dark:border-border-dark hover:border-forest-green dark:hover:border-accent-herb'}`}>
                                                    {cat}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex gap-1 overflow-x-auto pb-2 no-scrollbar items-center w-full">
                                        {availableTags.map(tag => {
                                            const isActive = tag === 'All' ? (selectedTags.size === 0 && !filterFavorites) : (tag === 'Favorites' ? filterFavorites : selectedTags.has(tag));
                                            
                                            let activeClass = "bg-forest-green dark:bg-accent-herb text-white dark:text-white border-forest-green dark:border-accent-herb";
                                            if (tag === 'All') {
                                                activeClass = "bg-forest-green dark:bg-accent-herb text-white dark:text-white border-forest-green dark:border-accent-herb";
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
                                    <div className={`grid ${settings.compactMobileView ? 'grid-cols-2' : 'grid-cols-1'} sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 pb-20`}>
                                        {filteredRecipes.map(recipe => (
                                            <RecipeCard 
                                                key={recipe.id} 
                                                recipe={recipe} 
                                                onClick={(r) => setActiveRecipeId(r.id)} 
                                                onToggleFavorite={handleToggleFavorite} 
                                                compact={settings.compactMobileView}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="absolute bottom-8 right-8 flex flex-col gap-4 z-30">
                            {settings.enableRecipeSwipe && (
                                <button 
                                    onClick={() => setIsRecipeSwipeMode(true)}
                                    className="size-16 bg-white dark:bg-card-dark text-forest-green dark:text-accent-herb rounded-full shadow-xl flex items-center justify-center hover:scale-105 transition-all duration-300 group"
                                    title="Game Mode"
                                >
                                    <Play size={28} fill="currentColor" className="group-hover:scale-110 transition-transform" />
                                </button>
                            )}
                            <button onClick={() => { setEditingRecipe(null); setIsFormOpen(true); }} className="size-16 bg-forest-green dark:bg-accent-herb text-white rounded-full shadow-xl hover:bg-forest-green/90 dark:hover:bg-herb-hover hover:scale-105 transition-all duration-300 group flex items-center justify-center">
                                <Plus size={32} className="group-hover:rotate-90 transition-transform duration-300" />
                            </button>
                        </div>
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

      {isLoadingLink && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-bg-white/80 dark:bg-bg-dark/80 backdrop-blur-sm">
              <div className="bg-white dark:bg-card-dark p-6 rounded-2xl shadow-xl border border-border-thin dark:border-border-dark flex flex-col items-center gap-4">
                  <Loader2 size={32} className="animate-spin text-forest-green dark:text-accent-herb" />
                  <p className="text-text-main dark:text-white font-medium">Validating link...</p>
              </div>
          </div>
      )}

      {publicFamilyView && !sharedRecipeId && (
        <div className="fixed inset-0 z-[150] bg-bg-white dark:bg-bg-dark overflow-y-auto">
            <div className="max-w-7xl mx-auto p-4 sm:p-8">
                <div className="flex justify-between items-center mb-8 bg-white dark:bg-card-dark p-6 rounded-2xl border border-border-thin dark:border-border-dark shadow-sm">
                    <div>
                        <h1 className="text-2xl font-black text-text-main dark:text-white flex items-center gap-3">
                           <Users className="text-forest-green dark:text-accent-herb" /> 
                           {publicFamilyView.familyName}
                        </h1>
                        <p className="text-sm border border-forest-green/30 dark:border-accent-herb/30 text-forest-green dark:text-accent-herb px-2 py-0.5 rounded-full inline-block mt-2 font-bold tracking-wider uppercase text-[10px]">Read-Only View</p>
                    </div>
                    <button onClick={() => { setPublicFamilyView(null); window.history.replaceState({}, '', window.location.pathname); }} className="px-4 py-2 bg-bg-subtle dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 rounded-xl text-text-main dark:text-white font-bold transition-colors">
                        Exit View
                    </button>
                </div>

                {(!publicFamilyView.recipes || publicFamilyView.recipes.length === 0) ? (
                    <div className="text-center py-20 text-text-secondary rounded-2xl bg-white/50 dark:bg-card-dark/30">
                        <UtensilsCrossed size={48} className="mx-auto mb-4 opacity-20" />
                        <p className="text-lg">No shared recipes found for this family.</p>
                    </div>
                ) : (
                    <div className={`grid ${settings?.compactMobileView ? 'grid-cols-2 gap-3 sm:gap-6' : 'grid-cols-1 gap-6'} sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-20`}>
                        {publicFamilyView.recipes.filter(Boolean).map(recipe => (
                            <RecipeCard 
                                key={recipe.id} 
                                recipe={recipe} 
                                compact={settings?.compactMobileView}
                                onClick={(r) => { 
                                    setSharedRecipeId(r.id);
                                }} 
                                onToggleFavorite={() => {}} 
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
      )}

      {showAuthModal && <AuthModal showToast={showToast} showAlert={showAlert} showConfirm={showConfirm} initialFamilyName={authModalFamilyName} initialView={authModalView} onClose={() => { setShowAuthModal(false); setPendingRecipeSave(null); }} onSuccess={handleAuthSuccess} onBackup={() => setShowExportModal(true)} onRestore={handleImportClick} />}
      {showSettingsModal && <SettingsModal onClose={() => setShowSettingsModal(false)} settings={settings} onUpdateSettings={handleUpdateSettings} />}
      {showExportModal && <ExportModal onClose={() => setShowExportModal(false)} onExport={handleExport} totalRecipes={recipes.length} />}
      {isRecipeSwipeMode && (
          <RecipeSwipeMode 
              recipes={filteredRecipes} 
              onBack={() => setIsRecipeSwipeMode(false)}
              onOpenRecipe={(id) => {
                  setActiveRecipeId(id);
                  setIsRecipeSwipeMode(false);
              }}
          />
      )}
      {showDeleteModal && recipeToDelete && (
          <DeleteConfirmationModal 
              isOpen={showDeleteModal} 
              itemName={recipeToDelete.name} 
              onClose={() => { setShowDeleteModal(false); setRecipeToDelete(null); }} 
              onConfirm={confirmDeleteRecipe} 
          />
      )}

      {/* Custom Modal for generalized alerts/confirms */}
      <CustomModal 
        isOpen={modalState.isOpen}
        title={modalState.title}
        message={modalState.message}
        type={modalState.type}
        onConfirm={modalState.onConfirm}
        onCancel={modalState.onCancel}
      />
      
      {isMobileMenuOpen && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] md:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>}

      {/* Toast Notification */}
      {toast.visible && (
          <div className={`fixed bottom-4 right-4 z-[200] px-4 py-3 rounded-lg shadow-xl text-white text-sm font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-300 ${toast.type === 'error' ? 'bg-red-500' : 'bg-forest-green dark:bg-white dark:text-black'}`}>
              {toast.type === 'error' ? <AlertCircle size={16} /> : <Check size={16} />}
              {toast.message}
          </div>
      )}
    </div>
  );
};

export default App;
