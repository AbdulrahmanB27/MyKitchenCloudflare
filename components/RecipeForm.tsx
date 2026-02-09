
import React, { useState, useEffect } from 'react';
import { Recipe, Instruction, Ingredient } from '../types';
import { X, Plus, Save, Trash2, ArrowUp, ArrowDown, Clock } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface RecipeFormProps {
  initialData?: Recipe | null;
  onSave: (recipe: Recipe) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

// Helper types for form management
interface IngredientBlock {
    id: string;
    name: string;
    ingredients: Ingredient[];
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
    tips: [],
    mistakes: [],
    substitutions: [],
    storageNotes: '',
    source: { name: '', url: '', author: '' },
    nutrition: { calories: undefined, protein: undefined, carbs: undefined, fat: undefined },
    favorite: false,
    archived: false,
    reviews: []
  });

  // Text Area State for Array fields
  const [rawTags, setRawTags] = useState('');
  const [rawTips, setRawTips] = useState('');
  const [rawMistakes, setRawMistakes] = useState('');
  const [rawSubs, setRawSubs] = useState('');

  // Structured State (Blocks)
  const [ingredientBlocks, setIngredientBlocks] = useState<IngredientBlock[]>([]);
  const [instructionBlocks, setInstructionBlocks] = useState<InstructionBlock[]>([]);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
      setRawTags(initialData.tags.join(', '));
      setRawTips(initialData.tips?.join('\n') || '');
      setRawMistakes(initialData.mistakes?.join('\n') || '');
      setRawSubs(initialData.substitutions?.join('\n') || '');
      
      // --- Load Ingredients into Blocks ---
      const ingBlocks: IngredientBlock[] = [];
      
      // 1. Main Ingredients (legacy or new flat structure)
      const mainIngs = initialData.ingredients || [];
      if (mainIngs.length > 0) {
          // Group by section property
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
      } else {
          // Start with one empty block if nothing exists
           ingBlocks.push({ id: uuidv4(), name: '', ingredients: [{ id: uuidv4(), amount: 0, unit: '', item: '' }] });
      }

      // 2. Legacy Components (Merge into blocks)
      if (initialData.components) {
          initialData.components.forEach(comp => {
              ingBlocks.push({
                  id: uuidv4(),
                  name: comp.label,
                  ingredients: comp.ingredients.map(i => ({...i, id: i.id || uuidv4() }))
              });
          });
      }
      setIngredientBlocks(ingBlocks);


      // --- Load Instructions into Blocks ---
      const instBlocks: InstructionBlock[] = [];

      // 1. Main Instructions
      const mainSteps = initialData.instructions || [];
      if (mainSteps.length > 0) {
           const grouped = new Map<string, Instruction[]>();
           const defaultSection = 'Main Instructions';
           
           mainSteps.forEach(inst => {
               const normalizedInst = typeof inst === 'string' ? { id: uuidv4(), text: inst } : inst;
               const sec = normalizedInst.section || defaultSection;
               if (!grouped.has(sec)) grouped.set(sec, []);
               grouped.get(sec)!.push(normalizedInst);
           });

           grouped.forEach((steps, sec) => {
               instBlocks.push({ id: uuidv4(), name: sec === defaultSection ? '' : sec, steps });
           });
      } else {
          instBlocks.push({ id: uuidv4(), name: '', steps: [{ id: uuidv4(), text: '' }] });
      }

      // 2. Legacy Components (Merge instructions)
      if (initialData.components) {
          initialData.components.forEach(comp => {
              const steps = comp.instructions.map(i => typeof i === 'string' ? { id: uuidv4(), text: i } : i);
              instBlocks.push({
                  id: uuidv4(),
                  name: comp.label,
                  steps: steps
              });
          });
      }
      setInstructionBlocks(instBlocks);

    } else {
        // New Recipe Defaults
        setIngredientBlocks([{ id: uuidv4(), name: '', ingredients: [{ id: uuidv4(), amount: 0, unit: '', item: '' }] }]);
        setInstructionBlocks([{ id: uuidv4(), name: '', steps: [{ id: uuidv4(), text: '' }] }]);
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Flatten Blocks back to single arrays with 'section' property
    const flatIngredients: Ingredient[] = [];
    ingredientBlocks.forEach(block => {
        block.ingredients.forEach(ing => {
            if (ing.item.trim()) {
                flatIngredients.push({ ...ing, section: block.name || undefined });
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
      // Ensure numeric fields are actually numbers
      prepTime: parseNum(formData.prepTime),
      cookTime: parseNum(formData.cookTime),
      servings: parseNum(formData.servings) || 1, // Default to 1 if 0
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
      components: [], // Deprecated, merged into main lists
      tips: rawTips.split('\n').filter(Boolean),
      mistakes: rawMistakes.split('\n').filter(Boolean),
      substitutions: rawSubs.split('\n').filter(Boolean),
      createdAt: initialData?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    onSave(recipe);
  };

  const handleChange = (field: keyof Recipe, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Helper for numeric inputs to allow "empty" state while typing
  const handleNumberChange = (field: keyof Recipe, valueStr: string) => {
    if (valueStr === '') {
        handleChange(field, '' as any);
        return;
    }
    const num = parseFloat(valueStr);
    if (!isNaN(num)) {
        handleChange(field, num);
    }
  };

  const updateNested = (parent: keyof Recipe, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [parent]: { ...prev[parent] as any, [field]: value }
    }));
  };

  const handleNestedNumberChange = (parent: keyof Recipe, field: string, valueStr: string) => {
      if (valueStr === '') {
          updateNested(parent, field, '' as any);
          return;
      }
      const num = parseFloat(valueStr);
      if (!isNaN(num)) updateNested(parent, field, num);
  }

  // Value prop helper to properly render 0 or empty string
  const getNumValue = (val: any) => (val !== undefined && val !== null) ? val : '';


  // --- Ingredient Block Logic ---
  const addIngredientBlock = () => {
      setIngredientBlocks(prev => [...prev, { id: uuidv4(), name: 'New Group', ingredients: [{ id: uuidv4(), amount: 0, unit: '', item: '' }] }]);
  };
  const removeIngredientBlock = (blockId: string) => {
      setIngredientBlocks(prev => prev.filter(b => b.id !== blockId));
  };
  const updateIngredientBlockName = (blockId: string, name: string) => {
      setIngredientBlocks(prev => prev.map(b => b.id === blockId ? { ...b, name } : b));
  };
  const addIngredientToBlock = (blockId: string) => {
      setIngredientBlocks(prev => prev.map(b => b.id === blockId ? { ...b, ingredients: [...b.ingredients, { id: uuidv4(), amount: 0, unit: '', item: '' }] } : b));
  };
  const updateIngredientInBlock = (blockId: string, ingId: string, field: keyof Ingredient, value: any) => {
      setIngredientBlocks(prev => prev.map(b => {
          if (b.id !== blockId) return b;
          return {
              ...b,
              ingredients: b.ingredients.map(i => i.id === ingId ? { ...i, [field]: value } : i)
          };
      }));
  };
  
  const handleIngredientAmountChange = (blockId: string, ingId: string, valueStr: string) => {
      if (valueStr === '') {
          updateIngredientInBlock(blockId, ingId, 'amount', '' as any);
      } else {
          const num = parseFloat(valueStr);
          if (!isNaN(num)) updateIngredientInBlock(blockId, ingId, 'amount', num);
      }
  };

  const removeIngredientFromBlock = (blockId: string, ingId: string) => {
      setIngredientBlocks(prev => prev.map(b => {
          if (b.id !== blockId) return b;
          return { ...b, ingredients: b.ingredients.filter(i => i.id !== ingId) };
      }));
  };

  // --- Instruction Block Logic ---
  const addInstructionBlock = () => {
      setInstructionBlocks(prev => [...prev, { id: uuidv4(), name: 'New Section', steps: [{ id: uuidv4(), text: '' }] }]);
  };
  const removeInstructionBlock = (blockId: string) => {
      setInstructionBlocks(prev => prev.filter(b => b.id !== blockId));
  };
  const updateInstructionBlockName = (blockId: string, name: string) => {
      setInstructionBlocks(prev => prev.map(b => b.id === blockId ? { ...b, name } : b));
  };
  const addStepToBlock = (blockId: string) => {
      setInstructionBlocks(prev => prev.map(b => b.id === blockId ? { ...b, steps: [...b.steps, { id: uuidv4(), text: '' }] } : b));
  };
  const updateStepInBlock = (blockId: string, stepId: string, field: keyof Instruction, value: any) => {
      setInstructionBlocks(prev => prev.map(b => {
          if (b.id !== blockId) return b;
          return {
              ...b,
              steps: b.steps.map(s => s.id === stepId ? { ...s, [field]: value } : s)
          };
      }));
  };
  const removeStepFromBlock = (blockId: string, stepId: string) => {
      setInstructionBlocks(prev => prev.map(b => {
          if (b.id !== blockId) return b;
          return { ...b, steps: b.steps.filter(s => s.id !== stepId) };
      }));
  };
  const toggleStepTimer = (blockId: string, stepId: string) => {
      setInstructionBlocks(prev => prev.map(b => {
          if (b.id !== blockId) return b;
          return {
              ...b,
              steps: b.steps.map(s => {
                  if (s.id !== stepId) return s;
                  return { ...s, timer: s.timer !== undefined ? undefined : 5 };
              })
          };
      }));
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-background-dark/80 backdrop-blur-sm" onClick={onClose}></div>
      <form onSubmit={handleSubmit} className="relative w-full max-w-4xl bg-card-light dark:bg-card-dark rounded-2xl shadow-xl flex flex-col max-h-[90vh] border border-border-light dark:border-border-dark">
        
        <div className="flex items-center justify-between p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-xl font-bold text-text-light dark:text-white">
            {initialData ? 'Edit Recipe' : 'Add New Recipe'}
          </h2>
          <button type="button" onClick={onClose} className="p-2 hover:bg-background-light dark:hover:bg-border-dark rounded-full transition-colors">
            <X size={20} className="text-text-light/50" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Section 1: Basic Info */}
          <section className="space-y-4">
             <h3 className="text-lg font-bold text-primary border-b border-border-light dark:border-border-dark pb-2">Basics</h3>
             <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div>
                    <label className="label">Name *</label>
                    <input required type="text" value={formData.name} onChange={e => handleChange('name', e.target.value)} className="input" placeholder="Recipe Title" />
                  </div>
                  <div>
                    <label className="label">Course</label>
                    <select 
                        value={formData.category} 
                        onChange={e => handleChange('category', e.target.value)} 
                        className="input"
                    >
                        <option value="Entrees">Entrees</option>
                        <option value="Sides">Sides</option>
                        <option value="Desserts">Desserts</option>
                    </select>
                  </div>
                </div>
                <div>
                   <label className="label">Description</label>
                   <textarea value={formData.description} onChange={e => handleChange('description', e.target.value)} rows={4} className="input resize-none" placeholder="Short description..." />
                </div>
             </div>
             
             <div className="grid grid-cols-3 gap-4">
               <div>
                   <label className="label">Prep (min)</label>
                   <input 
                    type="number" 
                    value={getNumValue(formData.prepTime)} 
                    onChange={e => handleNumberChange('prepTime', e.target.value)} 
                    className="input"
                    placeholder="0"
                   />
               </div>
               <div>
                   <label className="label">Cook (min)</label>
                   <input 
                    type="number" 
                    value={getNumValue(formData.cookTime)} 
                    onChange={e => handleNumberChange('cookTime', e.target.value)}
                    className="input"
                    placeholder="0"
                   />
               </div>
               <div>
                   <label className="label">Servings</label>
                   <input 
                    type="number" 
                    value={getNumValue(formData.servings)} 
                    onChange={e => handleNumberChange('servings', e.target.value)} 
                    onBlur={() => { if(!formData.servings) handleChange('servings', 1); }}
                    className={`input ${!formData.servings ? 'border-red-400 bg-red-50 dark:bg-red-900/10 focus:border-red-500' : ''}`}
                    placeholder="1"
                   />
               </div>
             </div>
             
             <div>
                <label className="label">Tags (comma separated)</label>
                <input type="text" value={rawTags} onChange={e => setRawTags(e.target.value)} className="input" placeholder="Healthy, Quick, Chicken" />
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Image URL</label>
                    <input type="url" value={formData.image} onChange={e => handleChange('image', e.target.value)} className="input" />
                  </div>
                  <div>
                    <label className="label">Video URL</label>
                    <input type="url" value={formData.video?.url} onChange={e => updateNested('video', 'url', e.target.value)} className="input" placeholder="YouTube/Vimeo" />
                  </div>
             </div>
             
             {/* Nutrition */}
             <div className="mt-4 pt-4 border-t border-border-light dark:border-border-dark">
                <h4 className="label text-text-muted mb-2">Nutrition (Optional)</h4>
                <div className="grid grid-cols-4 gap-2">
                    <input type="number" placeholder="Cals" value={getNumValue(formData.nutrition?.calories)} onChange={e => handleNestedNumberChange('nutrition', 'calories', e.target.value)} className="input text-xs" />
                    <input type="number" placeholder="Prot" value={getNumValue(formData.nutrition?.protein)} onChange={e => handleNestedNumberChange('nutrition', 'protein', e.target.value)} className="input text-xs" />
                    <input type="number" placeholder="Carb" value={getNumValue(formData.nutrition?.carbs)} onChange={e => handleNestedNumberChange('nutrition', 'carbs', e.target.value)} className="input text-xs" />
                    <input type="number" placeholder="Fat" value={getNumValue(formData.nutrition?.fat)} onChange={e => handleNestedNumberChange('nutrition', 'fat', e.target.value)} className="input text-xs" />
                </div>
             </div>
          </section>

          {/* Section 2: Ingredients */}
          <section className="space-y-4">
             <div className="flex items-center justify-between border-b border-border-light dark:border-border-dark pb-2">
                 <h3 className="text-lg font-bold text-primary">Ingredients</h3>
             </div>
             
             {ingredientBlocks.map((block, bIdx) => (
                 <div key={block.id} className="relative bg-background-light dark:bg-surface-dark/50 rounded-xl p-4 border border-border-light dark:border-border-dark">
                     <div className="flex items-center gap-2 mb-3">
                         {ingredientBlocks.length > 1 && (
                            <button type="button" onClick={() => removeIngredientBlock(block.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16}/></button>
                         )}
                         <input 
                            type="text" 
                            value={block.name} 
                            onChange={e => updateIngredientBlockName(block.id, e.target.value)} 
                            placeholder={bIdx === 0 ? "Main Ingredients (Optional Header)" : "Section Name (e.g. Sauce)"}
                            className="bg-transparent font-bold text-primary placeholder:text-primary/40 focus:outline-none w-full"
                         />
                     </div>

                     <div className="space-y-2">
                         {block.ingredients.map((ing) => (
                             <div key={ing.id} className="grid grid-cols-12 gap-2 items-start">
                                 <div className="col-span-6 flex gap-2">
                                     <div className="flex-1 min-w-0">
                                         <input type="text" placeholder="Item" value={ing.item || ''} onChange={e => updateIngredientInBlock(block.id, ing.id, 'item', e.target.value)} className="input p-2 text-sm w-full" />
                                     </div>
                                     <div className="w-1/3 min-w-0">
                                         <input type="text" placeholder="Notes" value={ing.notes || ''} onChange={e => updateIngredientInBlock(block.id, ing.id, 'notes', e.target.value)} className="input p-2 text-sm w-full" />
                                     </div>
                                 </div>
                                 <div className="col-span-2 min-w-0">
                                     <input 
                                        type="number" 
                                        step="any" 
                                        placeholder="1" 
                                        value={getNumValue(ing.amount)} 
                                        onChange={e => handleIngredientAmountChange(block.id, ing.id, e.target.value)}
                                        className={`input p-2 text-sm w-full ${!ing.amount && ing.amount !== 0 ? 'border-red-300' : ''}`}
                                     />
                                 </div>
                                 <div className="col-span-3 min-w-0">
                                     <input type="text" placeholder="Unit" value={ing.unit || ''} onChange={e => updateIngredientInBlock(block.id, ing.id, 'unit', e.target.value)} className="input p-2 text-sm w-full" />
                                 </div>
                                 <div className="col-span-1 flex justify-center pt-2">
                                     <button type="button" onClick={() => removeIngredientFromBlock(block.id, ing.id)} className="text-red-400 hover:text-red-600"><Trash2 size={18} /></button>
                                 </div>
                             </div>
                         ))}
                         <button type="button" onClick={() => addIngredientToBlock(block.id)} className="text-sm font-bold text-primary flex items-center gap-1 hover:text-green-600 mt-2">
                             <Plus size={16} /> Add Ingredient
                         </button>
                     </div>
                 </div>
             ))}

             <button type="button" onClick={addIngredientBlock} className="w-full py-2 border-2 border-dashed border-primary/30 text-primary font-bold rounded-lg hover:bg-primary/5 transition-colors">
                 + Add Ingredient Group
             </button>
          </section>

          {/* Section 3: Instructions */}
          <section className="space-y-4">
             <div className="flex items-center justify-between border-b border-border-light dark:border-border-dark pb-2">
                 <h3 className="text-lg font-bold text-primary">Instructions</h3>
             </div>
             
             {instructionBlocks.map((block, bIdx) => (
                 <div key={block.id} className="relative bg-background-light dark:bg-surface-dark/50 rounded-xl p-4 border border-border-light dark:border-border-dark">
                     
                     <div className="flex items-center gap-2 mb-3">
                         {instructionBlocks.length > 1 && (
                            <button type="button" onClick={() => removeInstructionBlock(block.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16}/></button>
                         )}
                         <input 
                            type="text" 
                            value={block.name} 
                            onChange={e => updateInstructionBlockName(block.id, e.target.value)} 
                            placeholder={bIdx === 0 ? "Main Instructions (Optional Header)" : "Section Name (e.g. For the Sauce)"}
                            className="bg-transparent font-bold text-primary placeholder:text-primary/40 focus:outline-none w-full"
                         />
                     </div>

                     <div className="space-y-3">
                         {block.steps.map((step, idx) => (
                             <div key={step.id} className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg p-3 flex gap-3">
                                 <div className="flex flex-col gap-1 pt-2">
                                     <div className="size-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">{idx + 1}</div>
                                 </div>
                                 <div className="flex-1 space-y-2">
                                     <div className="flex gap-2 items-center">
                                         <input 
                                            type="text" 
                                            value={step.title || ''} 
                                            onChange={e => updateStepInBlock(block.id, step.id, 'title', e.target.value)} 
                                            placeholder="Step Title (Optional)" 
                                            className="input text-sm py-1 font-bold" 
                                         />
                                         
                                         <button 
                                            type="button"
                                            onClick={() => toggleStepTimer(block.id, step.id)}
                                            className={`p-1.5 rounded-md transition-colors ${step.timer !== undefined ? 'bg-primary text-white' : 'text-text-muted hover:bg-gray-100 dark:hover:bg-white/5'}`}
                                            title="Toggle Timer"
                                         >
                                             <Clock size={16} />
                                         </button>

                                         {step.timer !== undefined && (
                                            <div className="flex items-center gap-1 bg-surface-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-md px-2 w-20 animate-in fade-in zoom-in duration-200">
                                                <input 
                                                    type="number" 
                                                    value={getNumValue(step.timer)} 
                                                    onChange={e => updateStepInBlock(block.id, step.id, 'timer', parseInt(e.target.value))} 
                                                    className="w-full bg-transparent border-none text-sm p-0 focus:ring-0 text-center" 
                                                />
                                                <span className="text-xs text-text-muted">m</span>
                                            </div>
                                         )}
                                     </div>
                                     <textarea 
                                        value={step.text || ''} 
                                        onChange={e => updateStepInBlock(block.id, step.id, 'text', e.target.value)} 
                                        placeholder="Describe the step..." 
                                        rows={2} 
                                        className="input text-sm resize-y" 
                                     />
                                 </div>
                                 <div className="flex flex-col justify-center">
                                     <button type="button" onClick={() => removeStepFromBlock(block.id, step.id)} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={16}/></button>
                                 </div>
                             </div>
                         ))}
                         <button type="button" onClick={() => addStepToBlock(block.id)} className="text-sm font-bold text-primary flex items-center gap-1 hover:text-green-600">
                             <Plus size={16} /> Add Step
                         </button>
                     </div>
                 </div>
             ))}

             <button type="button" onClick={addInstructionBlock} className="w-full py-2 border-2 border-dashed border-primary/30 text-primary font-bold rounded-lg hover:bg-primary/5 transition-colors">
                 + Add Instruction Section
             </button>
          </section>

          {/* Section 4: Meta */}
          <section className="space-y-4">
             <h3 className="text-lg font-bold text-primary border-b border-border-light dark:border-border-dark pb-2">Meta & Source</h3>
             <div className="grid md:grid-cols-2 gap-4">
                 <div className="grid grid-cols-2 gap-2">
                     <label className="flex items-center gap-2 cursor-pointer p-3 border border-border-light dark:border-border-dark rounded-lg">
                        <input type="checkbox" checked={formData.favorite || false} onChange={e => handleChange('favorite', e.target.checked)} />
                        <span className="text-sm font-bold text-text-light dark:text-white">Favorite</span>
                     </label>
                     <label className="flex items-center gap-2 cursor-pointer p-3 border border-border-light dark:border-border-dark rounded-lg">
                        <input type="checkbox" checked={formData.archived || false} onChange={e => handleChange('archived', e.target.checked)} />
                        <span className="text-sm font-bold text-text-light dark:text-white">Archived</span>
                     </label>
                 </div>
                 <div className="grid grid-cols-3 gap-2">
                     <input type="text" placeholder="Source Name" value={formData.source?.name || ''} onChange={e => updateNested('source', 'name', e.target.value)} className="input text-sm" />
                     <input type="text" placeholder="URL" value={formData.source?.url || ''} onChange={e => updateNested('source', 'url', e.target.value)} className="input text-sm" />
                     <input type="text" placeholder="Author" value={formData.source?.author || ''} onChange={e => updateNested('source', 'author', e.target.value)} className="input text-sm" />
                 </div>
             </div>
          </section>

        </div>

        <div className="p-4 border-t border-border-light dark:border-border-dark flex justify-between gap-3 bg-card-light dark:bg-card-dark rounded-b-2xl">
          {initialData?.id && onDelete ? (
              <button 
                type="button" 
                onClick={() => onDelete(initialData.id)} 
                className="px-4 py-2.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium transition-colors flex items-center gap-2"
              >
                <Trash2 size={18} />
                <span className="hidden sm:inline">Delete Recipe</span>
              </button>
          ) : <div></div>}
          
          <div className="flex gap-3">
              <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-lg text-text-light dark:text-text-dark font-medium hover:bg-background-light dark:hover:bg-border-dark transition-colors">
                Cancel
              </button>
              <button type="submit" className="px-5 py-2.5 rounded-lg bg-primary hover:bg-green-600 text-white font-bold shadow-md shadow-primary/30 transition-all flex items-center gap-2">
                <Save size={18} />
                Save Recipe
              </button>
          </div>
        </div>
      </form>
      <style>{`
        .label { display: block; font-size: 0.875rem; font-weight: 500; color: #4e9767; margin-bottom: 0.25rem; }
        .dark .label { color: #8bc49e; }
        .input { width: 100%; padding: 0.5rem 0.75rem; border-radius: 0.5rem; border: 1px solid #e7f3eb; background-color: #f8fcf9; color: #0e1b12; outline: none; transition: all; }
        .input:focus { border-color: #17cf54; ring: 2px solid rgba(23, 207, 84, 0.2); }
        .dark .input { border-color: #2a4030; background-color: #1a2c20; color: white; }
      `}</style>
    </div>
  );
};

export default RecipeForm;
