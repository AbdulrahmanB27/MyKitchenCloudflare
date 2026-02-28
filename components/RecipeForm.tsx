
import React, { useState, useEffect, useRef } from 'react';
import { Recipe, Instruction, Ingredient } from '../types';
import { X, Plus, Save, Trash2, Upload, Clipboard, Image as ImageIcon, Lightbulb, Clock, RefreshCw, Users, Loader, CookingPot, AlertCircle, ArrowRightLeft, Scale, Activity, Link as LinkIcon, User, Lock, ChevronDown, Copy, Check } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import * as db from '../services/db';

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
  const [syncToFamily, setSyncToFamily] = useState(true);
  const [syncToAll, setSyncToAll] = useState(false);
  const [availableSessions, setAvailableSessions] = useState<any[]>([]);
  const currentFamilyId = db.getCurrentFamilyId();
  const pinnedFamilyId = db.getPinnedFamilyId();
  
  // Custom Dropdown State
  const [isFamilySelectorOpen, setIsFamilySelectorOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Close dropdown when clicking outside
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
              setIsFamilySelectorOpen(false);
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
          if (currentFamilyId) setTargetFamilyId(currentFamilyId);
          else if (pinnedFamilyId) setTargetFamilyId(pinnedFamilyId);
          setSyncToFamily(true);
      } else {
          setTargetFamilyId('private');
          setSyncToFamily(false);
      }

      // --- Load Ingredients into Blocks ---
      const ingBlocks: IngredientBlock[] = [];
      const mainIngs = data.ingredients || [];
      if (mainIngs.length > 0) {
          const grouped = new Map<string, Ingredient[]>();
          const defaultSection = 'Main Ingredients';
          mainIngs.forEach(ing => {
              const sec = ing.section || defaultSection;
              if (!grouped.has(sec)) grouped.set(sec, []);
              grouped.get(sec)!.push(ing);
          });
          grouped.forEach((ings, sec) => {
              ingBlocks.push({ id: uuidv4(), name: sec === defaultSection ? '' : sec, ingredients: ings.map(i => ({...i, id: i.id || uuidv4() })) });
          });
      }
      if (data.components && data.components.length > 0) {
          data.components.forEach(comp => {
              ingBlocks.push({ id: uuidv4(), name: comp.label, ingredients: comp.ingredients.map(i => ({...i, id: i.id || uuidv4() })) });
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
        if (pinnedFamilyId) {
            setTargetFamilyId(pinnedFamilyId);
            setSyncToFamily(true);
        } else if (currentFamilyId) {
            setTargetFamilyId(currentFamilyId);
            setSyncToFamily(true);
        } else {
            setTargetFamilyId('private');
            setSyncToFamily(false);
        }

        setIngredientBlocks([{ id: uuidv4(), name: '', ingredients: [{ id: uuidv4(), amount: '', unit: '', item: '' }] }]);
        setInstructionBlocks([{ id: uuidv4(), name: '', steps: [{ id: uuidv4(), text: '' }] }]);
        
        const lastAuthor = db.safeGetItem('mykitchen_last_author');
        if (lastAuthor) {
            setFormData(prev => ({ ...prev, addedBy: lastAuthor }));
        }
    } else {
        loadRecipeData(initialData);
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
                  if (confirm("Detected Recipe JSON in clipboard. Import it?")) {
                      processImportedData(parsed);
                  }
              } catch (e) {
                  // Not JSON, try Text Parsing
                  const textRecipe = parseRecipeText(text);
                  if (textRecipe && (textRecipe.ingredients?.length || textRecipe.instructions?.length)) {
                      if (confirm("Detected recipe text structure. Attempt to import?")) {
                          // Merge with default form data to ensure structure
                          const merged = { ...formData, ...textRecipe };
                          // Ensure IDs
                          loadRecipeData(merged as Recipe);
                      }
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
                    amount: parseAmount(ing.amount), 
                    secondaryAmount: (ing.secondaryAmount !== undefined && ing.secondaryAmount !== '') ? parseAmount(ing.secondaryAmount) : undefined,
                    section: block.name || undefined 
                });
            }
        });
    });

    const flatInstructions: Instruction[] = [];
    instructionBlocks.forEach(block => {
        block.steps.forEach(step => {
            if (step.text.trim()) {
                flatInstructions.push({ ...step, section: block.name || undefined });
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
      tags: rawTags.split(',').map(t => t.trim()).filter(Boolean),
      cookware: rawCookware.split(',').map(t => t.trim()).filter(Boolean),
      ingredients: flatIngredients,
      instructions: flatInstructions,
      components: [], 
      createdAt: initialData?.createdAt || Date.now(),
      updatedAt: Date.now(),
      shareToFamily: syncToFamily
    };
  };

  const handleCopyJson = () => {
      const recipe = getRecipeObject();
      navigator.clipboard.writeText(JSON.stringify(recipe, null, 2)).then(() => alert('Recipe JSON copied!'));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    if (formData.addedBy) {
        db.safeSetItem('mykitchen_last_author', formData.addedBy);
    }

    const recipe = getRecipeObject();
    
    // FORK LOGIC: If existing was shared, but user turned off sync -> Clone as new Private ID
    if (initialData?.shareToFamily && !syncToFamily && targetFamilyId === currentFamilyId) {
        recipe.id = uuidv4();
        recipe.shareToFamily = false;
        alert("Saving as a new private copy (Sync disabled).");
    }

    try {
        const promises: Promise<any>[] = [];

        // 1. Sync to All (Broadcast)
        if (syncToAll && availableSessions.length > 1) {
             const otherSessions = availableSessions.filter(s => s.id !== targetFamilyId);
             otherSessions.forEach(s => {
                 promises.push(db.crossPostRecipe(recipe, s.id));
             });
        }

        // 2. Handle Primary Target
        if (targetFamilyId === 'private') {
            recipe.shareToFamily = false;
            // onSave handles the local save
        } else if (targetFamilyId === currentFamilyId) {
            // onSave handles the local save (which includes sync to current family)
        } else {
            // Target is another family. We need to crossPost to it.
            promises.push(db.crossPostRecipe(recipe, targetFamilyId));
        }

        // Wait for cross-posts
        if (promises.length > 0) await Promise.all(promises);

        // Finalize
        if (targetFamilyId === 'private' || targetFamilyId === currentFamilyId) {
            onSave(recipe); 
        } else {
            const targetName = availableSessions.find(s => s.id === targetFamilyId)?.name || 'other family';
            alert(`Recipe saved to ${targetName}${syncToAll ? ' and synced to all families' : ''}.`);
            onClose();
        }
    } catch (err: any) {
        console.error(err);
        alert(`Failed to save: ${err.message}`);
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
                              alert("Failed to upload image. Ensure you are logged in.");
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
            alert('Failed to parse recipe JSON.');
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
              alert("Could not detect valid JSON or recognized recipe text format.");
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
      <form onSubmit={handleSubmit} className="relative w-full max-w-4xl bg-card-light dark:bg-card-dark rounded-2xl shadow-xl flex flex-col max-h-[90vh] border border-border-light dark:border-border-dark">
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-xl font-bold text-text-light dark:text-white">{initialData ? 'Edit Recipe' : 'Add New Recipe'}</h2>
          <button type="button" onClick={onClose} className="p-2 hover:bg-background-light dark:hover:bg-border-dark rounded-full transition-colors"><X size={20} className="text-text-light/50" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8 custom-scrollbar">
          {/* Basics */}
          <section className="space-y-4">
             <div className="flex items-center justify-between border-b border-border-light dark:border-border-dark pb-2">
                 <h3 className="text-lg font-bold text-primary">Basics</h3>
                 
                 {/* Custom Family Selector */}
                 <div className="relative" ref={dropdownRef}>
                     <button 
                        type="button"
                        onClick={() => setIsFamilySelectorOpen(!isFamilySelectorOpen)}
                        className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg bg-background-light dark:bg-surface-dark border border-border-light dark:border-border-dark hover:border-primary/50 text-xs font-bold text-text-main dark:text-white transition-all shadow-sm"
                     >
                         {targetFamilyId === 'private' ? <Lock size={14} className="text-primary" /> : <Users size={14} className="text-primary" />}
                         <span>{getTargetFamilyName()}</span>
                         <ChevronDown size={14} className={`text-text-muted transition-transform ${isFamilySelectorOpen ? 'rotate-180' : ''}`} />
                     </button>

                     {isFamilySelectorOpen && (
                         <div className="absolute right-0 top-full mt-2 w-56 bg-surface-light dark:bg-surface-dark rounded-xl shadow-xl border border-border-light dark:border-border-dark overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-200">
                             <div className="py-1">
                                 <button
                                    type="button"
                                    onClick={() => { setTargetFamilyId('private'); setSyncToFamily(false); setIsFamilySelectorOpen(false); }}
                                    className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${targetFamilyId === 'private' ? 'bg-primary/5 text-primary' : 'text-text-main dark:text-white'}`}
                                 >
                                     <Lock size={16} />
                                     <span className="text-sm font-bold">Private (This Device)</span>
                                     {targetFamilyId === 'private' && <Check size={14} className="ml-auto" />}
                                 </button>
                                 <div className="h-px bg-border-light dark:border-border-dark mx-3 my-1"></div>
                                 {availableSessions.map(s => (
                                     <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => { setTargetFamilyId(s.id); setSyncToFamily(true); setIsFamilySelectorOpen(false); }}
                                        className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${targetFamilyId === s.id ? 'bg-primary/5 text-primary' : 'text-text-main dark:text-white'}`}
                                     >
                                         <Users size={16} />
                                         <div className="flex flex-col">
                                             <span className="text-sm font-bold">{s.name}</span>
                                             {s.id === currentFamilyId && <span className="text-[10px] text-text-muted uppercase font-bold">Current</span>}
                                         </div>
                                         {targetFamilyId === s.id && <Check size={14} className="ml-auto" />}
                                     </button>
                                 ))}
                             </div>
                         </div>
                     )}
                 </div>
                 
                 {availableSessions.length > 1 && (
                     <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                         <input 
                            type="checkbox" 
                            checked={syncToAll} 
                            onChange={e => setSyncToAll(e.target.checked)}
                            className="rounded text-primary focus:ring-primary w-4 h-4"
                         />
                         <span className="text-xs font-bold text-text-muted hover:text-primary transition-colors">Sync to all families</span>
                     </label>
                 )}
             </div>
             
             {/* ... Inputs same as before ... */}
             <div className="grid md:grid-cols-2 gap-4">
                 <div className="space-y-4">
                  <div><label className="label">Name *</label><input required type="text" value={formData.name || ''} onChange={e => handleChange('name', e.target.value)} className="input" placeholder="Recipe Title" /></div>
                  <div><label className="label">Course</label><select value={formData.category || 'Entrees'} onChange={e => handleChange('category', e.target.value)} className="input"><option value="Entrees">Entrees</option><option value="Sides">Sides</option><option value="Desserts">Desserts</option></select></div>
                </div>
                <div><label className="label">Description</label><textarea value={formData.description || ''} onChange={e => handleChange('description', e.target.value)} rows={4} className="input resize-none" placeholder="Short description..." /></div>
             </div>
             {/* ... Time Inputs ... */}
             <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
               <div className="col-span-1">
                   <label className="label">Prep Time</label>
                   <input type="text" value={prepTimeStr} onChange={e => setPrepTimeStr(e.target.value)} className="input" placeholder="e.g. 15" />
               </div>
               <div className="col-span-1">
                   <label className="label">Cook Time</label>
                   <input type="text" value={cookTimeStr} onChange={e => setCookTimeStr(e.target.value)} className="input" placeholder="e.g. 30" />
               </div>
               <div className="col-span-2 md:col-span-1">
                   <label className="label">Yield</label>
                   <div className="flex gap-2">
                       <input type="number" value={getNumValue(formData.servings)} onChange={e => handleNumberChange('servings', e.target.value)} className="input w-20 text-center" placeholder="1"/>
                       <input type="text" value={formData.yieldUnit || ''} onChange={e => handleChange('yieldUnit', e.target.value)} className="input flex-1 min-w-[100px]" placeholder="servings" />
                   </div>
               </div>
             </div>
             <div className="grid md:grid-cols-2 gap-4">
                <div>
                    <label className="label">Tags</label>
                    <input type="text" value={rawTags} onChange={e => setRawTags(e.target.value)} className="input" placeholder="Healthy, Quick..." />
                </div>
                <div>
                    <label className="label !flex items-center gap-2"><CookingPot size={16} /> Required Cookware</label>
                    <input type="text" value={rawCookware} onChange={e => setRawCookware(e.target.value)} className="input" placeholder="Dutch Oven, Blender..." />
                </div>
             </div>
             <div className="pt-2">
                 <label className="label">Image</label>
                 <div className="flex gap-2">
                     <input type="text" value={formData.image || ''} onChange={e => handleChange('image', e.target.value)} className="input" placeholder="https://..." disabled={isUploading} />
                     <label className={`p-2 border border-border-light dark:border-border-dark rounded cursor-pointer transition-colors ${isUploading ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-white/5 bg-background-light dark:bg-surface-dark'}`}>
                         <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={isUploading} />
                         {isUploading ? <Loader className="animate-spin text-primary" size={20} /> : <Upload size={20} className="text-primary" />}
                     </label>
                 </div>
             </div>
          </section>

          <section className="space-y-4">
             <h3 className="text-lg font-bold text-primary border-b border-border-light dark:border-border-dark pb-2">Ingredients</h3>
             {ingredientBlocks.map((block, bIdx) => (
                 <div key={block.id} className="relative bg-background-light dark:bg-surface-dark/50 rounded-xl p-4 border border-border-light dark:border-border-dark">
                     <div className="flex items-center gap-2 mb-3">
                         <input type="text" value={block.name} onChange={e => updateIngredientBlockName(block.id, e.target.value)} placeholder={bIdx === 0 ? "Main Ingredients" : "Section Name"} className="bg-transparent font-bold text-primary placeholder:text-primary/40 focus:outline-none w-full"/>
                         {ingredientBlocks.length > 1 && <button type="button" onClick={() => removeIngredientBlock(block.id)} className="text-red-400 p-1"><Trash2 size={16}/></button>}
                     </div>
                     <div className="space-y-2">
                         {block.ingredients.map((ing) => (
                             <div key={ing.id} className="flex flex-col gap-2 p-3 rounded-lg bg-white/50 dark:bg-black/20 border border-transparent hover:border-border-light dark:hover:border-border-dark transition-colors">
                                 <div className="grid grid-cols-12 gap-2 items-center">
                                      <div className="col-span-12 sm:col-span-6">
                                          <input type="text" placeholder="Item Name" value={ing.item || ''} onChange={e => updateIngredientInBlock(block.id, ing.id, 'item', e.target.value)} className={`input p-2 text-sm font-medium ${ing.optional ? 'text-text-muted italic' : ''}`} />
                                      </div>
                                      <div className="col-span-3 sm:col-span-2">
                                          <input type="text" placeholder="Amt" value={ing.amount} onChange={e => updateIngredientInBlock(block.id, ing.id, 'amount', e.target.value)} className="input p-2 text-sm text-center" />
                                      </div>
                                      <div className="col-span-4 sm:col-span-2">
                                          <input type="text" placeholder="Unit" value={ing.unit || ''} onChange={e => updateIngredientInBlock(block.id, ing.id, 'unit', e.target.value)} className="input p-2 text-sm" />
                                      </div>
                                      <div className="col-span-5 sm:col-span-2 flex gap-1 items-center justify-end sm:justify-center">
                                            <button type="button" onClick={() => toggleIngredientOptional(block.id, ing.id)} className={`p-1.5 rounded transition-colors ${ing.optional ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-300 hover:text-blue-400'}`}><AlertCircle size={16} /></button>
                                            <button type="button" onClick={() => toggleIngredientSecondary(block.id, ing.id)} className={`p-1.5 rounded transition-colors ${ing.secondaryAmount !== undefined ? 'text-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'text-gray-300 hover:text-purple-400'}`}><Scale size={16} /></button>
                                            <button type="button" onClick={() => toggleIngredientSub(block.id, ing.id)} className={`p-1.5 rounded transition-colors ${ing.substitution !== undefined ? 'text-orange-500 bg-orange-50 dark:bg-orange-900/20' : 'text-gray-300 hover:text-orange-400'}`}><ArrowRightLeft size={16} /></button>
                                            <button type="button" onClick={() => removeIngredientFromBlock(block.id, ing.id)} className="text-red-400 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/10 rounded"><Trash2 size={16} /></button>
                                      </div>
                                 </div>
                                 {ing.secondaryAmount !== undefined && (
                                     <div className="flex gap-2 items-center mt-2 ml-1 w-full max-w-full overflow-hidden">
                                          <div className="w-5 flex justify-center shrink-0"><Scale size={20} className="text-purple-400" /></div>
                                          <input type="text" placeholder="Sec. Amt" value={ing.secondaryAmount || ''} onChange={e => updateIngredientInBlock(block.id, ing.id, 'secondaryAmount', e.target.value)} className="input text-xs py-1.5 px-2 bg-white dark:bg-white/5 border-transparent focus:bg-white dark:focus:bg-black/20 focus:border-primary/30 w-24 text-center shrink-0" />
                                          <input type="text" placeholder="Sec. Unit (e.g. g)" value={ing.secondaryUnit || ''} onChange={e => updateIngredientInBlock(block.id, ing.id, 'secondaryUnit', e.target.value)} className="input text-xs py-1.5 px-2 bg-white dark:bg-white/5 border-transparent focus:bg-white dark:focus:bg-black/20 focus:border-primary/30 flex-1 min-w-0" />
                                     </div>
                                 )}
                                 {ing.substitution !== undefined && (
                                     <div className="flex gap-2 items-center mt-2 ml-1 w-full max-w-full overflow-hidden">
                                          <div className="w-5 flex justify-center shrink-0"><ArrowRightLeft size={20} className="text-orange-400" /></div>
                                          <input type="text" placeholder="Substitution" value={ing.substitution || ''} onChange={e => updateIngredientInBlock(block.id, ing.id, 'substitution', e.target.value)} className="input text-xs py-1.5 px-2 bg-white dark:bg-white/5 border-transparent focus:bg-white dark:focus:bg-black/20 focus:border-primary/30 flex-1 min-w-0" />
                                     </div>
                                 )}
                             </div>
                         ))}
                         <button type="button" onClick={() => addIngredientToBlock(block.id)} className="text-sm font-bold text-primary flex items-center gap-1 mt-2 hover:underline"><Plus size={16} /> Add Ingredient</button>
                     </div>
                 </div>
             ))}
             <button type="button" onClick={addIngredientBlock} className="w-full py-2 border-2 border-dashed border-primary/30 text-primary font-bold rounded-lg hover:bg-primary/5">+ Add Ingredient Group</button>
          </section>

          <section className="space-y-4">
             <h3 className="text-lg font-bold text-primary border-b border-border-light dark:border-border-dark pb-2">Instructions</h3>
             {instructionBlocks.map((block, bIdx) => (
                 <div key={block.id} className="relative bg-background-light dark:bg-surface-dark/50 rounded-xl p-4 border border-border-light dark:border-border-dark">
                     <div className="flex items-center gap-2 mb-3">
                         <input type="text" value={block.name} onChange={e => updateInstructionBlockName(block.id, e.target.value)} placeholder={bIdx === 0 ? "Main Instructions" : "Section Name"} className="bg-transparent font-bold text-primary placeholder:text-primary/40 focus:outline-none w-full"/>
                         {instructionBlocks.length > 1 && <button type="button" onClick={() => removeInstructionBlock(block.id)} className="text-red-400 p-1"><Trash2 size={16}/></button>}
                     </div>
                     <div className="space-y-3">
                         {block.steps.map((step, idx) => (
                             <div key={step.id} className="flex gap-3">
                                 <div className={`size-6 rounded-full flex items-center justify-center text-xs font-bold mt-2 ${step.optional ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800' : 'bg-primary/10 text-primary'}`}>{idx + 1}</div>
                                 <div className="flex-1 space-y-2">
                                     <div className="flex gap-2 items-center">
                                        <input type="text" value={step.title || ''} onChange={e => updateStepInBlock(block.id, step.id, 'title', e.target.value)} placeholder="Title (Opt)" className="input text-sm py-1 font-bold flex-1" />
                                        <div className="flex bg-gray-100 dark:bg-white/5 rounded-lg p-0.5">
                                            <button type="button" onClick={() => toggleStepTimer(block.id, step.id)} className={`p-1.5 rounded transition-colors ${step.timer !== undefined ? 'bg-white dark:bg-gray-700 text-primary shadow-sm' : 'text-text-muted hover:bg-white/50 dark:hover:bg-white/10'}`}><Clock size={16}/></button>
                                            <button type="button" onClick={() => toggleStepTip(block.id, step.id)} className={`p-1.5 rounded transition-colors ${step.tip !== undefined ? 'bg-white dark:bg-gray-700 text-yellow-500 shadow-sm' : 'text-text-muted hover:bg-white/50 dark:hover:bg-white/10'}`}><Lightbulb size={16}/></button>
                                            <button type="button" onClick={() => toggleStepOptional(block.id, step.id)} className={`p-1.5 rounded transition-colors ${step.optional ? 'bg-white dark:bg-gray-700 text-blue-500 shadow-sm' : 'text-text-muted hover:bg-white/50 dark:hover:bg-white/10'}`}><AlertCircle size={16}/></button>
                                        </div>
                                     </div>
                                     <textarea value={step.text || ''} onChange={e => updateStepInBlock(block.id, step.id, 'text', e.target.value)} placeholder="Step description..." rows={2} className="input text-sm" />
                                     <div className="flex flex-wrap gap-2">
                                         {step.timer !== undefined && (
                                             <div className="flex items-center gap-1 bg-primary/5 border border-primary/20 rounded-md px-2 py-1">
                                                 <Clock size={12} className="text-primary"/>
                                                 <input type="number" value={step.timer} onChange={e => updateStepInBlock(block.id, step.id, 'timer', parseInt(e.target.value))} className="bg-transparent border-none p-0 text-xs w-12 text-center font-bold focus:ring-0" placeholder="Min" />
                                                 <span className="text-xs text-primary font-medium">min</span>
                                             </div>
                                         )}
                                         {step.tip !== undefined && (
                                             <div className="flex items-center gap-1 flex-1 min-w-[200px]">
                                                 <input type="text" value={step.tip} onChange={e => updateStepInBlock(block.id, step.id, 'tip', e.target.value)} placeholder="Add a helpful tip..." className="input text-xs py-1 px-2 border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-900/30 focus:border-yellow-400 w-full" autoFocus />
                                             </div>
                                         )}
                                     </div>
                                 </div>
                                 <button type="button" onClick={() => removeStepFromBlock(block.id, step.id)} className="text-red-400 mt-2 hover:bg-red-50 dark:hover:bg-red-900/10 p-1 rounded transition-colors h-fit"><Trash2 size={16}/></button>
                             </div>
                         ))}
                         <button type="button" onClick={() => addStepToBlock(block.id)} className="text-sm font-bold text-primary flex items-center gap-1 hover:underline"><Plus size={16} /> Add Step</button>
                     </div>
                 </div>
             ))}
             <button type="button" onClick={addInstructionBlock} className="w-full py-2 border-2 border-dashed border-primary/30 text-primary font-bold rounded-lg hover:bg-primary/5">+ Add Instruction Section</button>
          </section>

          <section className="space-y-4 pt-4 border-t border-border-light dark:border-border-dark">
             <h3 className="text-lg font-bold text-primary">Nutrition & Storage</h3>
             <div className="grid grid-cols-4 gap-2">
                <div className="col-span-4 md:col-span-1">
                   <label className="label">Calories</label>
                   <input type="number" value={getNumValue(formData.nutrition?.calories)} onChange={e => updateNested('nutrition', 'calories', e.target.value)} className="input" placeholder="kcal" />
                </div>
                {/* ... other macros ... */}
                <div className="col-span-4 md:col-span-1"><label className="label">Protein (g)</label><input type="number" value={getNumValue(formData.nutrition?.protein)} onChange={e => updateNested('nutrition', 'protein', e.target.value)} className="input" placeholder="g" /></div>
                <div className="col-span-4 md:col-span-1"><label className="label">Carbs (g)</label><input type="number" value={getNumValue(formData.nutrition?.carbs)} onChange={e => updateNested('nutrition', 'carbs', e.target.value)} className="input" placeholder="g" /></div>
                <div className="col-span-4 md:col-span-1"><label className="label">Fat (g)</label><input type="number" value={getNumValue(formData.nutrition?.fat)} onChange={e => updateNested('nutrition', 'fat', e.target.value)} className="input" placeholder="g" /></div>
            </div>
            <div>
                <label className="label">Storage & Reheating</label>
                <textarea value={formData.storageNotes || ''} onChange={e => handleChange('storageNotes', e.target.value)} rows={2} className="input resize-none" placeholder="e.g. Keeps for 3 days in fridge..." />
            </div>
          </section>

          <section className="space-y-4 pt-4 border-t border-border-light dark:border-border-dark">
             <h3 className="text-lg font-bold text-primary">Attribution</h3>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div>
                     <label className="label !flex items-center gap-2"><User size={16} /> Added By</label>
                     <input type="text" value={formData.addedBy || ''} onChange={e => handleChange('addedBy', e.target.value)} className="input" placeholder="Your Name" />
                 </div>
                 <div>
                     <label className="label !flex items-center gap-2"><LinkIcon size={16} /> Source Name</label>
                     <input type="text" value={formData.source?.name || ''} onChange={e => updateNested('source', 'name', e.target.value)} className="input" placeholder="e.g. NYT Cooking" />
                 </div>
                 <div>
                     <label className="label !flex items-center gap-2"><LinkIcon size={16} /> Source URL</label>
                     <input type="text" value={formData.source?.url || ''} onChange={e => updateNested('source', 'url', e.target.value)} className="input" placeholder="https://..." />
                 </div>
             </div>
          </section>

        </div>
        <div className="p-4 border-t border-border-light dark:border-border-dark flex flex-col-reverse sm:flex-row justify-between gap-4 bg-card-light dark:bg-card-dark rounded-b-2xl">
          <div className="flex items-center justify-center sm:justify-start gap-3">
              {!initialData && (
                  <>
                    <button type="button" onClick={handleImportClick} className="p-2 text-text-muted hover:text-primary transition-colors" title="Upload JSON File"><Upload size={20} /></button>
                    <button type="button" onClick={() => setShowJsonModal(true)} className="p-2 text-text-muted hover:text-primary transition-colors" title="Paste JSON Text"><Clipboard size={20} /></button>
                  </>
              )}
              {/* Copy JSON Button */}
              {initialData && (
                  <button type="button" onClick={handleCopyJson} className="p-2 text-text-muted hover:text-primary transition-colors" title="Copy Recipe JSON"><Copy size={20} /></button>
              )}
              {initialData?.id && onDelete && (
                  <button type="button" onClick={() => onDelete(initialData.id)} className="p-2 text-red-500 hover:text-red-600 transition-colors" title="Delete Recipe"><Trash2 size={20} /></button>
              )}
          </div>
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
              {targetFamilyId !== 'private' && (
                  <div 
                    onClick={() => setSyncToFamily(!syncToFamily)} 
                    className="flex items-center justify-center gap-2 cursor-pointer text-sm text-text-muted hover:text-text-main dark:hover:text-white transition-colors select-none"
                  >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${syncToFamily ? 'bg-primary border-primary' : 'border-gray-400 bg-transparent'}`}>
                          {syncToFamily && <span className="material-symbols-outlined text-white text-[10px]">check</span>}
                      </div>
                      <span>Sync to Family</span>
                  </div>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="flex-1 sm:flex-none px-5 py-2 rounded-lg border border-border-light dark:border-border-dark hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">Cancel</button>
                <button type="submit" disabled={isUploading || isSaving} className="flex-1 sm:flex-none px-5 py-2 rounded-lg bg-primary text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all">
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
                <div className="bg-surface-light dark:bg-surface-dark p-6 rounded-2xl w-full max-w-lg shadow-2xl border border-border-light dark:border-border-dark flex flex-col gap-4" onClick={e => e.stopPropagation()}>
                    <h3 className="text-lg font-bold text-text-main dark:text-white">Paste Recipe Data</h3>
                    <p className="text-xs text-text-muted">Paste JSON object or copied recipe text (with "Ingredients" and "Instructions" headers).</p>
                    <textarea 
                        value={jsonText}
                        onChange={e => setJsonText(e.target.value)}
                        className="w-full h-64 p-3 rounded-lg bg-background-light dark:bg-black/20 border border-border-light dark:border-border-dark font-mono text-xs resize-none focus:ring-2 focus:ring-primary outline-none"
                        placeholder='Paste content here...'
                        autoFocus
                    />
                    <div className="flex justify-end gap-3">
                        <button onClick={() => setShowJsonModal(false)} className="px-4 py-2 rounded-lg text-text-muted hover:bg-gray-100 dark:hover:bg-white/5">Cancel</button>
                        <button onClick={handleTextImport} className="px-4 py-2 bg-primary text-white rounded-lg font-bold hover:bg-green-600">Import</button>
                    </div>
                </div>
            </div>
        )}
      </form>
      <style>{`.label { display: block; font-size: 0.875rem; font-weight: 500; color: #4e9767; margin-bottom: 0.25rem; } .dark .label { color: #8bc49e; } .input { width: 100%; padding: 0.5rem 0.75rem; border-radius: 0.5rem; border: 1px solid #e7f3eb; background-color: #f8fcf9; color: #0e1b12; outline: none; } .dark .input { border-color: #2a4030; background-color: #1a2c20; color: white; }`}</style>
    </div>
  );
};
export default RecipeForm;
