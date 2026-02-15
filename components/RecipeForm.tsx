
import React, { useState, useEffect, useRef } from 'react';
import { Recipe, Instruction, Ingredient } from '../types';
import { X, Plus, Save, Trash2, Upload, Image as ImageIcon, Lightbulb, Clock, RefreshCw, Users, Loader, CookingPot, AlertCircle, ArrowRightLeft, Scale, Activity } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import * as db from '../services/db';

interface RecipeFormProps {
  initialData?: Recipe | null;
  onSave: (recipe: Recipe) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

// Local form type allowing string input for amounts (e.g. "1/2")
interface FormIngredient extends Omit<Ingredient, 'amount'> {
    amount: string | number;
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
    yieldUnit: '', // Default empty, placeholder handles "servings"
    video: { url: '', note: '' },
    storageNotes: '',
    source: { name: '', url: '', author: '' },
    nutrition: { calories: undefined, protein: undefined, carbs: undefined, fat: undefined },
    favorite: false,
    archived: false,
    shareToFamily: true, // Default to true
    reviews: []
  });

  // Intermediate state for range inputs (string based)
  const [prepTimeStr, setPrepTimeStr] = useState('');
  const [cookTimeStr, setCookTimeStr] = useState('');

  // Upload State
  const [isUploading, setIsUploading] = useState(false);

  // Text Area State for Array fields
  const [rawTags, setRawTags] = useState('');
  const [rawCookware, setRawCookware] = useState('');

  // Structured State (Blocks)
  const [ingredientBlocks, setIngredientBlocks] = useState<IngredientBlock[]>([]);
  const [instructionBlocks, setInstructionBlocks] = useState<InstructionBlock[]>([]);

  // Import Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (initialData) {
      loadRecipeData(initialData);
    } else {
        setIngredientBlocks([{ id: uuidv4(), name: '', ingredients: [{ id: uuidv4(), amount: '', unit: '', item: '' }] }]);
        setInstructionBlocks([{ id: uuidv4(), name: '', steps: [{ id: uuidv4(), text: '' }] }]);
    }
  }, [initialData]);

  // Handle Paste Event for Images
  useEffect(() => {
      const handlePaste = (e: ClipboardEvent) => {
          if (isUploading) return;
          const items = e.clipboardData?.items;
          if (!items) return;

          for (let i = 0; i < items.length; i++) {
              if (items[i].type.indexOf('image') !== -1) {
                  const file = items[i].getAsFile();
                  if (file) {
                      e.preventDefault(); // Prevent pasting the binary code if focused in text field
                      processImageFile(file);
                      return; // Only process one image
                  }
              }
          }
      };

      window.addEventListener('paste', handlePaste);
      return () => window.removeEventListener('paste', handlePaste);
  }, [isUploading]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const flatIngredients: Ingredient[] = [];
    ingredientBlocks.forEach(block => {
        block.ingredients.forEach(ing => {
            if (ing.item.trim()) {
                flatIngredients.push({ ...ing, amount: parseAmount(ing.amount), section: block.name || undefined });
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

    const recipe: Recipe = {
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
      id: initialData?.id || uuidv4(),
      tags: rawTags.split(',').map(t => t.trim()).filter(Boolean),
      cookware: rawCookware.split(',').map(t => t.trim()).filter(Boolean),
      ingredients: flatIngredients,
      instructions: flatInstructions,
      components: [], 
      createdAt: initialData?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    onSave(recipe);
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
      const reader = new FileReader();
      reader.onload = (event) => {
          const img = new Image();
          img.onload = async () => {
              // 1. Resize/Compress via Canvas
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              const MAX_SIZE = 1200; // Larger max size for R2
              if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
              canvas.width = width; canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (ctx) { 
                  ctx.drawImage(img, 0, 0, width, height); 
                  
                  // 2. Convert to Blob
                  canvas.toBlob(async (blob) => {
                      if (blob) {
                          try {
                              setIsUploading(true);
                              // 3. Upload to R2 via API
                              const url = await db.uploadImage(blob);
                              handleChange('image', url);
                          } catch (e) {
                              console.error(e);
                              alert("Failed to upload image. Please ensure you are logged in (Shared Family Mode).");
                          } finally {
                              setIsUploading(false);
                          }
                      }
                  }, 'image/jpeg', 0.8);
              }
          };
          img.src = event.target?.result as string;
      };
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
            let recipeData = imported;
            if (Array.isArray(imported)) recipeData = imported[0];
            else if (imported.recipes && Array.isArray(imported.recipes)) recipeData = imported.recipes[0];
            
            const newData = { ...recipeData };
            // Populate form with imported data. 
            // If in Add mode, generate new ID. If Edit mode, keep current ID.
            if (!initialData) {
                newData.id = uuidv4();
                newData.createdAt = Date.now();
            } else {
                newData.id = initialData.id;
            }
            newData.updatedAt = Date.now();
            
            loadRecipeData(newData);
        } catch (err) {
            console.error(err);
            alert('Failed to parse recipe JSON.');
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  // Block Logic...
  const addIngredientBlock = () => setIngredientBlocks(prev => [...prev, { id: uuidv4(), name: 'New Group', ingredients: [{ id: uuidv4(), amount: '', unit: '', item: '' }] }]);
  const removeIngredientBlock = (blockId: string) => setIngredientBlocks(prev => prev.filter(b => b.id !== blockId));
  const updateIngredientBlockName = (blockId: string, name: string) => setIngredientBlocks(prev => prev.map(b => b.id === blockId ? { ...b, name } : b));
  const addIngredientToBlock = (blockId: string) => setIngredientBlocks(prev => prev.map(b => b.id === blockId ? { ...b, ingredients: [...b.ingredients, { id: uuidv4(), amount: '', unit: '', item: '' }] } : b));
  const updateIngredientInBlock = (blockId: string, ingId: string, field: keyof FormIngredient, value: any) => setIngredientBlocks(prev => prev.map(b => b.id !== blockId ? b : { ...b, ingredients: b.ingredients.map(i => i.id === ingId ? { ...i, [field]: value } : i) }));
  const removeIngredientFromBlock = (blockId: string, ingId: string) => setIngredientBlocks(prev => prev.map(b => b.id !== blockId ? b : { ...b, ingredients: b.ingredients.filter(i => i.id !== ingId) }));
  
  const toggleIngredientOptional = (blockId: string, ingId: string) => {
      setIngredientBlocks(prev => prev.map(b => b.id !== blockId ? b : {
          ...b,
          ingredients: b.ingredients.map(i => i.id === ingId ? { ...i, optional: !i.optional } : i)
      }));
  };

  const toggleIngredientSub = (blockId: string, ingId: string) => {
      setIngredientBlocks(prev => prev.map(b => b.id !== blockId ? b : {
          ...b,
          ingredients: b.ingredients.map(i => i.id === ingId ? { ...i, substitution: i.substitution === undefined ? '' : undefined } : i)
      }));
  };

  const addInstructionBlock = () => setInstructionBlocks(prev => [...prev, { id: uuidv4(), name: 'New Section', steps: [{ id: uuidv4(), text: '' }] }]);
  const removeInstructionBlock = (blockId: string) => setInstructionBlocks(prev => prev.filter(b => b.id !== blockId));
  const updateInstructionBlockName = (blockId: string, name: string) => setInstructionBlocks(prev => prev.map(b => b.id === blockId ? { ...b, name } : b));
  const addStepToBlock = (blockId: string) => setInstructionBlocks(prev => prev.map(b => b.id === blockId ? { ...b, steps: [...b.steps, { id: uuidv4(), text: '' }] } : b));
  const updateStepInBlock = (blockId: string, stepId: string, field: keyof Instruction, value: any) => setInstructionBlocks(prev => prev.map(b => b.id !== blockId ? b : { ...b, steps: b.steps.map(s => s.id === stepId ? { ...s, [field]: value } : s) }));
  const removeStepFromBlock = (blockId: string, stepId: string) => setInstructionBlocks(prev => prev.map(b => b.id !== blockId ? b : { ...b, steps: b.steps.filter(s => s.id !== stepId) }));
  const toggleStepTimer = (blockId: string, stepId: string) => setInstructionBlocks(prev => prev.map(b => b.id !== blockId ? b : { ...b, steps: b.steps.map(s => s.id !== stepId ? s : { ...s, timer: s.timer !== undefined ? undefined : 5 }) }));
  const toggleStepTip = (blockId: string, stepId: string) => setInstructionBlocks(prev => prev.map(b => b.id !== blockId ? b : { ...b, steps: b.steps.map(s => s.id !== stepId ? s : { ...s, tip: s.tip !== undefined ? undefined : '' }) }));
  const toggleStepOptional = (blockId: string, stepId: string) => setInstructionBlocks(prev => prev.map(b => b.id !== blockId ? b : { ...b, steps: b.steps.map(s => s.id !== stepId ? s : { ...s, optional: !s.optional }) }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-background-dark/80 backdrop-blur-sm" onClick={onClose}></div>
      <form onSubmit={handleSubmit} className="relative w-full max-w-4xl bg-card-light dark:bg-card-dark rounded-2xl shadow-xl flex flex-col max-h-[90vh] border border-border-light dark:border-border-dark">
        <div className="flex items-center justify-between p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-xl font-bold text-text-light dark:text-white">{initialData ? 'Edit Recipe' : 'Add New Recipe'}</h2>
          <button type="button" onClick={onClose} className="p-2 hover:bg-background-light dark:hover:bg-border-dark rounded-full transition-colors"><X size={20} className="text-text-light/50" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          
          <section className="space-y-4">
             <div className="flex items-center justify-between border-b border-border-light dark:border-border-dark pb-2">
                 <h3 className="text-lg font-bold text-primary">Basics</h3>
                 <label className="flex items-center gap-2 cursor-pointer bg-primary/10 px-3 py-1.5 rounded-lg border border-primary/20">
                     <div className={`w-4 h-4 rounded border flex items-center justify-center ${formData.shareToFamily ? 'bg-primary border-primary' : 'border-primary bg-transparent'}`}>
                         {formData.shareToFamily && <span className="material-symbols-outlined text-white text-[10px]">check</span>}
                     </div>
                     <input type="checkbox" className="hidden" checked={formData.shareToFamily} onChange={e => handleChange('shareToFamily', e.target.checked)} />
                     <span className="text-xs font-bold text-primary flex items-center gap-1"><Users size={14} /> Share to Family</span>
                 </label>
             </div>
             
             <div className="grid md:grid-cols-2 gap-4">
                 <div className="space-y-4">
                  <div><label className="label">Name *</label><input required type="text" value={formData.name || ''} onChange={e => handleChange('name', e.target.value)} className="input" placeholder="Recipe Title" /></div>
                  <div><label className="label">Course</label><select value={formData.category || 'Entrees'} onChange={e => handleChange('category', e.target.value)} className="input"><option value="Entrees">Entrees</option><option value="Sides">Sides</option><option value="Desserts">Desserts</option></select></div>
                </div>
                <div><label className="label">Description</label><textarea value={formData.description || ''} onChange={e => handleChange('description', e.target.value)} rows={4} className="input resize-none" placeholder="Short description..." /></div>
             </div>
             
             {/* Time and Yield */}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               <div>
                   <label className="label">Prep Time</label>
                   <input type="text" value={prepTimeStr} onChange={e => setPrepTimeStr(e.target.value)} className="input" placeholder="e.g. 15 or 15-20" />
                   <span className="text-[10px] text-text-muted opacity-80">Minutes (Range allowed)</span>
               </div>
               <div>
                   <label className="label">Cook Time</label>
                   <input type="text" value={cookTimeStr} onChange={e => setCookTimeStr(e.target.value)} className="input" placeholder="e.g. 30 or 30-45" />
                   <span className="text-[10px] text-text-muted opacity-80">Minutes (Range allowed)</span>
               </div>
               <div>
                   <label className="label">Yield</label>
                   <div className="flex gap-2">
                       <input type="number" value={getNumValue(formData.servings)} onChange={e => handleNumberChange('servings', e.target.value)} className="input w-20 text-center" placeholder="1"/>
                       <input type="text" value={formData.yieldUnit || ''} onChange={e => handleChange('yieldUnit', e.target.value)} className="input flex-1 min-w-[100px]" placeholder="servings" />
                   </div>
                   <span className="text-[10px] text-text-muted opacity-80">Amount and Unit</span>
               </div>
             </div>
             
             <div className="grid md:grid-cols-2 gap-4">
                <div>
                    <label className="label">Tags</label>
                    <input type="text" value={rawTags} onChange={e => setRawTags(e.target.value)} className="input" placeholder="Healthy, Quick..." />
                </div>
                <div>
                    <label className="label flex items-center gap-1"><CookingPot size={14} className="inline-block" /> Required Cookware</label>
                    <input type="text" value={rawCookware} onChange={e => setRawCookware(e.target.value)} className="input" placeholder="Dutch Oven, Blender, Sheet Pan..." />
                </div>
             </div>
             
             {/* Media Inputs (R2 Integration) */}
             <div className="pt-2">
                 <label className="label">Image</label>
                 <div className="flex gap-2">
                     <input type="text" value={formData.image || ''} onChange={e => handleChange('image', e.target.value)} className="input" placeholder="https://..." disabled={isUploading} />
                     <label className={`p-2 border border-border-light dark:border-border-dark rounded cursor-pointer transition-colors ${isUploading ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-white/5 bg-background-light dark:bg-surface-dark'}`}>
                         <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={isUploading} />
                         {isUploading ? <Loader className="animate-spin text-primary" size={20} /> : <Upload size={20} className="text-primary" />}
                     </label>
                 </div>
                 <p className="text-[10px] text-text-muted mt-1 italic">Tip: You can paste an image (Ctrl+V) directly into this form to upload it.</p>
                 {formData.image && (
                     <div className="mt-2 relative h-32 w-full rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 border border-border-light dark:border-border-dark">
                         <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
                     </div>
                 )}
             </div>
          </section>

          {/* Ingredients Section */}
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
                                 <div className="flex gap-2 items-start">
                                      <div className="flex-1 grid grid-cols-12 gap-2">
                                          <div className="col-span-3 sm:col-span-2"><input type="text" placeholder="Amt" value={ing.amount} onChange={e => updateIngredientInBlock(block.id, ing.id, 'amount', e.target.value)} className="input p-2 text-sm text-center" /></div>
                                          <div className="col-span-3 sm:col-span-3"><input type="text" placeholder="Unit" value={ing.unit || ''} onChange={e => updateIngredientInBlock(block.id, ing.id, 'unit', e.target.value)} className="input p-2 text-sm" /></div>
                                          <div className="col-span-6 sm:col-span-7"><input type="text" placeholder="Item Name" value={ing.item || ''} onChange={e => updateIngredientInBlock(block.id, ing.id, 'item', e.target.value)} className={`input p-2 text-sm font-medium ${ing.optional ? 'text-text-muted italic' : ''}`} /></div>
                                      </div>
                                      
                                      <div className="flex gap-1 items-center self-center pt-0 ml-1">
                                            <button 
                                                type="button" 
                                                onClick={() => toggleIngredientOptional(block.id, ing.id)} 
                                                className={`p-1.5 rounded transition-colors ${ing.optional ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-300 hover:text-blue-400'}`}
                                                title="Mark as Optional"
                                            >
                                                <AlertCircle size={16} />
                                            </button>
                                            <button 
                                                type="button" 
                                                onClick={() => toggleIngredientSub(block.id, ing.id)} 
                                                className={`p-1.5 rounded transition-colors ${ing.substitution !== undefined ? 'text-orange-500 bg-orange-50 dark:bg-orange-900/20' : 'text-gray-300 hover:text-orange-400'}`}
                                                title="Add Substitution"
                                            >
                                                <ArrowRightLeft size={16} />
                                            </button>
                                            <button type="button" onClick={() => removeIngredientFromBlock(block.id, ing.id)} className="text-red-400 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/10 rounded"><Trash2 size={16} /></button>
                                      </div>
                                 </div>
                                 
                                 {/* Substitution Row (Conditional) */}
                                 {ing.substitution !== undefined && (
                                     <div className="pl-1 relative mt-1">
                                          <ArrowRightLeft size={12} className="absolute left-3 top-2.5 text-text-muted pointer-events-none" />
                                          <input 
                                            type="text" 
                                            placeholder="Substitution (e.g. Tofu)" 
                                            value={ing.substitution} 
                                            onChange={e => updateIngredientInBlock(block.id, ing.id, 'substitution', e.target.value)} 
                                            className="input text-xs py-1.5 px-2 bg-white dark:bg-white/5 border-transparent focus:bg-white dark:focus:bg-black/20 focus:border-primary/30 !pl-9" 
                                          />
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

          {/* Instructions Section */}
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
                                        
                                        {/* Step Actions */}
                                        <div className="flex bg-gray-100 dark:bg-white/5 rounded-lg p-0.5">
                                            <button type="button" onClick={() => toggleStepTimer(block.id, step.id)} className={`p-1.5 rounded transition-colors ${step.timer !== undefined ? 'bg-white dark:bg-gray-700 text-primary shadow-sm' : 'text-text-muted hover:bg-white/50 dark:hover:bg-white/10'}`} title="Toggle Timer">
                                                <Clock size={16}/>
                                            </button>
                                            <button type="button" onClick={() => toggleStepTip(block.id, step.id)} className={`p-1.5 rounded transition-colors ${step.tip !== undefined ? 'bg-white dark:bg-gray-700 text-yellow-500 shadow-sm' : 'text-text-muted hover:bg-white/50 dark:hover:bg-white/10'}`} title="Add Tip">
                                                <Lightbulb size={16}/>
                                            </button>
                                            <button type="button" onClick={() => toggleStepOptional(block.id, step.id)} className={`p-1.5 rounded transition-colors ${step.optional ? 'bg-white dark:bg-gray-700 text-blue-500 shadow-sm' : 'text-text-muted hover:bg-white/50 dark:hover:bg-white/10'}`} title="Mark Optional">
                                                <AlertCircle size={16}/>
                                            </button>
                                        </div>
                                     </div>
                                     <textarea value={step.text || ''} onChange={e => updateStepInBlock(block.id, step.id, 'text', e.target.value)} placeholder="Step description..." rows={2} className="input text-sm" />
                                     
                                     {/* Extended Inputs */}
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

          {/* Nutrition & Storage Section (Restored) */}
          <section className="space-y-4 pt-4 border-t border-border-light dark:border-border-dark">
              <h3 className="text-lg font-bold text-primary flex items-center gap-2"><Activity size={18} /> Nutrition & Storage</h3>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                      <label className="label">Calories</label>
                      <input type="number" value={formData.nutrition?.calories || ''} onChange={e => updateNested('nutrition', 'calories', e.target.value)} className="input" placeholder="kcal" />
                  </div>
                  <div>
                      <label className="label">Protein (g)</label>
                      <input type="number" value={formData.nutrition?.protein || ''} onChange={e => updateNested('nutrition', 'protein', e.target.value)} className="input" placeholder="g" />
                  </div>
                  <div>
                      <label className="label">Carbs (g)</label>
                      <input type="number" value={formData.nutrition?.carbs || ''} onChange={e => updateNested('nutrition', 'carbs', e.target.value)} className="input" placeholder="g" />
                  </div>
                  <div>
                      <label className="label">Fat (g)</label>
                      <input type="number" value={formData.nutrition?.fat || ''} onChange={e => updateNested('nutrition', 'fat', e.target.value)} className="input" placeholder="g" />
                  </div>
              </div>

              <div>
                  <label className="label">Storage Notes</label>
                  <textarea 
                      value={formData.storageNotes || ''} 
                      onChange={e => handleChange('storageNotes', e.target.value)} 
                      rows={3} 
                      className="input" 
                      placeholder="How long does it keep in the fridge? Freezing instructions?" 
                  />
              </div>
          </section>

        </div>
        <div className="p-4 border-t border-border-light dark:border-border-dark flex justify-between gap-3 bg-card-light dark:bg-card-dark rounded-b-2xl">
          <div className="flex items-center gap-3">
              <button type="button" onClick={handleImportClick} className="p-2 text-text-muted hover:text-primary transition-colors" title="Import Recipe JSON">
                  <Upload size={20} />
              </button>
              {initialData?.id && onDelete && (
                  <button type="button" onClick={() => onDelete(initialData.id)} className="p-2 text-red-500 hover:text-red-600 transition-colors" title="Delete Recipe"><Trash2 size={20} /></button>
              )}
          </div>
          <div className="flex gap-3 items-center">
              <button type="button" onClick={onClose} className="px-5 py-2 rounded-lg">Cancel</button>
              <button type="submit" disabled={isUploading} className="px-5 py-2 rounded-lg bg-primary text-white font-bold flex items-center gap-2 disabled:opacity-50"><Save size={18} /> Save</button>
          </div>
        </div>
        <input type="file" ref={fileInputRef} onChange={handleFileImport} className="hidden" accept=".json" />
      </form>
      <style>{`.label { display: block; font-size: 0.875rem; font-weight: 500; color: #4e9767; margin-bottom: 0.25rem; } .dark .label { color: #8bc49e; } .input { width: 100%; padding: 0.5rem 0.75rem; border-radius: 0.5rem; border: 1px solid #e7f3eb; background-color: #f8fcf9; color: #0e1b12; outline: none; } .dark .input { border-color: #2a4030; background-color: #1a2c20; color: white; }`}</style>
    </div>
  );
};
export default RecipeForm;
