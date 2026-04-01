
import React, { useState, useEffect, useRef } from 'react';
import { Recipe, Instruction, Ingredient } from '../types';
import { X, Plus, Save, Trash2, Upload, Clipboard, Image as ImageIcon, Lightbulb, Clock, RefreshCw, Users, Loader, CookingPot, AlertCircle, ArrowRightLeft, Scale, Activity, Link as LinkIcon, User, Lock, ChevronDown, Copy, Check, GripVertical } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import * as db from '../services/db';
import { sanitize, isNotEmpty, isValidUrl } from '../utils/validation';
import Checkbox from './Checkbox';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

interface RecipeFormProps {
  initialData?: Recipe | null;
  onSave: (recipe: Recipe) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

// Local form type allowing string input for amounts (e.g. "1/2")
interface FormIngredient extends Omit<Ingredient, 'amount' | 'secondaryAmount'> {
    amount: string | number;
    secondaryAmount?: string | number;
}

interface IngredientBlock {
    id: string;
    name: string;
    ingredients: FormIngredient[];
}

interface InstructionBlock {
    id: string;
    name: string;
    steps: Instruction[];
}

const RecipeForm: React.FC<RecipeFormProps> = ({ initialData, onSave, onDelete, onClose }) => {
  const INPUT_CLASS = "w-full px-3 py-2 rounded-lg border border-border-thin dark:border-border-dark bg-bg-subtle dark:bg-card-dark/50 text-text-main dark:text-text-main-dark font-sans outline-none focus:ring-2 focus:ring-forest-green dark:focus:ring-accent-herb transition-all placeholder:text-text-secondary/50";
  const LABEL_CLASS = "block text-sm font-bold text-text-secondary mb-1 dark:text-accent-herb/80";

  const [formData, setFormData] = useState<Partial<Recipe>>({
    name: '',
    description: '',
    category: 'Entrees',
    tags: [],
    cookware: [],
    image: '',
    prepTime: 0,
    cookTime: 0,
    servings: 1,
    yieldUnit: '', 
    video: { url: '', note: '' },
    storageNotes: '',
    source: { name: '', url: '', author: '' },
    addedBy: '',
    nutrition: { calories: undefined, protein: undefined, carbs: undefined, fat: undefined },
    favorite: false,
    archived: false,
    shareToFamily: true, 
    reviews: []
  });

  // Sharing State
  const [targetFamilyId, setTargetFamilyId] = useState<string>('private');
  // syncToFamily removed - derived from targetFamilyId !== 'private'
  const [additionalSyncFamilyIds, setAdditionalSyncFamilyIds] = useState<Set<string>>(new Set());
  const [availableSessions, setAvailableSessions] = useState<any[]>([]);
  const currentFamilyId = db.getCurrentFamilyId();
  const pinnedFamilyId = db.getPinnedFamilyId();
  
  // Custom Dropdown State
  const [isFamilySelectorOpen, setIsFamilySelectorOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const [isCourseSelectorOpen, setIsCourseSelectorOpen] = useState(false);
  const courseDropdownRef = useRef<HTMLDivElement>(null);

  // Intermediate state for range inputs (string based)
  const [prepTimeStr, setPrepTimeStr] = useState('');
  const [cookTimeStr, setCookTimeStr] = useState('');

  // Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // JSON Import State
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [jsonText, setJsonText] = useState('');

  // Text Area State for Array fields
  const [rawTags, setRawTags] = useState('');
  const [rawCookware, setRawCookware] = useState('');

  // Structured State (Blocks)
  const [ingredientBlocks, setIngredientBlocks] = useState<IngredientBlock[]>([]);
  const [instructionBlocks, setInstructionBlocks] = useState<InstructionBlock[]>([]);

  // Import Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast State
  const [toast, setToast] = useState<{ message: string, visible: boolean, type?: 'success' | 'error' }>({ message: '', visible: false, type: 'success' });

  // Draft Management
  const saveDraft = () => {
    const draft = {
      formData,
      ingredientBlocks,
      instructionBlocks,
      rawTags,
      rawCookware,
      prepTimeStr,
      cookTimeStr,
      targetFamilyId,
      additionalSyncFamilyIds: Array.from(additionalSyncFamilyIds)
    };
    db.safeSetItem(initialData ? `mykitchen_recipe_draft_${initialData.id}` : 'mykitchen_recipe_draft_new', JSON.stringify(draft));
  };

  const clearDraft = () => {
    db.safeRemoveItem(initialData ? `mykitchen_recipe_draft_${initialData.id}` : 'mykitchen_recipe_draft_new');
  };

  const restoreDraft = () => {
    const draftStr = db.safeGetItem(initialData ? `mykitchen_recipe_draft_${initialData.id}` : 'mykitchen_recipe_draft_new');
    if (draftStr) {
      try {
        const draft = JSON.parse(draftStr);
        setFormData(draft.formData);
        setIngredientBlocks(draft.ingredientBlocks);
        setInstructionBlocks(draft.instructionBlocks);
        setRawTags(draft.rawTags);
        setRawCookware(draft.rawCookware);
        setPrepTimeStr(draft.prepTimeStr);
        setCookTimeStr(draft.cookTimeStr);
        setTargetFamilyId(draft.targetFamilyId);
        setAdditionalSyncFamilyIds(new Set(draft.additionalSyncFamilyIds));
        showToast("Draft restored!", 'success');
      } catch (e) {
        console.error("Failed to restore draft", e);
      }
    }
  };

  const hasDraft = () => {
    return !!db.safeGetItem(initialData ? `mykitchen_recipe_draft_${initialData.id}` : 'mykitchen_recipe_draft_new');
  };

  useEffect(() => {
    // Don't save draft on initial load before state is set
    const timeout = setTimeout(() => {
      saveDraft();
    }, 1000);
    return () => clearTimeout(timeout);
  }, [formData, ingredientBlocks, instructionBlocks, rawTags, rawCookware, prepTimeStr, cookTimeStr, targetFamilyId, additionalSyncFamilyIds]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
      setToast({ message, visible: true, type });
      setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
              setIsFamilySelectorOpen(false);
          }
          if (courseDropdownRef.current && !courseDropdownRef.current.contains(event.target as Node)) {
              setIsCourseSelectorOpen(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatTimeRange = (min?: number, max?: number) => {
      if (!min && min !== 0) return '';
      if (max && max > min) return `${min}-${max}`;
      return min.toString();
  };

  const loadRecipeData = (data: Recipe) => {
      setFormData(data);
      setRawTags((data.tags || []).join(', '));
      setRawCookware((data.cookware || []).join(', '));
      
      setPrepTimeStr(formatTimeRange(data.prepTime, data.prepTimeMax));
      setCookTimeStr(formatTimeRange(data.cookTime, data.cookTimeMax));

      // Handle Sharing Default
      if (data.shareToFamily) {
          if (data.familyId) setTargetFamilyId(data.familyId);
          else if (currentFamilyId) setTargetFamilyId(currentFamilyId);
          else if (pinnedFamilyId) setTargetFamilyId(pinnedFamilyId);

          if (data.tenantIds) {
              setAdditionalSyncFamilyIds(new Set(data.tenantIds.filter(id => id !== data.familyId)));
          }
      } else {
          setTargetFamilyId('private');
          setAdditionalSyncFamilyIds(new Set());
      }

      // --- Load Ingredients into Blocks ---
      const ingBlocks: IngredientBlock[] = [];
      const mainIngs = data.ingredients || [];
      
      // Helper to format amount for display (try to recover fraction)
      const formatAmount = (val: number | undefined): string | number => {
          if (val === undefined || val === null || val === 0) return '';
          
          // Check for common fractions with tolerance
          const tolerance = 0.01;
          const fractions: [number, string][] = [
              [1/2, '1/2'], [1/3, '1/3'], [2/3, '2/3'], 
              [1/4, '1/4'], [3/4, '3/4'],
              [1/5, '1/5'], [2/5, '2/5'], [3/5, '3/5'], [4/5, '4/5'],
              [1/6, '1/6'], [5/6, '5/6'],
              [1/8, '1/8'], [3/8, '3/8'], [5/8, '5/8'], [7/8, '7/8']
          ];
          
          const whole = Math.floor(val);
          const decimal = val - whole;
          
          if (decimal < tolerance) return whole > 0 ? whole : ''; 
          
          for (const [fracVal, fracStr] of fractions) {
              if (Math.abs(decimal - fracVal) < tolerance) {
                  return whole > 0 ? `${whole} ${fracStr}` : fracStr;
              }
          }
          
          // If close to whole number (e.g. 0.999)
          if (Math.abs(decimal - 1) < tolerance) return whole + 1;

          return Number(val.toFixed(2)).toString(); // Return formatted decimal if no match
      };

      if (mainIngs.length > 0) {
          const grouped = new Map<string, Ingredient[]>();
          const defaultSection = 'Main Ingredients';
          mainIngs.forEach(ing => {
              const sec = ing.section || defaultSection;
              if (!grouped.has(sec)) grouped.set(sec, []);
              grouped.get(sec)!.push(ing);
          });
          grouped.forEach((ings, sec) => {
              ingBlocks.push({ 
                  id: uuidv4(), 
                  name: sec === defaultSection ? '' : sec, 
                  ingredients: ings.map(i => ({
                      ...i, 
                      id: i.id || uuidv4(),
                      amount: formatAmount(i.amount),
                      secondaryAmount: i.secondaryAmount ? formatAmount(i.secondaryAmount) : undefined
                  })) 
              });
          });
      }
      if (data.components && data.components.length > 0) {
          data.components.forEach(comp => {
              ingBlocks.push({ 
                  id: uuidv4(), 
                  name: comp.label, 
                  ingredients: comp.ingredients.map(i => ({
                      ...i, 
                      id: i.id || uuidv4(),
                      amount: formatAmount(i.amount),
                      secondaryAmount: i.secondaryAmount ? formatAmount(i.secondaryAmount) : undefined
                  })) 
              });
          });
      }
      if (ingBlocks.length === 0) ingBlocks.push({ id: uuidv4(), name: '', ingredients: [{ id: uuidv4(), amount: '', unit: '', item: '' }] });
      setIngredientBlocks(ingBlocks);

      // --- Load Instructions into Blocks ---
      const instBlocks: InstructionBlock[] = [];
      const mainSteps = data.instructions || [];
      if (mainSteps.length > 0) {
           const grouped = new Map<string, Instruction[]>();
           const defaultSection = 'Main Instructions';
           mainSteps.forEach(inst => {
               const val = inst as unknown as Instruction | string;
               const normalizedInst: Instruction = typeof val === 'string' ? { id: uuidv4(), text: val } : val;
               if (!normalizedInst.id) normalizedInst.id = uuidv4();
               const sec = normalizedInst.section || defaultSection;
               if (!grouped.has(sec)) grouped.set(sec, []);
               grouped.get(sec)!.push(normalizedInst);
           });
           grouped.forEach((steps, sec) => {
               instBlocks.push({ id: uuidv4(), name: sec === defaultSection ? '' : sec, steps });
           });
      }
      if (data.components && data.components.length > 0) {
          data.components.forEach(comp => {
              const steps = comp.instructions.map(i => {
                  const val = i as unknown as Instruction | string;
                  const obj = typeof val === 'string' ? { id: uuidv4(), text: val } : val;
                  if (!obj.id) obj.id = uuidv4();
                  return obj;
              });
              instBlocks.push({ id: uuidv4(), name: comp.label, steps: steps as Instruction[] });
          });
      }
      if (instBlocks.length === 0) instBlocks.push({ id: uuidv4(), name: '', steps: [{ id: uuidv4(), text: '' }] });
      setInstructionBlocks(instBlocks);
  };

  useEffect(() => {
    const sessions = db.getSavedSessions();
    setAvailableSessions(sessions);
    
    if (!initialData) {
        let primary = 'private';
        if (pinnedFamilyId) {
            primary = pinnedFamilyId;
            setTargetFamilyId(pinnedFamilyId);
        } else if (currentFamilyId) {
            primary = currentFamilyId;
            setTargetFamilyId(currentFamilyId);
        } else {
            setTargetFamilyId('private');
        }

        // Default to sync all for new recipes if multiple sessions
        if (sessions.length > 1 && primary !== 'private') {
            setAdditionalSyncFamilyIds(new Set(sessions.filter(s => s.id !== primary).map(s => s.id)));
        }

        setIngredientBlocks([{ id: uuidv4(), name: '', ingredients: [{ id: uuidv4(), amount: '', unit: '', item: '' }] }]);
        setInstructionBlocks([{ id: uuidv4(), name: '', steps: [{ id: uuidv4(), text: '' }] }]);
        
        const lastAuthor = db.safeGetItem('mykitchen_last_author');
        if (lastAuthor) {
            setFormData(prev => ({ ...prev, addedBy: lastAuthor }));
        }

        if (hasDraft()) {
            restoreDraft();
        }
    } else {
        loadRecipeData(initialData);
        if (hasDraft()) {
            restoreDraft();
        }
    }
  }, [initialData, currentFamilyId, pinnedFamilyId]);

  // --- Text Parser Logic ---
  const parseRecipeText = (text: string): Partial<Recipe> | null => {
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return null;

      const recipe: Partial<Recipe> = {
          name: lines[0], // Assume first line is title
          ingredients: [],
          instructions: [],
          components: []
      };

      let mode: 'meta' | 'ingredients' | 'instructions' = 'meta';
      const ingredients: Ingredient[] = [];
      const instructions: Instruction[] = [];

      const unitRegex = /^(cup|cups|tbsp|tsp|tablespoon|teaspoon|g|gram|grams|oz|ounce|ounces|lb|lbs|pound|pounds|ml|l|liter|liters|pint|qt|quart|gal|gallon|can|package|pkg|bunch|clove|cloves|slice|slices)\.?$/i;

      for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          const lowerLine = line.toLowerCase();

          // Detect Section Headers
          if (lowerLine.includes('ingredient')) {
              mode = 'ingredients';
              continue;
          } else if (lowerLine.includes('instruction') || lowerLine.includes('preparation') || lowerLine.includes('method') || lowerLine === 'steps') {
              mode = 'instructions';
              continue;
          }

          if (mode === 'meta') {
              // Try to parse meta data
              const prepMatch = line.match(/prep:?\s*(\d+)/i);
              if (prepMatch) recipe.prepTime = parseInt(prepMatch[1]);
              
              const cookMatch = line.match(/cook:?\s*(\d+)/i);
              if (cookMatch) recipe.cookTime = parseInt(cookMatch[1]);
              
              const servingsMatch = line.match(/servings:?\s*(\d+)/i);
              if (servingsMatch) recipe.servings = parseInt(servingsMatch[1]);
          } else if (mode === 'ingredients') {
              // Heuristic Ingredient Parsing
              // Remove bullets
              const cleanLine = line.replace(/^[\u2022\u00b7\-\*]\s*/, '').trim();
              
              // Try to split by space to find amount/unit
              const parts = cleanLine.split(' ');
              let amountStr = '';
              let unitStr = '';
              let itemStr = '';

              // Check first part for number/fraction
              const firstPart = parts[0];
              const isNumber = /^(\d+([\.,]\d+)?|(\d+\/)?\d+)$/.test(firstPart); // simplified fraction check
              
              if (isNumber) {
                  amountStr = firstPart;
                  // Check second part for unit
                  if (parts.length > 1 && unitRegex.test(parts[1])) {
                      unitStr = parts[1];
                      itemStr = parts.slice(2).join(' ');
                  } else {
                      itemStr = parts.slice(1).join(' ');
                  }
              } else {
                  itemStr = cleanLine;
              }

              // Simple fraction to decimal conversion for storage
              let amountVal = 0;
              if (amountStr) {
                  if (amountStr.includes('/')) {
                      const [n, d] = amountStr.split('/').map(Number);
                      amountVal = n / d;
                  } else {
                      amountVal = parseFloat(amountStr);
                  }
              }

              ingredients.push({
                  id: uuidv4(),
                  amount: amountVal || 0, // Store 0 if parse fail, user can fix
                  unit: unitStr,
                  item: itemStr
              });

          } else if (mode === 'instructions') {
              // Remove numbering (e.g. "1. Mix")
              const cleanLine = line.replace(/^\d+[\.\)]\s*/, '').trim();
              instructions.push({
                  id: uuidv4(),
                  text: cleanLine
              });
          }
      }

      if (ingredients.length > 0) recipe.ingredients = ingredients;
      if (instructions.length > 0) recipe.instructions = instructions;

      return recipe;
  };

  const processImportedData = (data: any) => {
      let recipeData = data;
      if (Array.isArray(data)) recipeData = data[0];
      else if (data.recipes && Array.isArray(data.recipes)) recipeData = data.recipes[0];
      
      // Basic validation
      if (!recipeData.name && !recipeData.ingredients) throw new Error("Invalid format");

      const newData = { ...recipeData };
      if (!initialData) {
          newData.id = uuidv4();
          newData.createdAt = Date.now();
      } else {
          newData.id = initialData.id;
      }
      newData.updatedAt = Date.now();
      
      loadRecipeData(newData);
  };

  // Handle Paste Event for Images & JSON/Text
  useEffect(() => {
      const handlePaste = (e: ClipboardEvent) => {
          if (isUploading) return;
          const items = e.clipboardData?.items;
          if (!items) return;

          // 1. Image Handling
          for (let i = 0; i < items.length; i++) {
              if (items[i].type.indexOf('image') !== -1) {
                  const file = items[i].getAsFile();
                  if (file) {
                      e.preventDefault(); 
                      processImageFile(file);
                      return; 
                  }
              }
          }

          // 2. Text/JSON Handling
          if (initialData) return; // Don't overwrite if editing existing (unless focused on a specific field, which browser handles)

          // Only intercept if we aren't focused on a specific input that accepts text
          const activeTag = document.activeElement?.tagName;
          if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

          const text = e.clipboardData?.getData('text');
          if (text) {
              e.preventDefault();
              try {
                  // Try JSON first
                  const parsed = JSON.parse(text);
                  processImportedData(parsed);
                  showToast("Imported recipe from clipboard JSON", 'success');
              } catch (e) {
                  // Not JSON, try Text Parsing
                  const textRecipe = parseRecipeText(text);
                  if (textRecipe && (textRecipe.ingredients?.length || textRecipe.instructions?.length)) {
                      // Merge with default form data to ensure structure
                      const merged = { ...formData, ...textRecipe };
                      // Ensure IDs
                      loadRecipeData(merged as Recipe);
                      showToast("Imported recipe from clipboard text", 'success');
                  }
              }
          }
      };
      window.addEventListener('paste', handlePaste);
      return () => window.removeEventListener('paste', handlePaste);
  }, [isUploading, initialData, formData]);

  const parseTimeInput = (val: string) => {
      const parts = val.split('-').map(s => parseInt(s.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          return { min: parts[0], max: parts[1] };
      }
      const single = parseInt(val);
      if (!isNaN(single)) return { min: single, max: undefined };
      return { min: 0, max: undefined };
  };

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

  const getRecipeObject = () => {
    const flatIngredients: Ingredient[] = [];
    ingredientBlocks.forEach(block => {
        block.ingredients.forEach(ing => {
            if (ing.item.trim()) {
                flatIngredients.push({ 
                    ...ing, 
                    item: sanitize(ing.item),
                    unit: sanitize(ing.unit),
                    notes: ing.notes ? sanitize(ing.notes) : undefined,
                    substitution: ing.substitution ? sanitize(ing.substitution) : undefined,
                    amount: parseAmount(ing.amount), 
                    secondaryAmount: (ing.secondaryAmount !== undefined && ing.secondaryAmount !== '') ? parseAmount(ing.secondaryAmount) : undefined,
                    secondaryUnit: ing.secondaryUnit ? sanitize(ing.secondaryUnit) : undefined,
                    section: block.name ? sanitize(block.name) : undefined 
                });
            }
        });
    });

    const flatInstructions: Instruction[] = [];
    instructionBlocks.forEach(block => {
        block.steps.forEach(step => {
            if (step.text.trim()) {
                flatInstructions.push({ 
                    ...step, 
                    text: sanitize(step.text),
                    title: step.title ? sanitize(step.title) : undefined,
                    tip: step.tip ? sanitize(step.tip) : undefined,
                    section: block.name ? sanitize(block.name) : undefined 
                });
            }
        });
    });

    const parseNum = (val: any) => (val === '' || val === undefined) ? 0 : Number(val);
    const parseOptionalNum = (val: any) => (val === '' || val === undefined) ? undefined : Number(val);

    const prep = parseTimeInput(prepTimeStr);
    const cook = parseTimeInput(cookTimeStr);

    let recipeId = initialData?.id || uuidv4();

    return {
      ...formData as Recipe,
      name: sanitize(formData.name || ''),
      description: sanitize(formData.description || ''),
      yieldUnit: sanitize(formData.yieldUnit || ''),
      storageNotes: sanitize(formData.storageNotes || ''),
      addedBy: sanitize(formData.addedBy || ''),
      source: {
          name: sanitize(formData.source?.name || ''),
          url: formData.source?.url ? sanitize(formData.source.url) : '',
          author: sanitize(formData.source?.author || '')
      },
      video: {
          url: formData.video?.url ? sanitize(formData.video.url) : '',
          note: formData.video?.note ? sanitize(formData.video.note) : ''
      },
      prepTime: prep.min,
      prepTimeMax: prep.max,
      cookTime: cook.min,
      cookTimeMax: cook.max,
      servings: parseNum(formData.servings) || 1, 
      nutrition: {
          calories: parseOptionalNum(formData.nutrition?.calories),
          protein: parseOptionalNum(formData.nutrition?.protein),
          carbs: parseOptionalNum(formData.nutrition?.carbs),
          fat: parseOptionalNum(formData.nutrition?.fat),
      },
      id: recipeId,
      tags: rawTags.split(',').map(t => sanitize(t.trim())).filter(Boolean),
      cookware: rawCookware.split(',').map(t => sanitize(t.trim())).filter(Boolean),
      ingredients: flatIngredients,
      instructions: flatInstructions,
      components: [], 
      createdAt: initialData?.createdAt || Date.now(),
      updatedAt: Date.now(),
      shareToFamily: targetFamilyId !== 'private'
    };
  };

  const handleCopyJson = () => {
      const recipe = getRecipeObject();
      
      // Create a clean copy for export/sharing
      // 1. Remove internal/system fields and user-specific flags (favorite)
      const { 
          id, 
          favorite, 
          archived, 
          shareToFamily, 
          familyId, 
          tenantId, 
          createdAt, 
          updatedAt, 
          deleted,
          components, // Legacy field, usually empty
          ...cleanRecipe 
      } = recipe;

      // 2. Remove IDs from ingredients and instructions
      const cleanIngredients = recipe.ingredients.map(({ id, ...rest }) => rest);
      const cleanInstructions = recipe.instructions.map(({ id, ...rest }) => rest);

      const exportData = {
          ...cleanRecipe,
          ingredients: cleanIngredients,
          instructions: cleanInstructions
      };

      navigator.clipboard.writeText(JSON.stringify(exportData, null, 2)).then(() => showToast('Recipe JSON copied (clean format)!', 'success'));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const recipe = getRecipeObject();

    // Validation
    if (!isNotEmpty(recipe.name)) {
        showToast("Recipe name is required", 'error');
        return;
    }

    if (recipe.source?.url && !isValidUrl(recipe.source.url)) {
        showToast("Invalid source URL", 'error');
        return;
    }

    setIsSaving(true);

    if (formData.addedBy) {
        db.safeSetItem('mykitchen_last_author', formData.addedBy);
    }

    const oldFamilyId = initialData?.familyId;
    const oldShared = initialData?.shareToFamily;
    
    // Determine if we are moving the recipe
    const isMovingToPrivate = oldShared && targetFamilyId === 'private';
    const isMovingToOtherFamily = oldShared && targetFamilyId !== 'private' && targetFamilyId !== oldFamilyId;

    try {
        // If it was shared and we are moving it away from that family, delete it from the old family
        // UNLESS we are explicitly syncing to it
        if (initialData && oldShared && (isMovingToPrivate || isMovingToOtherFamily)) {
            const keepingOldAsSync = oldFamilyId && additionalSyncFamilyIds.has(oldFamilyId);
            
            if (!keepingOldAsSync) {
                // Delete from old family
                if (oldFamilyId === currentFamilyId || !oldFamilyId) {
                    await db.deleteRecipe(initialData.id, { keepReviews: true });
                } else if (oldFamilyId) {
                    // It was in another family. We should delete it from there.
                    await db.crossDeleteRecipe(initialData.id, oldFamilyId);
                }
            }
        }

        const promises: Promise<any>[] = [];

        // 1. Sync to Additional Families
        if (additionalSyncFamilyIds.size > 0) {
             additionalSyncFamilyIds.forEach(fid => {
                 // Ensure we don't double-post if targetFamilyId is somehow in the set
                 if (fid !== targetFamilyId) {
                     promises.push(db.crossPostRecipe(recipe, fid));
                 }
             });
        }

        // 2. Handle Removals (Stop Syncing)
        if (initialData && initialData.tenantIds) {
            initialData.tenantIds.forEach(oldTid => {
                // If it was in a tenant that is NO LONGER the target AND NOT in additional syncs
                if (oldTid !== targetFamilyId && !additionalSyncFamilyIds.has(oldTid)) {
                    // Check if we have access to delete it
                    const session = availableSessions.find(s => s.id === oldTid);
                    if (session) {
                        promises.push(db.crossDeleteRecipe(recipe.id, oldTid));
                    }
                }
            });
        }

        // 3. Handle Primary Target
        if (targetFamilyId === 'private') {
            recipe.shareToFamily = false;
            recipe.familyId = undefined;
        } else if (targetFamilyId === currentFamilyId) {
            recipe.shareToFamily = true;
            recipe.familyId = currentFamilyId;
        } else {
            // Target is another family. We need to crossPost to it.
            recipe.shareToFamily = true;
            recipe.familyId = targetFamilyId;
            promises.push(db.crossPostRecipe(recipe, targetFamilyId));
        }

        // Wait for cross-posts
        if (promises.length > 0) await Promise.all(promises);

        // Finalize
        const targetName = availableSessions.find(s => s.id === targetFamilyId)?.name || 'other family';
        if (targetFamilyId !== 'private' && targetFamilyId !== currentFamilyId) {
            const extraSyncCount = additionalSyncFamilyIds.size;
            showToast(`Recipe transferred to ${targetName}${extraSyncCount > 0 ? ` and synced to ${extraSyncCount} other families` : ''}.`, 'success');
        }
        clearDraft();
        onSave(recipe); 
    } catch (err: any) {
        console.error(err);
        showToast(`Failed to save: ${err.message}`, 'error');
        setIsSaving(false);
    }
  };

  const handleChange = (field: keyof Recipe, value: any) => setFormData(prev => ({ ...prev, [field]: value }));
  const handleNumberChange = (field: keyof Recipe, valueStr: string) => {
    if (valueStr === '') { handleChange(field, '' as any); return; }
    const num = parseFloat(valueStr);
    if (!isNaN(num)) handleChange(field, num);
  };
  const updateNested = (parent: keyof Recipe, field: string, value: any) => setFormData(prev => ({ ...prev, [parent]: { ...prev[parent] as any, [field]: value } }));
  const getNumValue = (val: any) => (val !== undefined && val !== null) ? val : '';
  
  const processImageFile = (file: File) => {
      if (isUploading) return;
      setIsUploading(true); 

      const reader = new FileReader();
      reader.onload = (event) => {
          const img = new Image();
          img.onload = async () => {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              const MAX_SIZE = 1200; 
              if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
              canvas.width = width; canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (ctx) { 
                  ctx.drawImage(img, 0, 0, width, height); 
                  
                  canvas.toBlob(async (blob) => {
                      if (blob) {
                          try {
                              const url = await db.uploadImage(blob);
                              handleChange('image', url);
                          } catch (e) {
                              console.error(e);
                              showToast("Failed to upload image. Ensure you are logged in.", 'error');
                          } finally {
                              setIsUploading(false);
                          }
                      } else {
                          setIsUploading(false);
                      }
                  }, 'image/jpeg', 0.8);
              } else {
                  setIsUploading(false);
              }
          };
          img.onerror = () => setIsUploading(false);
          img.src = event.target?.result as string;
      };
      reader.onerror = () => setIsUploading(false);
      reader.readAsDataURL(file);
  };
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) processImageFile(file); };

  const processStepImageFile = (file: File, blockId: string, stepId: string) => {
      if (isUploading) return;
      setIsUploading(true); 

      const reader = new FileReader();
      reader.onload = (event) => {
          const img = new Image();
          img.onload = async () => {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              const MAX_SIZE = 1200; 
              if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
              canvas.width = width; canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (ctx) { 
                  ctx.drawImage(img, 0, 0, width, height); 
                  
                  canvas.toBlob(async (blob) => {
                      if (blob) {
                          try {
                              const url = await db.uploadImage(blob);
                              updateStepInBlock(blockId, stepId, 'image', url);
                          } catch (e) {
                              console.error(e);
                              showToast("Failed to upload step image. Ensure you are logged in.", 'error');
                          } finally {
                              setIsUploading(false);
                          }
                      } else {
                          setIsUploading(false);
                      }
                  }, 'image/jpeg', 0.8);
              } else {
                  setIsUploading(false);
              }
          };
          img.onerror = () => setIsUploading(false);
          img.src = event.target?.result as string;
      };
      reader.onerror = () => setIsUploading(false);
      reader.readAsDataURL(file);
  };

  const handleStepImageUpload = (e: React.ChangeEvent<HTMLInputElement>, blockId: string, stepId: string) => {
      const file = e.target.files?.[0];
      if (file) processStepImageFile(file, blockId, stepId);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const content = e.target?.result as string;
            const imported = JSON.parse(content);
            processImportedData(imported);
        } catch (err) {
            console.error(err);
            showToast('Failed to parse recipe JSON.', 'error');
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleTextImport = () => {
      try {
          // Attempt JSON
          const imported = JSON.parse(jsonText);
          processImportedData(imported);
      } catch (e) {
          // Attempt Text
          const textRecipe = parseRecipeText(jsonText);
          if (textRecipe && (textRecipe.ingredients?.length || textRecipe.instructions?.length)) {
              loadRecipeData({ ...formData, ...textRecipe } as Recipe);
          } else {
              showToast("Could not detect valid JSON or recognized recipe text format.", 'error');
              return;
          }
      }
      setShowJsonModal(false);
      setJsonText('');
  };

  // Block Logic Helpers (Simplified for brevity)
  const addIngredientBlock = () => setIngredientBlocks(prev => [...prev, { id: uuidv4(), name: 'New Group', ingredients: [{ id: uuidv4(), amount: '', unit: '', item: '' }] }]);
  const removeIngredientBlock = (blockId: string) => setIngredientBlocks(prev => prev.filter(b => b.id !== blockId));
  const updateIngredientBlockName = (blockId: string, name: string) => setIngredientBlocks(prev => prev.map(b => b.id === blockId ? { ...b, name } : b));
  const addIngredientToBlock = (blockId: string) => setIngredientBlocks(prev => prev.map(b => b.id === blockId ? { ...b, ingredients: [...b.ingredients, { id: uuidv4(), amount: '', unit: '', item: '' }] } : b));
  const updateIngredientInBlock = (blockId: string, ingId: string, field: keyof FormIngredient, value: any) => setIngredientBlocks(prev => prev.map(b => b.id !== blockId ? b : { ...b, ingredients: b.ingredients.map(i => i.id === ingId ? { ...i, [field]: value } : i) }));
  const removeIngredientFromBlock = (blockId: string, ingId: string) => setIngredientBlocks(prev => prev.map(b => b.id !== blockId ? b : { ...b, ingredients: b.ingredients.filter(i => i.id !== ingId) }));
  const toggleIngredientOptional = (blockId: string, ingId: string) => setIngredientBlocks(prev => prev.map(b => b.id !== blockId ? b : { ...b, ingredients: b.ingredients.map(i => i.id === ingId ? { ...i, optional: !i.optional } : i) }));
  const toggleIngredientSub = (blockId: string, ingId: string) => setIngredientBlocks(prev => prev.map(b => b.id !== blockId ? b : { ...b, ingredients: b.ingredients.map(i => i.id === ingId ? { ...i, substitution: i.substitution === undefined ? '' : undefined } : i) }));
  const toggleIngredientSecondary = (blockId: string, ingId: string) => setIngredientBlocks(prev => prev.map(b => b.id !== blockId ? b : { ...b, ingredients: b.ingredients.map(i => i.id === ingId ? { ...i, secondaryAmount: i.secondaryAmount === undefined ? '' : undefined, secondaryUnit: i.secondaryUnit === undefined ? '' : undefined } : i) }));
  const addInstructionBlock = () => setInstructionBlocks(prev => [...prev, { id: uuidv4(), name: 'New Section', steps: [{ id: uuidv4(), text: '' }] }]);
  const removeInstructionBlock = (blockId: string) => setInstructionBlocks(prev => prev.filter(b => b.id !== blockId));
  const updateInstructionBlockName = (blockId: string, name: string) => setInstructionBlocks(prev => prev.map(b => b.id === blockId ? { ...b, name } : b));
  const addStepToBlock = (blockId: string) => setInstructionBlocks(prev => prev.map(b => b.id === blockId ? { ...b, steps: [...b.steps, { id: uuidv4(), text: '' }] } : b));
  const updateStepInBlock = (blockId: string, stepId: string, field: keyof Instruction, value: any) => setInstructionBlocks(prev => prev.map(b => b.id !== blockId ? b : { ...b, steps: b.steps.map(s => s.id === stepId ? { ...s, [field]: value } : s) }));
  const removeStepFromBlock = (blockId: string, stepId: string) => setInstructionBlocks(prev => prev.map(b => b.id !== blockId ? b : { ...b, steps: b.steps.filter(s => s.id !== stepId) }));
  const toggleStepTimer = (blockId: string, stepId: string) => setInstructionBlocks(prev => prev.map(b => b.id !== blockId ? b : { ...b, steps: b.steps.map(s => s.id !== stepId ? s : { ...s, timer: s.timer !== undefined ? undefined : 5 }) }));
  const toggleStepTip = (blockId: string, stepId: string) => setInstructionBlocks(prev => prev.map(b => b.id !== blockId ? b : { ...b, steps: b.steps.map(s => s.id !== stepId ? s : { ...s, tip: s.tip !== undefined ? undefined : '' }) }));
  const toggleStepOptional = (blockId: string, stepId: string) => setInstructionBlocks(prev => prev.map(b => b.id !== blockId ? b : { ...b, steps: b.steps.map(s => s.id !== stepId ? s : { ...s, optional: !s.optional }) }));
  const toggleStepImage = (blockId: string, stepId: string) => setInstructionBlocks(prev => prev.map(b => b.id !== blockId ? b : { ...b, steps: b.steps.map(s => s.id !== stepId ? s : { ...s, image: s.image !== undefined ? undefined : '' }) }));

  const onDragEnd = (result: DropResult) => {
    const { source, destination, type } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    if (type === 'INGREDIENT') {
        setIngredientBlocks(prev => {
            const newBlocks = [...prev];
            const sourceBlockIndex = newBlocks.findIndex(b => b.id === source.droppableId);
            const destBlockIndex = newBlocks.findIndex(b => b.id === destination.droppableId);
            
            if (sourceBlockIndex === -1 || destBlockIndex === -1) return prev;

            const sourceBlock = { ...newBlocks[sourceBlockIndex], ingredients: [...newBlocks[sourceBlockIndex].ingredients] };
            const [removed] = sourceBlock.ingredients.splice(source.index, 1);

            if (source.droppableId === destination.droppableId) {
                sourceBlock.ingredients.splice(destination.index, 0, removed);
                newBlocks[sourceBlockIndex] = sourceBlock;
            } else {
                const destBlock = { ...newBlocks[destBlockIndex], ingredients: [...newBlocks[destBlockIndex].ingredients] };
                destBlock.ingredients.splice(destination.index, 0, removed);
                newBlocks[sourceBlockIndex] = sourceBlock;
                newBlocks[destBlockIndex] = destBlock;
            }
            return newBlocks;
        });
    } else if (type === 'INSTRUCTION') {
        setInstructionBlocks(prev => {
            const newBlocks = [...prev];
            const sourceBlockIndex = newBlocks.findIndex(b => b.id === source.droppableId);
            const destBlockIndex = newBlocks.findIndex(b => b.id === destination.droppableId);
            
            if (sourceBlockIndex === -1 || destBlockIndex === -1) return prev;

            const sourceBlock = { ...newBlocks[sourceBlockIndex], steps: [...newBlocks[sourceBlockIndex].steps] };
            const [removed] = sourceBlock.steps.splice(source.index, 1);

            if (source.droppableId === destination.droppableId) {
                sourceBlock.steps.splice(destination.index, 0, removed);
                newBlocks[sourceBlockIndex] = sourceBlock;
            } else {
                const destBlock = { ...newBlocks[destBlockIndex], steps: [...newBlocks[destBlockIndex].steps] };
                destBlock.steps.splice(destination.index, 0, removed);
                newBlocks[sourceBlockIndex] = sourceBlock;
                newBlocks[destBlockIndex] = destBlock;
            }
            return newBlocks;
        });
    }
  };

  // Selector Display Logic
  const getTargetFamilyName = () => {
      if (targetFamilyId === 'private') return 'Private (This Device)';
      const session = availableSessions.find(s => s.id === targetFamilyId);
      if (session) return session.name + (session.id === currentFamilyId ? ' (Current)' : '');
      return 'Select Family';
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-background-dark/80 backdrop-blur-sm" onClick={onClose}></div>
      <form onSubmit={handleSubmit} className="relative w-full max-w-4xl bg-white dark:bg-card-dark rounded-2xl shadow-xl flex flex-col max-h-[90vh] border border-border-thin dark:border-border-dark">
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-border-thin dark:border-border-dark">
          <h2 className="text-xl font-bold text-text-main dark:text-text-main-dark">{initialData ? 'Edit Recipe' : 'Add New Recipe'}</h2>
          <div className="flex items-center gap-1">
              {/* Mobile-only icons in header */}
              <div className="flex items-center gap-1 sm:hidden">
                  {!initialData && (
                      <>
                        <button type="button" onClick={handleImportClick} className="p-2 text-text-secondary hover:text-forest-green dark:hover:text-accent-herb transition-colors" title="Upload JSON File"><Upload size={20} /></button>
                        <button type="button" onClick={() => setShowJsonModal(true)} className="p-2 text-text-secondary hover:text-forest-green dark:hover:text-accent-herb transition-colors" title="Paste JSON Text"><Clipboard size={20} /></button>
                      </>
                  )}
                  {initialData?.id && onDelete && (
                      <button type="button" onClick={() => onDelete(initialData.id)} className="p-2 text-red-500 hover:text-red-600 transition-colors" title="Delete Recipe"><Trash2 size={20} /></button>
                  )}
                  {initialData && (
                      <button type="button" onClick={handleCopyJson} className="p-2 text-text-secondary hover:text-forest-green dark:hover:text-accent-herb transition-colors" title="Copy Recipe JSON"><Copy size={20} /></button>
                  )}
              </div>
              <button type="button" onClick={onClose} className="p-2 hover:bg-bg-subtle dark:hover:bg-white/10 rounded-full transition-colors"><X size={20} className="text-text-secondary" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8 custom-scrollbar">
          <DragDropContext onDragEnd={onDragEnd}>
          {/* Basics */}
          <section className="space-y-4">
             <div className="flex items-center justify-between border-b border-border-thin dark:border-border-dark pb-2">
                 <h3 className="text-lg font-bold text-forest-green dark:text-accent-herb">Basics</h3>
                 
                 {/* Custom Family Selector */}
                 <div className="relative" ref={dropdownRef}>
                     <button 
                        type="button"
                        onClick={() => setIsFamilySelectorOpen(!isFamilySelectorOpen)}
                        className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg bg-bg-subtle dark:bg-card-dark border border-border-thin dark:border-border-dark hover:border-forest-green/50 dark:hover:border-accent-herb/50 text-xs font-bold text-text-main dark:text-text-main-dark transition-all shadow-sm"
                     >
                         {targetFamilyId === 'private' ? <Lock size={14} className="text-forest-green dark:text-accent-herb" /> : <Users size={14} className="text-forest-green dark:text-accent-herb" />}
                         <span>{getTargetFamilyName()}</span>
                         <ChevronDown size={14} className={`text-text-secondary transition-transform ${isFamilySelectorOpen ? 'rotate-180' : ''}`} />
                     </button>

                     {isFamilySelectorOpen && (
                         <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-card-dark rounded-xl shadow-xl border border-border-thin dark:border-border-dark overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-200">
                             <div className="py-1">
                                 <button
                                    type="button"
                                    onClick={() => { setTargetFamilyId('private'); setIsFamilySelectorOpen(false); }}
                                    className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${targetFamilyId === 'private' ? 'bg-forest-green/5 dark:bg-accent-herb/10 text-forest-green dark:text-accent-herb' : 'text-text-main dark:text-text-main-dark'}`}
                                 >
                                     <Lock size={16} />
                                     <span className="text-sm font-bold">Private (This Device)</span>
                                     {targetFamilyId === 'private' && <Check size={14} className="ml-auto" />}
                                 </button>
                                 <div className="h-px bg-border-thin dark:border-border-dark mx-3 my-1"></div>
                                 {availableSessions.map(s => {
                                     const isPrimary = targetFamilyId === s.id;
                                     const isSynced = additionalSyncFamilyIds.has(s.id);
                                     
                                     return (
                                         <div key={s.id} className={`w-full flex items-center hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${isPrimary ? 'bg-forest-green/5 dark:bg-accent-herb/10' : ''}`}>
                                             <button
                                                type="button"
                                                onClick={() => { 
                                                    setTargetFamilyId(s.id); 
                                                    setAdditionalSyncFamilyIds(prev => {
                                                        const next = new Set(prev);
                                                        next.delete(s.id);
                                                        // If we switch primary, we might want to add the old primary to sync list?
                                                        // For now, let's keep it simple: switching primary keeps other syncs but removes new primary from sync list.
                                                        if (targetFamilyId !== 'private' && targetFamilyId !== s.id) {
                                                            next.add(targetFamilyId);
                                                        }
                                                        return next;
                                                    });
                                                    setIsFamilySelectorOpen(false); 
                                                }}
                                                className={`flex-1 text-left px-4 py-3 flex items-center gap-3 ${isPrimary ? 'text-forest-green dark:text-accent-herb' : 'text-text-main dark:text-text-main-dark'}`}
                                             >
                                                 <Users size={16} />
                                                 <div className="flex flex-col">
                                                     <span className="text-sm font-bold">{s.name}</span>
                                                     {s.id === currentFamilyId && <span className="text-[10px] text-text-secondary uppercase font-bold">Current</span>}
                                                 </div>
                                                 {isPrimary && <span className="ml-auto text-xs font-bold text-forest-green dark:text-accent-herb">Primary</span>}
                                             </button>
                                             
                                             {targetFamilyId !== 'private' && !isPrimary && (
                                                 <div className="pr-4 pl-2 h-full flex items-center">
                                                     <Checkbox 
                                                        checked={isSynced} 
                                                        onChange={() => {
                                                            setAdditionalSyncFamilyIds(prev => {
                                                                const next = new Set(prev);
                                                                if (isSynced) next.delete(s.id);
                                                                else next.add(s.id);
                                                                return next;
                                                            });
                                                        }}
                                                        size="sm"
                                                        className="cursor-pointer"
                                                     />
                                                 </div>
                                             )}
                                         </div>
                                     );
                                 })}
                             </div>
                         </div>
                     )}
                 </div>
             </div>
             
             {/* ... Inputs same as before ... */}
             <div className="grid md:grid-cols-2 gap-4">
                 <div className="space-y-4">
                  <div><label className={LABEL_CLASS}>Name *</label><input required type="text" value={formData.name || ''} onChange={e => handleChange('name', e.target.value)} className={INPUT_CLASS} placeholder="Recipe Title" /></div>
                  <div>
                      <label className={LABEL_CLASS}>Course</label>
                      <div className="relative" ref={courseDropdownRef}>
                          <button 
                              type="button"
                              onClick={() => setIsCourseSelectorOpen(!isCourseSelectorOpen)}
                              className={`${INPUT_CLASS} flex items-center justify-between text-left`}
                          >
                              <span>{formData.category || 'Entrees'}</span>
                              <ChevronDown size={16} className={`text-text-secondary transition-transform ${isCourseSelectorOpen ? 'rotate-180' : ''}`} />
                          </button>
                          
                          {isCourseSelectorOpen && (
                              <div className="absolute left-0 top-full mt-1 w-full bg-white dark:bg-card-dark rounded-xl shadow-xl border border-border-thin dark:border-border-dark overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-200">
                                  <div className="py-1">
                                      {['Entrees', 'Sides', 'Desserts'].map(course => (
                                          <button
                                              key={course}
                                              type="button"
                                              onClick={() => { handleChange('category', course); setIsCourseSelectorOpen(false); }}
                                              className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${formData.category === course || (!formData.category && course === 'Entrees') ? 'bg-forest-green/5 dark:bg-accent-herb/10 text-forest-green dark:text-accent-herb font-bold' : 'text-text-main dark:text-text-main-dark'}`}
                                          >
                                              {course}
                                          </button>
                                      ))}
                                  </div>
                              </div>
                          )}
                      </div>
                  </div>
                </div>
                <div><label className={LABEL_CLASS}>Description</label><textarea value={formData.description || ''} onChange={e => handleChange('description', e.target.value)} rows={4} className={`${INPUT_CLASS} resize-none`} placeholder="Short description..." /></div>
             </div>
             {/* ... Time Inputs ... */}
             <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
               <div className="col-span-1">
                   <label className={LABEL_CLASS}>Prep Time</label>
                   <input type="text" value={prepTimeStr} onChange={e => setPrepTimeStr(e.target.value)} className={INPUT_CLASS} placeholder="e.g. 15" />
               </div>
               <div className="col-span-1">
                   <label className={LABEL_CLASS}>Cook Time</label>
                   <input type="text" value={cookTimeStr} onChange={e => setCookTimeStr(e.target.value)} className={INPUT_CLASS} placeholder="e.g. 30" />
               </div>
               <div className="col-span-2 md:col-span-1">
                   <label className={LABEL_CLASS}>Yield</label>
                   <div className="flex gap-2">
                       <input type="number" value={getNumValue(formData.servings)} onChange={e => handleNumberChange('servings', e.target.value)} className={`${INPUT_CLASS} w-20 text-center`} placeholder="1"/>
                       <input type="text" value={formData.yieldUnit || ''} onChange={e => handleChange('yieldUnit', e.target.value)} className={`${INPUT_CLASS} flex-1 min-w-[100px]`} placeholder="servings" />
                   </div>
               </div>
             </div>
             <div className="grid md:grid-cols-2 gap-4">
                <div>
                    <label className={LABEL_CLASS}>Tags</label>
                    <input type="text" value={rawTags} onChange={e => setRawTags(e.target.value)} className={INPUT_CLASS} placeholder="Healthy, Quick..." />
                </div>
                <div>
                    <label className={`${LABEL_CLASS} !flex items-center gap-2`}><CookingPot size={16} /> Required Cookware</label>
                    <input type="text" value={rawCookware} onChange={e => setRawCookware(e.target.value)} className={INPUT_CLASS} placeholder="Dutch Oven, Blender..." />
                </div>
             </div>
             <div className="pt-2">
                 <label className={LABEL_CLASS}>Image</label>
                 <div className="flex gap-2">
                     <input type="text" value={formData.image || ''} onChange={e => handleChange('image', e.target.value)} className={INPUT_CLASS} placeholder="https://..." disabled={isUploading} />
                     <label className={`p-2 border border-border-thin dark:border-border-dark rounded cursor-pointer transition-colors ${isUploading ? 'bg-bg-subtle dark:bg-white/10 cursor-not-allowed' : 'hover:bg-bg-subtle dark:hover:bg-white/5 bg-white dark:bg-card-dark'}`}>
                         <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={isUploading} />
                         {isUploading ? <Loader className="animate-spin text-forest-green dark:text-accent-herb" size={20} /> : <Upload size={20} className="text-forest-green dark:text-accent-herb" />}
                     </label>
                 </div>
             </div>
          </section>

             <section className="space-y-4">
             <h3 className="text-lg font-bold text-forest-green dark:text-accent-herb border-b border-border-thin dark:border-border-dark pb-2">Ingredients</h3>
             {ingredientBlocks.map((block, bIdx) => (
                 <div key={block.id} className="relative mb-6 last:mb-0">
                     <div className="flex items-center gap-2 mb-3">
                         <input type="text" value={block.name} onChange={e => updateIngredientBlockName(block.id, e.target.value)} placeholder={bIdx === 0 ? "Main Ingredients" : "Section Name"} className="bg-transparent font-bold text-forest-green dark:text-accent-herb placeholder:text-forest-green/40 dark:placeholder:text-accent-herb/40 focus:outline-none w-full"/>
                         {ingredientBlocks.length > 1 && <button type="button" onClick={() => removeIngredientBlock(block.id)} className="text-red-400 p-1"><Trash2 size={16}/></button>}
                     </div>
                     <Droppable droppableId={block.id} type="INGREDIENT">
                        {(provided) => (
                          <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                         {block.ingredients.map((ing, index) => (
                                  <Draggable key={ing.id} draggableId={ing.id} index={index}>
                                    {(provided, snapshot) => (
                                      <div 
                                        ref={provided.innerRef} 
                                        {...provided.draggableProps} 
                                        className={`flex flex-col py-2 transition-colors border-b border-border-thin/50 dark:border-border-dark/50 last:border-0 ${snapshot.isDragging ? 'bg-bg-subtle dark:bg-card-dark shadow-lg rounded-lg border-none z-50' : ''}`}
                                      >
                                          <div className="flex flex-col sm:flex-row gap-2">
                                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                                  <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing text-text-secondary/40 hover:text-text-secondary transition-colors shrink-0">
                                                      <GripVertical size={18} />
                                                  </div>
                                         <input type="text" placeholder="Item Name" value={ing.item || ''} onChange={e => updateIngredientInBlock(block.id, ing.id, 'item', e.target.value)} className={`w-full p-2 rounded-md border border-border-thin dark:border-border-dark bg-bg-subtle dark:bg-card-dark/50 focus:ring-2 focus:ring-forest-green dark:focus:ring-accent-herb focus:outline-none text-sm font-medium ${ing.optional ? 'text-text-secondary italic' : 'text-text-main dark:text-white'}`} />
                                     </div>
                                     <div className="flex items-center justify-between sm:justify-start gap-2 pl-7 sm:pl-0">
                                         <div className="flex gap-2 items-center">
                                             <input type="text" placeholder="Amt" value={ing.amount} onChange={e => {
                                                 const value = e.target.value;
                                                 if (value === '' || /^[0-9./\s]*$/.test(value)) {
                                                     updateIngredientInBlock(block.id, ing.id, 'amount', value);
                                                 }
                                             }} className="w-16 p-2 rounded-md border border-border-thin dark:border-border-dark bg-bg-subtle dark:bg-card-dark/50 focus:ring-2 focus:ring-forest-green dark:focus:ring-accent-herb focus:outline-none text-sm text-center text-text-main dark:text-white" />
                                             <input type="text" placeholder="Unit" value={ing.unit || ''} onChange={e => updateIngredientInBlock(block.id, ing.id, 'unit', e.target.value)} className="w-20 p-2 rounded-md border border-border-thin dark:border-border-dark bg-bg-subtle dark:bg-card-dark/50 focus:ring-2 focus:ring-forest-green dark:focus:ring-accent-herb focus:outline-none text-sm text-text-main dark:text-white" />
                                         </div>
                                         <div className="flex gap-1 items-center justify-end sm:justify-start pl-2 border-l border-border-thin dark:border-border-dark ml-2">
                                               <button type="button" onClick={() => toggleIngredientOptional(block.id, ing.id)} className={`p-1.5 rounded transition-colors ${ing.optional ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-400 hover:text-blue-400'}`} title="Toggle Optional"><AlertCircle size={16} /></button>
                                               <button type="button" onClick={() => toggleIngredientSecondary(block.id, ing.id)} className={`p-1.5 rounded transition-colors ${ing.secondaryAmount !== undefined ? 'text-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'text-gray-400 hover:text-purple-400'}`} title="Add Secondary Measurement"><Scale size={16} /></button>
                                               <button type="button" onClick={() => toggleIngredientSub(block.id, ing.id)} className={`p-1.5 rounded transition-colors ${ing.substitution !== undefined ? 'text-orange-500 bg-orange-50 dark:bg-orange-900/20' : 'text-gray-400 hover:text-orange-400'}`} title="Add Substitution"><ArrowRightLeft size={16} /></button>
                                               <button type="button" onClick={() => removeIngredientFromBlock(block.id, ing.id)} className="text-red-400 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/10 rounded" title="Delete Ingredient"><Trash2 size={16} /></button>
                                         </div>
                                     </div>
                                 </div>
                                 
                                 {/* Secondary & Substitution Rows */}
                                 {(ing.secondaryAmount !== undefined || ing.substitution !== undefined) && (
                                    <div className="w-full flex flex-col gap-2 mt-2 pt-2 border-t border-dashed border-border-thin dark:border-border-dark pl-7">
                                        {ing.secondaryAmount !== undefined && (
                                            <div className="flex gap-2 items-center">
                                                <div className="w-5 flex justify-center shrink-0"><Scale size={14} className="text-purple-400" /></div>
                                                <input type="text" placeholder="Sec. Amt" value={ing.secondaryAmount || ''} onChange={e => {
                                                     const value = e.target.value;
                                                     if (value === '' || /^[0-9./\s]*$/.test(value)) {
                                                         updateIngredientInBlock(block.id, ing.id, 'secondaryAmount', value);
                                                     }
                                                 }} className="w-20 p-1.5 rounded border border-border-thin dark:border-border-dark bg-bg-subtle dark:bg-card-dark/50 text-xs text-center" />
                                                <input type="text" placeholder="Sec. Unit (e.g. g)" value={ing.secondaryUnit || ''} onChange={e => updateIngredientInBlock(block.id, ing.id, 'secondaryUnit', e.target.value)} className="flex-1 p-1.5 rounded border border-border-thin dark:border-border-dark bg-bg-subtle dark:bg-card-dark/50 text-xs" />
                                            </div>
                                        )}
                                        {ing.substitution !== undefined && (
                                            <div className="flex gap-2 items-center">
                                                <div className="w-5 flex justify-center shrink-0"><ArrowRightLeft size={14} className="text-orange-400" /></div>
                                                <input type="text" placeholder="Substitution notes..." value={ing.substitution || ''} onChange={e => updateIngredientInBlock(block.id, ing.id, 'substitution', e.target.value)} className="flex-1 p-1.5 rounded border border-border-thin dark:border-border-dark bg-bg-subtle dark:bg-card-dark/50 text-xs" />
                                            </div>
                                        )}
                                    </div>
                                 )}
                             </div>
                                   )}
                                 </Draggable>
                             ))}
                             {provided.placeholder}
                         <button type="button" onClick={() => addIngredientToBlock(block.id)} className="text-sm font-bold text-forest-green dark:text-accent-herb flex items-center gap-1 mt-2 hover:underline"><Plus size={16} /> Add Ingredient</button>
                     </div>
                   )}
                 </Droppable>
                 </div>
             ))}
             <button type="button" onClick={addIngredientBlock} className="w-full py-2 border-2 border-dashed border-forest-green/30 dark:border-accent-herb/30 text-forest-green dark:text-accent-herb font-bold rounded-lg hover:bg-forest-green/5 dark:hover:bg-accent-herb/5">+ Add Ingredient Group</button>
          </section>

          <section className="space-y-4">
             <h3 className="text-lg font-bold text-forest-green dark:text-accent-herb border-b border-border-thin dark:border-border-dark pb-2">Instructions</h3>
             {instructionBlocks.map((block, bIdx) => (
                 <div key={block.id} className="relative mb-6 last:mb-0">
                     <div className="flex items-center gap-2 mb-3">
                         <input type="text" value={block.name} onChange={e => updateInstructionBlockName(block.id, e.target.value)} placeholder={bIdx === 0 ? "Main Instructions" : "Section Name"} className="bg-transparent font-bold text-forest-green dark:text-accent-herb placeholder:text-forest-green/40 dark:placeholder:text-accent-herb/40 focus:outline-none w-full"/>
                         {instructionBlocks.length > 1 && <button type="button" onClick={() => removeInstructionBlock(block.id)} className="text-red-400 p-1"><Trash2 size={16}/></button>}
                     </div>
                     <Droppable droppableId={block.id} type="INSTRUCTION">
                       {(provided) => (
                         <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                             {block.steps.map((step, idx) => (
                                 <Draggable key={step.id} draggableId={step.id} index={idx}>
                                   {(provided, snapshot) => (
                                     <div 
                                       ref={provided.innerRef} 
                                       {...provided.draggableProps} 
                                       className={`flex gap-3 py-2 ${snapshot.isDragging ? 'bg-bg-subtle dark:bg-card-dark shadow-lg rounded-lg border-none z-50' : ''}`}
                                     >
                                         <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing text-text-secondary/40 hover:text-text-secondary transition-colors shrink-0 mt-2">
                                             <GripVertical size={18} />
                                         </div>
                                         <div className={`size-6 rounded-full flex items-center justify-center text-xs font-bold mt-1 shrink-0 ${step.optional ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800' : 'bg-forest-green/10 dark:bg-accent-herb/10 text-forest-green dark:text-accent-herb'}`}>{idx + 1}</div>
                                         <div className="flex-1 space-y-2 min-w-0">
                                     <div className="flex gap-2 items-center">
                                        <input type="text" value={step.title || ''} onChange={e => updateStepInBlock(block.id, step.id, 'title', e.target.value)} placeholder="Title (Opt)" className="w-full p-1.5 rounded-md border border-border-thin dark:border-border-dark bg-bg-subtle dark:bg-card-dark/50 focus:ring-2 focus:ring-forest-green dark:focus:ring-accent-herb focus:outline-none text-sm font-bold text-text-main dark:text-white" />
                                        <div className="flex gap-1 shrink-0">
                                            <button type="button" onClick={() => toggleStepTimer(block.id, step.id)} className={`p-1.5 rounded transition-colors ${step.timer !== undefined ? 'text-forest-green dark:text-accent-herb bg-forest-green/10 dark:bg-accent-herb/20' : 'text-gray-300 hover:text-forest-green dark:hover:text-accent-herb'}`} title="Add Timer"><Clock size={16}/></button>
                                            <button type="button" onClick={() => toggleStepTip(block.id, step.id)} className={`p-1.5 rounded transition-colors ${step.tip !== undefined ? 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' : 'text-gray-300 hover:text-yellow-400'}`} title="Add Tip"><Lightbulb size={16}/></button>
                                            <button type="button" onClick={() => toggleStepImage(block.id, step.id)} className={`p-1.5 rounded transition-colors ${step.image !== undefined ? 'text-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'text-gray-300 hover:text-purple-400'}`} title="Add Image"><ImageIcon size={16}/></button>
                                            <button type="button" onClick={() => toggleStepOptional(block.id, step.id)} className={`p-1.5 rounded transition-colors ${step.optional ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-300 hover:text-blue-400'}`} title="Toggle Optional"><AlertCircle size={16}/></button>
                                            <button type="button" onClick={() => removeStepFromBlock(block.id, step.id)} className="text-red-400 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/10 rounded transition-colors"><Trash2 size={16}/></button>
                                        </div>
                                     </div>
                                     <textarea value={step.text || ''} onChange={e => updateStepInBlock(block.id, step.id, 'text', e.target.value)} placeholder="Step description..." rows={2} className="w-full p-2 rounded-md border border-border-thin dark:border-border-dark bg-bg-subtle dark:bg-card-dark/50 focus:ring-2 focus:ring-forest-green dark:focus:ring-accent-herb focus:outline-none text-sm text-text-main dark:text-white resize-none" />
                                     <div className="flex flex-wrap gap-2">
                                         {step.timer !== undefined && (
                                             <div className="flex items-center gap-1 bg-forest-green/5 dark:bg-accent-herb/5 border border-forest-green/20 dark:border-accent-herb/20 rounded-md px-2 py-1">
                                                 <Clock size={12} className="text-forest-green dark:text-accent-herb"/>
                                                 <input type="number" value={step.timer} onChange={e => updateStepInBlock(block.id, step.id, 'timer', parseInt(e.target.value))} className="bg-transparent border-none p-0 text-xs w-12 text-center font-bold focus:ring-0 text-text-main dark:text-white" placeholder="Min" />
                                                 <span className="text-xs text-forest-green dark:text-accent-herb font-medium">min</span>
                                             </div>
                                         )}
                                         {step.tip !== undefined && (
                                             <div className="flex items-center gap-1 flex-1 min-w-[200px]">
                                                 <input type="text" value={step.tip} onChange={e => updateStepInBlock(block.id, step.id, 'tip', e.target.value)} placeholder="Add a helpful tip..." className="w-full p-1.5 rounded border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-900/30 focus:border-yellow-400 text-xs text-text-main dark:text-white" />
                                             </div>
                                         )}
                                        {step.image !== undefined && (
                                            <div className="flex flex-col gap-2 w-full">
                                                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                                                    <input type="text" value={step.image} onChange={e => updateStepInBlock(block.id, step.id, 'image', e.target.value)} placeholder="Image URL..." className="w-full p-1.5 rounded border border-purple-200 bg-purple-50 dark:bg-purple-900/10 dark:border-purple-900/30 focus:border-purple-400 text-xs text-text-main dark:text-white" disabled={isUploading} />
                                                    <label className={`p-1.5 border border-purple-200 dark:border-purple-900/30 rounded cursor-pointer transition-colors ${isUploading ? 'bg-purple-100 dark:bg-purple-900/20 cursor-not-allowed' : 'hover:bg-purple-100 dark:hover:bg-purple-900/20 bg-purple-50 dark:bg-purple-900/10'}`}>
                                                        <input type="file" accept="image/*" onChange={(e) => handleStepImageUpload(e, block.id, step.id)} className="hidden" disabled={isUploading} />
                                                        {isUploading ? <Loader className="animate-spin text-purple-500 dark:text-purple-400" size={16} /> : <Upload size={16} className="text-purple-500 dark:text-purple-400" />}
                                                    </label>
                                                </div>
                                                {step.image && (
                                                    <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-border-thin dark:border-border-dark mt-1">
                                                        <img src={step.image} alt="Step preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                        <button 
                                                            type="button" 
                                                            onClick={() => updateStepInBlock(block.id, step.id, 'image', '')}
                                                            className="absolute top-1 right-1 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 transition-colors"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                     </div>
                                 </div>
                             </div>
                                   )}
                                 </Draggable>
                             ))}
                             {provided.placeholder}
                         <button type="button" onClick={() => addStepToBlock(block.id)} className="text-sm font-bold text-forest-green dark:text-accent-herb flex items-center gap-1 hover:underline"><Plus size={16} /> Add Step</button>
                     </div>
                   )}
                 </Droppable>
                 </div>
             ))}
             <button type="button" onClick={addInstructionBlock} className="w-full py-2 border-2 border-dashed border-forest-green/30 dark:border-accent-herb/30 text-forest-green dark:text-accent-herb font-bold rounded-lg hover:bg-forest-green/5 dark:hover:bg-accent-herb/5">+ Add Instruction Section</button>
          </section>

          <section className="space-y-4 pt-4 border-t border-border-thin dark:border-border-dark">
             <h3 className="text-lg font-bold text-forest-green dark:text-accent-herb">Nutrition & Storage</h3>
             <div className="grid grid-cols-4 gap-2">
                <div className="col-span-4 md:col-span-1">
                   <label className={LABEL_CLASS}>Calories</label>
                   <input type="number" value={getNumValue(formData.nutrition?.calories)} onChange={e => updateNested('nutrition', 'calories', e.target.value)} className={INPUT_CLASS} placeholder="kcal" />
                </div>
                {/* ... other macros ... */}
                <div className="col-span-4 md:col-span-1"><label className={LABEL_CLASS}>Protein (g)</label><input type="number" value={getNumValue(formData.nutrition?.protein)} onChange={e => updateNested('nutrition', 'protein', e.target.value)} className={INPUT_CLASS} placeholder="g" /></div>
                <div className="col-span-4 md:col-span-1"><label className={LABEL_CLASS}>Carbs (g)</label><input type="number" value={getNumValue(formData.nutrition?.carbs)} onChange={e => updateNested('nutrition', 'carbs', e.target.value)} className={INPUT_CLASS} placeholder="g" /></div>
                <div className="col-span-4 md:col-span-1"><label className={LABEL_CLASS}>Fat (g)</label><input type="number" value={getNumValue(formData.nutrition?.fat)} onChange={e => updateNested('nutrition', 'fat', e.target.value)} className={INPUT_CLASS} placeholder="g" /></div>
            </div>
            <div>
                <label className={LABEL_CLASS}>Storage & Reheating</label>
                <textarea value={formData.storageNotes || ''} onChange={e => handleChange('storageNotes', e.target.value)} rows={2} className={`${INPUT_CLASS} resize-none`} placeholder="e.g. Keeps for 3 days in fridge..." />
            </div>
          </section>

          <section className="space-y-4 pt-4 border-t border-border-thin dark:border-border-dark">
             <h3 className="text-lg font-bold text-forest-green dark:text-accent-herb">Attribution</h3>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div>
                     <label className={`${LABEL_CLASS} !flex items-center gap-2`}><User size={16} /> Added By</label>
                     <input type="text" value={formData.addedBy || ''} onChange={e => handleChange('addedBy', e.target.value)} className={INPUT_CLASS} placeholder="Your Name" />
                 </div>
                 <div>
                     <label className={`${LABEL_CLASS} !flex items-center gap-2`}><LinkIcon size={16} /> Source Name</label>
                     <input type="text" value={formData.source?.name || ''} onChange={e => updateNested('source', 'name', e.target.value)} className={INPUT_CLASS} placeholder="e.g. NYT Cooking" />
                 </div>
                 <div>
                     <label className={`${LABEL_CLASS} !flex items-center gap-2`}><LinkIcon size={16} /> Source URL</label>
                     <input type="text" value={formData.source?.url || ''} onChange={e => updateNested('source', 'url', e.target.value)} className={INPUT_CLASS} placeholder="https://..." />
                 </div>
             </div>
          </section>

          </DragDropContext>
        </div>
        <div className="p-4 border-t border-border-thin dark:border-border-dark flex flex-col sm:flex-row justify-between items-center gap-4 bg-white dark:bg-card-dark rounded-b-2xl">
          {/* Desktop-only icons in footer (bottom left) */}
          <div className="hidden sm:flex items-center gap-2">
              {!initialData && (
                  <>
                    <button type="button" onClick={handleImportClick} className="p-2 text-text-secondary hover:text-forest-green dark:hover:text-accent-herb transition-colors" title="Upload JSON File"><Upload size={20} /></button>
                    <button type="button" onClick={() => setShowJsonModal(true)} className="p-2 text-text-secondary hover:text-forest-green dark:hover:text-accent-herb transition-colors" title="Paste JSON Text"><Clipboard size={20} /></button>
                  </>
              )}
              {initialData?.id && onDelete && (
                  <button type="button" onClick={() => onDelete(initialData.id)} className="p-2 text-red-500 hover:text-red-600 transition-colors" title="Delete Recipe"><Trash2 size={20} /></button>
              )}
              {initialData && (
                  <button type="button" onClick={handleCopyJson} className="p-2 text-text-secondary hover:text-forest-green dark:hover:text-accent-herb transition-colors" title="Copy Recipe JSON"><Copy size={20} /></button>
              )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 sm:items-center w-full sm:w-auto ml-auto">
              <div className="flex gap-3 w-full sm:w-auto">
                <button type="button" onClick={onClose} className="flex-1 sm:flex-none px-5 py-2 rounded-lg border border-border-thin dark:border-border-dark hover:bg-bg-subtle dark:hover:bg-white/5 transition-colors">Cancel</button>
                <button type="submit" disabled={isUploading || isSaving} className="flex-1 sm:flex-none px-5 py-2 rounded-lg bg-forest-green dark:bg-accent-herb text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-black/10 hover:shadow-black/20 transition-all">
                    {isSaving ? <Loader size={18} className="animate-spin"/> : <Save size={18} />} 
                    Save
                </button>
              </div>
          </div>
        </div>
        <input type="file" ref={fileInputRef} onChange={handleFileImport} className="hidden" accept=".json" />
        
        {/* JSON/Text Paste Modal */}
        {showJsonModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowJsonModal(false)}>
                <div className="bg-white dark:bg-card-dark p-6 rounded-2xl w-full max-w-lg shadow-2xl border border-border-thin dark:border-border-dark flex flex-col gap-4" onClick={e => e.stopPropagation()}>
                    <h3 className="text-lg font-bold text-text-main dark:text-white">Paste Recipe Data</h3>
                    <p className="text-xs text-text-secondary">Paste JSON object or copied recipe text (with "Ingredients" and "Instructions" headers).</p>
                    <textarea 
                        value={jsonText}
                        onChange={e => setJsonText(e.target.value)}
                        className="w-full h-64 p-3 rounded-lg bg-bg-subtle dark:bg-white/10 border border-border-thin dark:border-border-dark font-mono text-xs resize-none focus:ring-2 focus:ring-forest-green dark:focus:ring-accent-herb outline-none text-text-main dark:text-white"
                        placeholder='Paste content here...'
                        autoFocus
                    />
                    <div className="flex justify-end gap-3">
                        <button onClick={() => setShowJsonModal(false)} className="px-4 py-2 rounded-lg text-text-secondary hover:bg-bg-subtle dark:hover:bg-white/5">Cancel</button>
                        <button onClick={handleTextImport} className="px-4 py-2 bg-forest-green dark:bg-accent-herb text-white dark:text-black rounded-lg font-bold hover:opacity-90 transition-opacity">Import</button>
                    </div>
                </div>
            </div>
        )}
      </form>

      {/* Toast Notification */}
      {toast.visible && (
          <div className={`fixed bottom-4 left-4 z-[200] px-4 py-3 rounded-lg shadow-xl text-white text-sm font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-300 ${toast.type === 'error' ? 'bg-red-500' : 'bg-gray-900 dark:bg-white dark:text-black'}`}>
              {toast.type === 'error' ? <AlertCircle size={16} /> : <Check size={16} />}
              {toast.message}
          </div>
      )}

    </div>
  );
};
export default RecipeForm;
