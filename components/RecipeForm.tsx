
import React, { useState, useEffect } from 'react';
import { Recipe, Instruction, Ingredient } from '../types';
import { X, Plus, Save, Trash2, Upload, Image as ImageIcon, Lightbulb, Clock, RefreshCw, Users, Loader } from 'lucide-react';
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
    image: '',
    prepTime: 0,
    cookTime: 0,
    servings: 1,
    video: { url: '', note: '' },
    storageNotes: '',
    source: { name: '', url: '', author: '' },
    nutrition: { calories: undefined, protein: undefined, carbs: undefined, fat: undefined },
    favorite: false,
    archived: false,
    shareToFamily: true, // Default to true
    reviews: []
  });

  // Upload State
  const [isUploading, setIsUploading] = useState(false);

  // Text Area State for Array fields
  const [rawTags, setRawTags] = useState('');

  // Structured State (Blocks)
  const [ingredientBlocks, setIngredientBlocks] = useState<IngredientBlock[]>([]);
  const [instructionBlocks, setInstructionBlocks] = useState<InstructionBlock[]>([]);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
      setRawTags((initialData.tags || []).join(', '));
      
      // --- Load Ingredients into Blocks ---
      const ingBlocks: IngredientBlock[] = [];
      const mainIngs = initialData.ingredients || [];
      if (mainIngs.length > 0) {
          const grouped = new Map<string, Ingredient[]>();
          const defaultSection = 'Main Ingredients';
          mainIngs.forEach(ing => {
              const sec = ing.section || defaultSection;
              if (!grouped.has(sec)) grouped.set(sec, []);
              grouped.get(sec)!.push(ing);
          });
          grouped.forEach((ings, sec) => {
              ingBlocks.push({ id: uuidv4(), name: sec === defaultSection ? '' : sec, ingredients: ings });
          });
      }
      if (initialData.components && initialData.components.length > 0) {
          initialData.components.forEach(comp => {
              ingBlocks.push({ id: uuidv4(), name: comp.label, ingredients: comp.ingredients.map(i => ({...i, id: i.id || uuidv4() })) });
          });
      }
      if (ingBlocks.length === 0) ingBlocks.push({ id: uuidv4(), name: '', ingredients: [{ id: uuidv4(), amount: '', unit: '', item: '' }] });
      setIngredientBlocks(ingBlocks);

      // --- Load Instructions into Blocks ---
      const instBlocks: InstructionBlock[] = [];
      const mainSteps = initialData.instructions || [];
      if (mainSteps.length > 0) {
           const grouped = new Map<string, Instruction[]>();
           const defaultSection = 'Main Instructions';
           mainSteps.forEach(inst => {
               const val = inst as unknown as Instruction | string;
               const normalizedInst: Instruction = typeof val === 'string' ? { id: uuidv4(), text: val } : val;
               const sec = normalizedInst.section || defaultSection;
               if (!grouped.has(sec)) grouped.set(sec, []);
               grouped.get(sec)!.push(normalizedInst);
           });
           grouped.forEach((steps, sec) => {
               instBlocks.push({ id: uuidv4(), name: sec === defaultSection ? '' : sec, steps });
           });
      }
      if (initialData.components && initialData.components.length > 0) {
          initialData.components.forEach(comp => {
              const steps = comp.instructions.map(i => {
                  const val = i as unknown as Instruction | string;
                  return typeof val === 'string' ? { id: uuidv4(), text: val } : val;
              });
              instBlocks.push({ id: uuidv4(), name: comp.label, steps: steps as Instruction[] });
          });
      }
      if (instBlocks.length === 0) instBlocks.push({ id: uuidv4(), name: '', steps: [{ id: uuidv4(), text: '' }] });
      setInstructionBlocks(instBlocks);

    } else {
        setIngredientBlocks([{ id: uuidv4(), name: '', ingredients: [{ id: uuidv4(), amount: '', unit: '', item: '' }] }]);
        setInstructionBlocks([{ id: uuidv4(), name: '', steps: [{ id: uuidv4(), text: '' }] }]);
    }
  }, [initialData]);

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

    const recipe: Recipe = {
      ...formData as Recipe,
      prepTime: parseNum(formData.prepTime),
      cookTime: parseNum(formData.cookTime),
      servings: parseNum(formData.servings) || 1, 
      nutrition: {
          calories: parseOptionalNum(formData.nutrition?.calories),
          protein: parseOptionalNum(formData.nutrition?.protein),
          carbs: parseOptionalNum(formData.nutrition?.carbs),
          fat: parseOptionalNum(formData.nutrition?.fat),
      },
      id: initialData?.id || uuidv4(),
      tags: rawTags.split(',').map(t => t.trim()).filter(Boolean),
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
  const handleNestedNumberChange = (parent: keyof Recipe, field: string, valueStr: string) => {
      if (valueStr === '') { updateNested(parent, field, '' as any); return; }
      const num = parseFloat(valueStr);
      if (!isNaN(num)) updateNested(parent, field, num);
  }
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

  // ... (Keep existing Block Logic functions: addIngredientBlock, etc. - assume they are present or I can copy them if needed. To save space I will include them compactly)
  // Re-implementing block logic for completeness in response
  const addIngredientBlock = () => setIngredientBlocks(prev => [...prev, { id: uuidv4(), name: 'New Group', ingredients: [{ id: uuidv4(), amount: '', unit: '', item: '' }] }]);
  const removeIngredientBlock = (blockId: string) => setIngredientBlocks(prev => prev.filter(b => b.id !== blockId));
  const updateIngredientBlockName = (blockId: string, name: string) => setIngredientBlocks(prev => prev.map(b => b.id === blockId ? { ...b, name } : b));
  const addIngredientToBlock = (blockId: string) => setIngredientBlocks(prev => prev.map(b => b.id === blockId ? { ...b, ingredients: [...b.ingredients, { id: uuidv4(), amount: '', unit: '', item: '' }] } : b));
  const updateIngredientInBlock = (blockId: string, ingId: string, field: keyof FormIngredient, value: any) => setIngredientBlocks(prev => prev.map(b => b.id !== blockId ? b : { ...b, ingredients: b.ingredients.map(i => i.id === ingId ? { ...i, [field]: value } : i) }));
  const removeIngredientFromBlock = (blockId: string, ingId: string) => setIngredientBlocks(prev => prev.map(b => b.id !== blockId ? b : { ...b, ingredients: b.ingredients.filter(i => i.id !== ingId) }));
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
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
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
             <div className="grid grid-cols-3 gap-4">
               <div><label className="label">Prep (min)</label><input type="number" value={getNumValue(formData.prepTime)} onChange={e => handleNumberChange('prepTime', e.target.value)} className="input" placeholder="0"/></div>
               <div><label className="label">Cook (min)</label><input type="number" value={getNumValue(formData.cookTime)} onChange={e => handleNumberChange('cookTime', e.target.value)} className="input" placeholder="0"/></div>
               <div><label className="label">Servings</label><input type="number" value={getNumValue(formData.servings)} onChange={e => handleNumberChange('servings', e.target.value)} className="input" placeholder="1"/></div>
             </div>
             <div><label className="label">Tags</label><input type="text" value={rawTags} onChange={e => setRawTags(e.target.value)} className="input" placeholder="Healthy, Quick..." /></div>
             
             {/* Media Inputs (R2 Integration) */}
             <div className="pt-2">
                 <label className="label">Image</label>
                 <div className="flex gap-2">
                     <input type="text" value={formData.image || ''} onChange={e => handleChange('image', e.target.value)} className="input" placeholder="https://..." disabled={isUploading} />
                     <label className={`p-2 border rounded cursor-pointer transition-colors ${isUploading ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                         <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={isUploading} />
                         {isUploading ? <Loader className="animate-spin text-primary" size={20} /> : <Upload size={20} />}
                     </label>
                 </div>
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
                             <div key={ing.id} className="grid grid-cols-12 gap-2 items-start">
                                 <div className="col-span-6"><input type="text" placeholder="Item" value={ing.item || ''} onChange={e => updateIngredientInBlock(block.id, ing.id, 'item', e.target.value)} className="input p-2 text-sm w-full" /></div>
                                 <div className="col-span-2"><input type="text" placeholder="Amt" value={ing.amount} onChange={e => updateIngredientInBlock(block.id, ing.id, 'amount', e.target.value)} className="input p-2 text-sm w-full"/></div>
                                 <div className="col-span-3"><input type="text" placeholder="Unit" value={ing.unit || ''} onChange={e => updateIngredientInBlock(block.id, ing.id, 'unit', e.target.value)} className="input p-2 text-sm w-full" /></div>
                                 <div className="col-span-1"><button type="button" onClick={() => removeIngredientFromBlock(block.id, ing.id)} className="text-red-400"><Trash2 size={18} /></button></div>
                             </div>
                         ))}
                         <button type="button" onClick={() => addIngredientToBlock(block.id)} className="text-sm font-bold text-primary flex items-center gap-1 mt-2"><Plus size={16} /> Add Ingredient</button>
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
                                 <div className="size-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold mt-2">{idx + 1}</div>
                                 <div className="flex-1 space-y-2">
                                     <div className="flex gap-2">
                                        <input type="text" value={step.title || ''} onChange={e => updateStepInBlock(block.id, step.id, 'title', e.target.value)} placeholder="Title (Opt)" className="input text-sm py-1 font-bold" />
                                        <button type="button" onClick={() => toggleStepTimer(block.id, step.id)} className={`p-1.5 rounded ${step.timer !== undefined ? 'bg-primary text-white' : 'text-muted'}`}><Clock size={16}/></button>
                                     </div>
                                     <textarea value={step.text || ''} onChange={e => updateStepInBlock(block.id, step.id, 'text', e.target.value)} placeholder="Step description..." rows={2} className="input text-sm" />
                                     {step.timer !== undefined && <input type="number" value={step.timer} onChange={e => updateStepInBlock(block.id, step.id, 'timer', parseInt(e.target.value))} className="input text-xs w-20" />}
                                 </div>
                                 <button type="button" onClick={() => removeStepFromBlock(block.id, step.id)} className="text-red-400 mt-2"><Trash2 size={16}/></button>
                             </div>
                         ))}
                         <button type="button" onClick={() => addStepToBlock(block.id)} className="text-sm font-bold text-primary flex items-center gap-1"><Plus size={16} /> Add Step</button>
                     </div>
                 </div>
             ))}
             <button type="button" onClick={addInstructionBlock} className="w-full py-2 border-2 border-dashed border-primary/30 text-primary font-bold rounded-lg hover:bg-primary/5">+ Add Instruction Section</button>
          </section>

        </div>
        <div className="p-4 border-t border-border-light dark:border-border-dark flex justify-between gap-3 bg-card-light dark:bg-card-dark rounded-b-2xl">
          {initialData?.id && onDelete ? <button type="button" onClick={() => onDelete(initialData.id)} className="px-4 py-2 text-red-500"><Trash2 size={18} /></button> : <div></div>}
          <div className="flex gap-3"><button type="button" onClick={onClose} className="px-5 py-2 rounded-lg">Cancel</button><button type="submit" disabled={isUploading} className="px-5 py-2 rounded-lg bg-primary text-white font-bold flex items-center gap-2 disabled:opacity-50"><Save size={18} /> Save</button></div>
        </div>
      </form>
      <style>{`.label { display: block; font-size: 0.875rem; font-weight: 500; color: #4e9767; margin-bottom: 0.25rem; } .dark .label { color: #8bc49e; } .input { width: 100%; padding: 0.5rem 0.75rem; border-radius: 0.5rem; border: 1px solid #e7f3eb; background-color: #f8fcf9; color: #0e1b12; outline: none; } .dark .input { border-color: #2a4030; background-color: #1a2c20; color: white; }`}</style>
    </div>
  );
};
export default RecipeForm;
