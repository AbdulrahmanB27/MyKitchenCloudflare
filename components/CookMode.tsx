import React, { useState, useEffect, useRef } from 'react';
import { Recipe, Instruction, Ingredient } from '../types';
import { Lightbulb, Edit, Save } from 'lucide-react';

interface CookModeProps {
  recipe: Recipe;
  onClose: () => void;
}

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

const CookMode: React.FC<CookModeProps> = ({ recipe, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  
  // Sidebar Tabs State
  const [activeTab, setActiveTab] = useState<'steps' | 'ingredients' | 'swaps' | 'tips'>('ingredients');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set());
  
  // Stopwatch & Reminder State
  const [stopwatchTime, setStopwatchTime] = useState(0); // Counts UP from 0
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [reminderThreshold, setReminderThreshold] = useState<number | null>(null); // Target time in seconds
  const [hasAlerted, setHasAlerted] = useState(false);
  
  // Manual User Timers (Separate from main step timer)
  const [manualTimers, setManualTimers] = useState<{id: number, label: string, timeLeft: number, running: boolean}[]>([]);

  // User Notes/Mistakes (Stored locally)
  const [userNotes, setUserNotes] = useState<Record<string, string>>({});
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Helper to extract text from Instruction or String
  const getStepText = (inst: string | Instruction) => typeof inst === 'string' ? inst : inst.text;
  const getStepTitle = (inst: string | Instruction) => typeof inst === 'string' ? null : inst.title;
  const getStepTimer = (inst: string | Instruction) => typeof inst === 'string' ? null : inst.timer;
  const getStepTip = (inst: string | Instruction) => typeof inst === 'string' ? null : inst.tip;
  const getStepOptional = (inst: string | Instruction) => typeof inst === 'string' ? false : inst.optional;
  const getStepId = (inst: string | Instruction, index: number) => typeof inst === 'string' ? `step-${index}` : inst.id;

  // Combine main and component ingredients for flat list with headers
  const allIngredients = React.useMemo(() => {
      const formatIng = (ing: Ingredient | string) => {
          if (typeof ing === 'string') return ing;
          return `${ing.amount || ''} ${ing.unit || ''} ${ing.item} ${ing.notes ? `(${ing.notes})` : ''}`.trim();
      };

      const list: { txt: string, id: string, group: string, sub?: string }[] = [];

      // 1. Main Ingredients (optionally sectioned)
      recipe.ingredients.forEach((ing, i) => {
          list.push({ txt: formatIng(ing), id: `main-${i}`, group: ing.section || 'Main', sub: ing.substitution });
      });

      // 2. Legacy Components
      recipe.components?.forEach((comp, ci) => {
          comp.ingredients.forEach((ing, i) => {
              list.push({ txt: formatIng(ing), id: `comp-${ci}-${i}`, group: comp.label, sub: ing.substitution });
          });
      });
      return list;
  }, [recipe]);

  // Combine instructions
  const allSteps = React.useMemo(() => {
      const steps: { 
          id: string,
          txt: string, 
          title?: string | null, 
          timer?: number | null, 
          tip?: string | null, 
          optional?: boolean, 
          group: string 
      }[] = [];

      // 1. Main Instructions (optionally sectioned)
      recipe.instructions.forEach((inst, i) => {
          steps.push({ 
              id: getStepId(inst, i),
              txt: getStepText(inst), 
              title: getStepTitle(inst),
              timer: getStepTimer(inst),
              tip: getStepTip(inst),
              optional: getStepOptional(inst),
              group: (typeof inst !== 'string' && inst.section) ? inst.section : 'Main' 
          });
      });
      
      // 2. Legacy Components
      recipe.components?.forEach((comp, ci) => {
          comp.instructions.forEach((inst, i) => {
              const baseId = `comp-${ci}-${i}`; // Fallback if no ID on instruction object
              steps.push({ 
                  id: typeof inst === 'object' ? inst.id : baseId,
                  txt: getStepText(inst), 
                  title: getStepTitle(inst),
                  timer: getStepTimer(inst),
                  tip: getStepTip(inst),
                  optional: getStepOptional(inst),
                  group: comp.label 
              });
          });
      });
      return steps;
  }, [recipe]);

  // --- Effects ---

  useEffect(() => {
    // Try Wake Lock
    if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then(setWakeLock).catch(console.warn);
    }
    // Load user notes
    const savedNotes = localStorage.getItem(`user_mistakes_${recipe.id}`);
    if (savedNotes) {
        setUserNotes(JSON.parse(savedNotes));
    }

    return () => { if(wakeLock) wakeLock.release(); };
  }, [recipe.id]);

  // Parse Step Timer to Suggest Reminder
  useEffect(() => {
    if (currentStep >= allSteps.length) return; // End screen

    const step = allSteps[currentStep];
    const stepText = step?.txt || '';
    
    // Reset stopwatch on step change
    setStopwatchTime(0);
    setIsTimerRunning(false);
    setHasAlerted(false);
    
    let suggestedTime = 0;
    if (step.timer) {
        suggestedTime = step.timer * 60;
    } else {
        const match = stepText.match(/(\d+)\s*(?:minutes?|mins?|m)\b/i);
        if (match) {
            suggestedTime = parseInt(match[1], 10) * 60;
        }
    }
    
    // Set reminder automatically if time detected, but stopwatch starts at 0
    setReminderThreshold(suggestedTime > 0 ? suggestedTime : null);
    
  }, [currentStep, allSteps]);

  // Stopwatch Interval & Notification Check
  useEffect(() => {
    let interval: number;
    if (isTimerRunning) {
      interval = window.setInterval(() => {
        setStopwatchTime(prev => {
           const next = prev + 1;
           // Check reminder
           if (reminderThreshold && next >= reminderThreshold && !hasAlerted) {
               notifyUser();
               setHasAlerted(true);
           }
           return next;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, reminderThreshold, hasAlerted]);

  // Manual Timers Interval
  useEffect(() => {
      const interval = setInterval(() => {
          setManualTimers(prev => prev.map(t => {
              if (t.running && t.timeLeft > 0) return { ...t, timeLeft: t.timeLeft - 1 };
              if (t.running && t.timeLeft <= 0) return { ...t, running: false }; // Finished
              return t;
          }));
      }, 1000);
      return () => clearInterval(interval);
  }, []);

  // --- Handlers ---

  const saveNote = (stepId: string) => {
      const updated = { ...userNotes, [stepId]: noteDraft };
      if (!noteDraft.trim()) delete updated[stepId]; // Remove empty
      setUserNotes(updated);
      localStorage.setItem(`user_mistakes_${recipe.id}`, JSON.stringify(updated));
      setEditingNoteId(null);
  };

  const startEditingNote = (stepId: string) => {
      setNoteDraft(userNotes[stepId] || '');
      setEditingNoteId(stepId);
  };

  const notifyUser = () => {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.play().catch(e => console.log('Audio play failed', e));

      if (Notification.permission === 'granted') {
          new Notification('Timer Done!', { body: `Step ${currentStep + 1} reminder reached.` });
      } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(perm => {
              if (perm === 'granted') new Notification('Timer Done!', { body: `Step ${currentStep + 1} reminder reached.` });
          });
      }
  };

  const requestNotificationPermission = () => {
      if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission();
      }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const setCustomReminder = () => {
      const min = prompt("Set reminder for (minutes):", "10");
      if (min) {
          const seconds = parseFloat(min) * 60;
          setReminderThreshold(seconds);
          setHasAlerted(false); // Reset alert status
          requestNotificationPermission();
      }
  };
  
  const addReminderTime = (secondsToAdd: number) => {
      if (reminderThreshold) {
          setReminderThreshold(reminderThreshold + secondsToAdd);
          setHasAlerted(false);
      } else {
          setReminderThreshold(stopwatchTime + secondsToAdd);
          setHasAlerted(false);
      }
      requestNotificationPermission();
  };

  const removeTimer = (id: number) => {
      setManualTimers(prev => prev.filter(t => t.id !== id));
  };

  const toggleFullscreen = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(console.error);
      else if (document.exitFullscreen) document.exitFullscreen();
  };

  useEffect(() => {
      const h = () => setIsFullscreen(!!document.fullscreenElement);
      document.addEventListener('fullscreenchange', h);
      return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const toggleIngredient = (id: string) => {
    const next = new Set(checkedIngredients);
    if(next.has(id)) next.delete(id); else next.add(id);
    setCheckedIngredients(next);
  };

  // --- Render ---

  const isFinished = currentStep >= allSteps.length;
  const currentStepData = !isFinished ? allSteps[currentStep] : null;
  const progress = isFinished ? 100 : ((currentStep + 1) / allSteps.length) * 100;

  // Filter lists for sidebar
  const swapsList = allIngredients.filter(i => !!i.sub);
  const tipsList = allSteps.filter(s => !!s.tip).map(s => s.tip!);

  return (
    <div className="fixed inset-0 z-[60] bg-background-light dark:bg-[#112116] text-text-main dark:text-white font-display overflow-hidden flex flex-col">
      
      {/* Header */}
      <header className="flex-none flex items-center justify-between border-b border-border-light dark:border-border-dark px-4 py-3 bg-surface-light dark:bg-surface-dark z-10">
        <div className="flex items-center gap-3 overflow-hidden">
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10"><span className="material-symbols-outlined">close</span></button>
            <div>
                <h2 className="text-sm font-bold opacity-60 uppercase tracking-wider">{recipe.name}</h2>
                <div className="flex items-center gap-2 text-xs">
                    {isFinished ? (
                         <span className="font-bold text-primary">Complete</span>
                    ) : (
                        <>
                            <span className="font-bold">{currentStepData?.group}</span>
                            <span>•</span>
                            <span>Step {currentStep + 1} of {allSteps.length}</span>
                        </>
                    )}
                </div>
            </div>
        </div>
        <div className="flex items-center gap-2">
            <button onClick={toggleFullscreen} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10">
                <span className="material-symbols-outlined">{isFullscreen ? 'close_fullscreen' : 'fullscreen'}</span>
            </button>
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="lg:hidden p-2 bg-primary/10 text-primary rounded-lg">
                <span className="material-symbols-outlined">menu_open</span>
            </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        
        {/* Sidebar (Tabs) */}
        <aside className={`absolute lg:static inset-y-0 left-0 z-20 w-80 bg-surface-light dark:bg-surface-dark border-r border-border-light dark:border-border-dark flex flex-col transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
            <div className="flex border-b border-border-light dark:border-border-dark overflow-x-auto no-scrollbar">
                <button onClick={() => setActiveTab('ingredients')} className={`flex-1 min-w-[80px] py-3 text-sm font-bold border-b-2 ${activeTab === 'ingredients' ? 'border-primary text-primary' : 'border-transparent text-text-muted'}`}>Ingredients</button>
                <button onClick={() => setActiveTab('steps')} className={`flex-1 min-w-[60px] py-3 text-sm font-bold border-b-2 ${activeTab === 'steps' ? 'border-primary text-primary' : 'border-transparent text-text-muted'}`}>Steps</button>
                <button onClick={() => setActiveTab('swaps')} className={`flex-1 min-w-[60px] py-3 text-sm font-bold border-b-2 ${activeTab === 'swaps' ? 'border-primary text-primary' : 'border-transparent text-text-muted'}`}>Swaps</button>
                <button onClick={() => setActiveTab('tips')} className={`flex-1 min-w-[50px] py-3 text-sm font-bold border-b-2 ${activeTab === 'tips' ? 'border-primary text-primary' : 'border-transparent text-text-muted'}`}>Tips</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {activeTab === 'steps' && (
                    <div className="space-y-2">
                        {allSteps.map((step, index) => (
                             <button 
                                key={index} 
                                onClick={() => { setCurrentStep(index); setIsSidebarOpen(false); }}
                                className={`w-full text-left p-3 rounded-lg text-sm transition-colors flex gap-3 group ${index === currentStep && !isFinished ? 'bg-primary/10 text-primary border border-primary/20' : 'hover:bg-gray-100 dark:hover:bg-white/5 border border-transparent'}`}
                            >
                                <span className={`flex-none size-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${index === currentStep && !isFinished ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 group-hover:bg-gray-300 dark:group-hover:bg-gray-600'}`}>
                                    {index + 1}
                                </span>
                                <div className="flex-1">
                                    {step.group !== 'Main' && <span className="text-[10px] uppercase text-text-muted font-bold block mb-0.5">{step.group}</span>}
                                    {step.title && <span className="block text-xs font-bold uppercase opacity-80 mb-0.5">{step.title}</span>}
                                    <span className={`line-clamp-2 leading-relaxed ${index === currentStep && !isFinished ? 'font-medium' : 'text-text-main dark:text-gray-300'}`}>
                                        {step.txt}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
                {activeTab === 'ingredients' && (
                    <div className="space-y-4">
                        {allIngredients.map((ing) => (
                            <div key={ing.id} className="flex gap-3 items-start group cursor-pointer" onClick={() => toggleIngredient(ing.id)}>
                                <CustomCheckbox checked={checkedIngredients.has(ing.id)} onChange={() => toggleIngredient(ing.id)} />
                                <div>
                                    <span className={`text-sm block ${checkedIngredients.has(ing.id) ? 'line-through opacity-50' : ''}`}>{ing.txt}</span>
                                    {ing.group !== 'Main' && <span className="text-[10px] uppercase text-text-muted font-bold">{ing.group}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {activeTab === 'swaps' && (
                    <div className="space-y-3">
                        {swapsList.map((ing, i) => (
                            <div key={i} className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                <p className="text-xs font-bold text-green-800 dark:text-green-300 uppercase mb-1">{ing.txt.split(' ').slice(2).join(' ')}</p>
                                <p className="text-sm text-green-900 dark:text-green-100">{ing.sub}</p>
                            </div>
                        ))}
                        {swapsList.length === 0 && <p className="text-sm text-text-muted">No substitutions available.</p>}
                    </div>
                )}
                {activeTab === 'tips' && (
                    <div className="space-y-4">
                        {tipsList.map((tip, i) => (
                            <div key={i} className="flex gap-2">
                                <Lightbulb size={16} className="text-yellow-600 shrink-0 mt-0.5" />
                                <p className="text-sm">{tip}</p>
                            </div>
                        ))}
                        {tipsList.length === 0 && <p className="text-sm text-text-muted">No tips for specific steps.</p>}
                    </div>
                )}
            </div>
            
            {/* Active Manual Timers in Sidebar */}
            {manualTimers.length > 0 && (
                <div className="border-t border-border-light dark:border-border-dark p-4 bg-background-light dark:bg-background-dark">
                    <h4 className="text-xs font-bold uppercase text-text-muted mb-2">Active Timers</h4>
                    <div className="space-y-2">
                        {manualTimers.map(t => (
                            <div key={t.id} className="flex items-center justify-between bg-surface-light dark:bg-surface-dark p-2 rounded border border-border-light dark:border-border-dark">
                                <span className="text-sm font-medium text-text-main dark:text-white flex-1">{t.label}</span>
                                <span className={`font-mono text-sm font-bold mr-2 ${t.timeLeft === 0 ? 'text-red-500 animate-pulse' : 'text-primary'}`}>
                                    {formatTime(t.timeLeft)}
                                </span>
                                <button 
                                    onClick={() => removeTimer(t.id)} 
                                    className="text-text-muted hover:text-red-500 p-1"
                                >
                                    <span className="material-symbols-outlined text-[16px]">close</span>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </aside>

        {/* Main Step Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-12 flex flex-col items-center" onClick={() => setIsSidebarOpen(false)}>
            <div className="w-full max-w-3xl flex-1 flex flex-col justify-center min-h-[50vh]">
                {isFinished ? (
                     <div className="text-center space-y-6 animate-in zoom-in duration-300">
                         <div className="inline-flex items-center justify-center p-6 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full mb-4">
                             <span className="material-symbols-outlined text-6xl">check_circle</span>
                         </div>
                         <h1 className="text-3xl md:text-4xl font-bold">All Done!</h1>
                         <p className="text-lg text-text-muted max-w-md mx-auto">You've completed this recipe. Bon appétit!</p>
                         <button onClick={onClose} className="px-8 py-3 bg-primary text-white rounded-xl font-bold text-lg hover:scale-105 transition-transform shadow-lg shadow-primary/30">
                             Exit Cook Mode
                         </button>
                    </div>
                ) : (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300" key={currentStep}>
                         {/* Step Text */}
                         <div className="space-y-4">
                             {currentStepData?.group !== 'Main' && (
                                 <span className="inline-block px-3 py-1 bg-surface-light dark:bg-white/10 rounded-full text-xs font-bold uppercase tracking-wider text-text-muted border border-border-light dark:border-gray-600">
                                     {currentStepData?.group}
                                 </span>
                             )}
                             {currentStepData?.title && (
                                 <h2 className="text-2xl font-bold text-primary">{currentStepData.title}</h2>
                             )}
                             <p className="text-2xl md:text-4xl font-medium leading-relaxed md:leading-snug">
                                 {currentStepData?.txt}
                             </p>
                         </div>

                         {/* Tools & Timers */}
                         <div className="flex flex-wrap gap-4">
                             {/* Active Step Timer */}
                             {(reminderThreshold || stopwatchTime > 0) && (
                                 <div className="flex items-center gap-4 p-4 rounded-xl bg-surface-light dark:bg-white/5 border border-border-light dark:border-gray-700 shadow-sm">
                                     <div className={`text-3xl font-mono font-bold ${hasAlerted ? 'text-red-500 animate-pulse' : 'text-text-main dark:text-white'}`}>
                                         {formatTime(stopwatchTime)}
                                     </div>
                                     <div className="flex flex-col gap-1">
                                         {!isTimerRunning ? (
                                             <button onClick={() => setIsTimerRunning(true)} className="px-3 py-1 bg-primary text-white text-xs font-bold rounded hover:bg-green-600">Start</button>
                                         ) : (
                                             <button onClick={() => setIsTimerRunning(false)} className="px-3 py-1 bg-yellow-500 text-white text-xs font-bold rounded hover:bg-yellow-600">Pause</button>
                                         )}
                                         <button onClick={() => setStopwatchTime(0)} className="text-xs text-text-muted hover:text-text-main">Reset</button>
                                     </div>
                                     {reminderThreshold && (
                                         <div className="border-l border-gray-200 dark:border-gray-600 pl-4 flex flex-col">
                                             <span className="text-[10px] uppercase font-bold text-text-muted">Target</span>
                                             <span className="font-mono font-bold">{formatTime(reminderThreshold)}</span>
                                         </div>
                                     )}
                                     <div className="flex flex-col gap-1 border-l border-gray-200 dark:border-gray-600 pl-4">
                                         <button onClick={() => addReminderTime(60)} className="text-xs font-bold text-primary">+1m</button>
                                         <button onClick={setCustomReminder} className="text-xs font-bold text-text-muted">Set</button>
                                     </div>
                                 </div>
                             )}

                             {/* Step Tip */}
                             {currentStepData?.tip && (
                                 <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30 rounded-xl max-w-md">
                                     <Lightbulb className="text-yellow-600 shrink-0" />
                                     <p className="text-sm text-yellow-900 dark:text-yellow-100">{currentStepData.tip}</p>
                                 </div>
                             )}
                         </div>

                         {/* Notes Section */}
                         <div className="mt-8 pt-6 border-t border-border-light dark:border-border-dark">
                             {editingNoteId === currentStepData?.id ? (
                                 <div className="flex gap-2 items-start animate-in fade-in slide-in-from-bottom-2">
                                     <textarea 
                                        className="flex-1 p-3 rounded-lg bg-surface-light dark:bg-white/5 border border-border-light dark:border-gray-600 focus:ring-2 focus:ring-primary outline-none resize-none"
                                        rows={3}
                                        placeholder="Add a note about this step..."
                                        value={noteDraft}
                                        onChange={(e) => setNoteDraft(e.target.value)}
                                        autoFocus
                                     />
                                     <button onClick={() => saveNote(currentStepData!.id)} className="p-2 bg-primary text-white rounded-lg hover:bg-green-600">
                                         <Save size={20} />
                                     </button>
                                 </div>
                             ) : (
                                 <button 
                                    onClick={() => startEditingNote(currentStepData!.id)}
                                    className={`flex items-center gap-2 text-sm font-medium transition-colors ${userNotes[currentStepData!.id] ? 'text-text-main dark:text-white bg-surface-light dark:bg-white/5 p-3 rounded-lg border border-border-light dark:border-gray-700 w-full text-left' : 'text-text-muted hover:text-primary'}`}
                                 >
                                     <Edit size={16} />
                                     {userNotes[currentStepData!.id] || "Add a private note to this step..."}
                                 </button>
                             )}
                         </div>
                    </div>
                )}
            </div>
        </div>

        {/* Footer Navigation */}
        <footer className="flex-none p-4 md:p-6 border-t border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark flex justify-between items-center z-20">
            <button 
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
                className="px-6 py-3 rounded-xl font-bold text-text-muted disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors flex items-center gap-2"
            >
                <span className="material-symbols-outlined">arrow_back</span>
                <span className="hidden md:inline">Previous</span>
            </button>
            
            <div className="flex flex-col items-center">
                <div className="w-32 md:w-64 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }}></div>
                </div>
            </div>

            <button 
                onClick={() => isFinished ? onClose() : setCurrentStep(Math.min(allSteps.length, currentStep + 1))}
                className={`px-6 py-3 rounded-xl font-bold text-white transition-all shadow-lg flex items-center gap-2 ${isFinished ? 'bg-green-600 hover:bg-green-700' : 'bg-primary hover:bg-green-600 hover:scale-105'}`}
            >
                <span className="hidden md:inline">{isFinished ? 'Finish' : 'Next Step'}</span>
                <span className="material-symbols-outlined">{isFinished ? 'check' : 'arrow_forward'}</span>
            </button>
        </footer>

      </main>
    </div>
  );
};

export default CookMode;