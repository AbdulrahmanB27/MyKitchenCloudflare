
import React, { useState, useEffect, useRef } from 'react';
import { Recipe, Instruction, Ingredient } from '../types';

interface CookModeProps {
  recipe: Recipe;
  onClose: () => void;
}

const CookMode: React.FC<CookModeProps> = ({ recipe, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  
  // Sidebar Tabs State
  const [activeTab, setActiveTab] = useState<'ingredients' | 'swaps' | 'tips'>('ingredients');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set());
  
  // Stopwatch & Reminder State
  const [stopwatchTime, setStopwatchTime] = useState(0); // Counts UP from 0
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [reminderThreshold, setReminderThreshold] = useState<number | null>(null); // Target time in seconds
  const [hasAlerted, setHasAlerted] = useState(false);
  
  // Manual User Timers (Separate from main step timer)
  const [manualTimers, setManualTimers] = useState<{id: number, label: string, timeLeft: number, running: boolean}[]>([]);

  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Helper to extract text from Instruction or String
  const getStepText = (inst: string | Instruction) => typeof inst === 'string' ? inst : inst.text;
  const getStepTitle = (inst: string | Instruction) => typeof inst === 'string' ? null : inst.title;
  const getStepTimer = (inst: string | Instruction) => typeof inst === 'string' ? null : inst.timer;

  // Combine main and component ingredients for flat list with headers
  const allIngredients = React.useMemo(() => {
      const formatIng = (ing: Ingredient | string) => {
          if (typeof ing === 'string') return ing;
          return `${ing.amount || ''} ${ing.unit || ''} ${ing.item} ${ing.notes ? `(${ing.notes})` : ''}`.trim();
      };

      const list: { txt: string, id: string, group: string }[] = [];

      // 1. Main Ingredients (optionally sectioned)
      recipe.ingredients.forEach((ing, i) => {
          list.push({ txt: formatIng(ing), id: `main-${i}`, group: ing.section || 'Main' });
      });

      // 2. Legacy Components
      recipe.components?.forEach((comp, ci) => {
          comp.ingredients.forEach((ing, i) => {
              list.push({ txt: formatIng(ing), id: `comp-${ci}-${i}`, group: comp.label });
          });
      });
      return list;
  }, [recipe]);

  // Combine instructions
  const allSteps = React.useMemo(() => {
      const steps: { txt: string, title?: string | null, timer?: number | null, group: string }[] = [];

      // 1. Main Instructions (optionally sectioned)
      recipe.instructions.forEach(inst => {
          steps.push({ 
              txt: getStepText(inst), 
              title: getStepTitle(inst),
              timer: getStepTimer(inst),
              group: (typeof inst !== 'string' && inst.section) ? inst.section : 'Main' 
          });
      });
      
      // 2. Legacy Components
      recipe.components?.forEach(comp => {
          comp.instructions.forEach(inst => {
              steps.push({ 
                  txt: getStepText(inst), 
                  title: getStepTitle(inst),
                  timer: getStepTimer(inst),
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
    return () => { if(wakeLock) wakeLock.release(); };
  }, []);

  // Parse Step Timer to Suggest Reminder
  useEffect(() => {
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

  const notifyUser = () => {
      // Audio Cue
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); // Simple beep
      audio.play().catch(e => console.log('Audio play failed', e));

      // Browser Notification
      if (Notification.permission === 'granted') {
          new Notification('Timer Done!', { body: `Step ${currentStep + 1} reminder reached.` });
      } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(perm => {
              if (perm === 'granted') new Notification('Timer Done!', { body: `Step ${currentStep + 1} reminder reached.` });
          });
      }
      
      // Visual Alert if in app
      // (Could add a modal, but the audio + state change is usually enough)
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

  const addManualTimer = () => {
      const min = prompt("Enter minutes for timer:", "5");
      if (min) {
          setManualTimers(prev => [...prev, {
              id: Date.now(),
              label: `Step ${currentStep + 1}`,
              timeLeft: parseInt(min) * 60,
              running: true
          }]);
      }
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
          setHasAlerted(false); // Reset if we add time after it rang
      } else {
          // If no reminder set, start one relative to now
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

  // --- Render ---

  const currentStepData = allSteps[currentStep];
  const progress = ((currentStep + 1) / allSteps.length) * 100;

  return (
    <div className="fixed inset-0 z-[60] bg-background-light dark:bg-[#112116] text-text-main dark:text-white font-display overflow-hidden flex flex-col">
      
      {/* Header */}
      <header className="flex-none flex items-center justify-between border-b border-border-light dark:border-border-dark px-4 py-3 bg-surface-light dark:bg-surface-dark z-10">
        <div className="flex items-center gap-3 overflow-hidden">
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10"><span className="material-symbols-outlined">close</span></button>
            <div>
                <h2 className="text-sm font-bold opacity-60 uppercase tracking-wider">{recipe.name}</h2>
                <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold">{currentStepData.group}</span>
                    <span>•</span>
                    <span>Step {currentStep + 1} of {allSteps.length}</span>
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
            <div className="flex border-b border-border-light dark:border-border-dark">
                <button onClick={() => setActiveTab('ingredients')} className={`flex-1 py-3 text-sm font-bold border-b-2 ${activeTab === 'ingredients' ? 'border-primary text-primary' : 'border-transparent text-text-muted'}`}>Ingredients</button>
                <button onClick={() => setActiveTab('swaps')} className={`flex-1 py-3 text-sm font-bold border-b-2 ${activeTab === 'swaps' ? 'border-primary text-primary' : 'border-transparent text-text-muted'}`}>Swaps</button>
                <button onClick={() => setActiveTab('tips')} className={`flex-1 py-3 text-sm font-bold border-b-2 ${activeTab === 'tips' ? 'border-primary text-primary' : 'border-transparent text-text-muted'}`}>Tips</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {activeTab === 'ingredients' && (
                    <div className="space-y-4">
                        {allIngredients.map((ing) => (
                            <label key={ing.id} className="flex gap-3 items-start group cursor-pointer">
                                <input type="checkbox" checked={checkedIngredients.has(ing.id)} onChange={() => {
                                    const next = new Set(checkedIngredients);
                                    if(next.has(ing.id)) next.delete(ing.id); else next.add(ing.id);
                                    setCheckedIngredients(next);
                                }} className="mt-1 rounded text-primary focus:ring-primary bg-transparent border-gray-300 dark:border-gray-600" />
                                <div>
                                    <span className={`text-sm block ${checkedIngredients.has(ing.id) ? 'line-through opacity-50' : ''}`}>{ing.txt}</span>
                                    {ing.group !== 'Main' && <span className="text-[10px] uppercase text-text-muted font-bold">{ing.group}</span>}
                                </div>
                            </label>
                        ))}
                    </div>
                )}
                {activeTab === 'swaps' && (
                    <ul className="space-y-2">
                        {recipe.substitutions?.map((s, i) => (
                            <li key={i} className="text-sm p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-900 dark:text-green-100">{s}</li>
                        ))}
                        {(!recipe.substitutions || recipe.substitutions.length === 0) && <p className="text-sm text-text-muted">No substitutions listed.</p>}
                    </ul>
                )}
                {activeTab === 'tips' && (
                    <div className="space-y-4">
                        {recipe.tips?.length > 0 && (
                            <div>
                                <h4 className="font-bold text-yellow-600 text-xs uppercase mb-2">Tips</h4>
                                <ul className="space-y-2">{recipe.tips.map((t, i) => <li key={i} className="text-sm">{t}</li>)}</ul>
                            </div>
                        )}
                        {recipe.mistakes?.length > 0 && (
                            <div>
                                <h4 className="font-bold text-red-600 text-xs uppercase mb-2">Avoid Mistakes</h4>
                                <ul className="space-y-2">{recipe.mistakes.map((t, i) => <li key={i} className="text-sm text-red-400">{t}</li>)}</ul>
                            </div>
                        )}
                         {(!recipe.tips?.length && !recipe.mistakes?.length) && <p className="text-sm text-text-muted">No tips listed.</p>}
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
                                <div>
                                    <span className="text-xs block text-text-muted">{t.label}</span>
                                    <span className="font-mono font-bold text-primary">{formatTime(t.timeLeft)}</span>
                                </div>
                                <button onClick={() => removeTimer(t.id)} className="text-red-500 hover:bg-red-50 rounded p-1"><span className="material-symbols-outlined text-lg">close</span></button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </aside>

        {/* Main Step Area */}
        <section className="flex-1 flex flex-col relative h-full bg-background-light dark:bg-[#112116] overflow-hidden" onClick={() => setIsSidebarOpen(false)}>
            <div className="absolute top-0 left-0 right-0 h-1 bg-border-light dark:bg-border-dark"><div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }}></div></div>

            <div className="flex-1 overflow-y-auto p-6 md:p-12 flex flex-col items-center">
                 <div className="w-full max-w-3xl space-y-8">
                     
                     {/* Timer Widget */}
                     <div className="flex flex-col items-center gap-4 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl p-6 shadow-sm w-full max-w-md mx-auto transition-colors">
                         <div className="flex items-center justify-between w-full">
                            <div className="flex flex-col">
                                <span className="text-xs font-bold uppercase text-text-muted">Stopwatch</span>
                                <span className="text-4xl font-mono font-bold text-text-main dark:text-white tabular-nums">
                                    {formatTime(stopwatchTime)}
                                </span>
                            </div>
                            <button onClick={() => { if(!isTimerRunning) requestNotificationPermission(); setIsTimerRunning(!isTimerRunning); }} className={`size-14 rounded-full flex items-center justify-center text-white shadow-md transition-transform active:scale-95 ${isTimerRunning ? 'bg-yellow-500' : 'bg-primary'}`}>
                                 <span className="material-symbols-outlined text-3xl">{isTimerRunning ? 'pause' : 'play_arrow'}</span>
                            </button>
                         </div>
                         
                         {/* Reminder Controls */}
                         <div className="w-full flex flex-wrap gap-2 items-center justify-between border-t border-border-light dark:border-border-dark pt-4">
                             {reminderThreshold ? (
                                 <div className="flex items-center gap-3">
                                     <div className={`text-sm font-bold ${hasAlerted ? 'text-red-500 animate-pulse' : 'text-primary'}`}>
                                         {hasAlerted ? 'TIME UP!' : `Alert at ${formatTime(reminderThreshold)}`}
                                     </div>
                                     <button onClick={() => setReminderThreshold(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded"><span className="material-symbols-outlined text-sm">close</span></button>
                                 </div>
                             ) : (
                                 <button onClick={setCustomReminder} className="text-xs font-bold text-text-muted hover:text-primary flex items-center gap-1">
                                     <span className="material-symbols-outlined text-sm">notifications</span> Set Reminder
                                 </button>
                             )}
                             
                             {/* Add Time Controls */}
                             <div className="flex gap-2">
                                 <button onClick={() => addReminderTime(60)} className="px-2 py-1 bg-gray-100 dark:bg-white/5 rounded text-xs font-bold hover:bg-gray-200 dark:hover:bg-white/10">+1m</button>
                                 <button onClick={() => addReminderTime(300)} className="px-2 py-1 bg-gray-100 dark:bg-white/5 rounded text-xs font-bold hover:bg-gray-200 dark:hover:bg-white/10">+5m</button>
                             </div>
                         </div>
                         
                         {(stopwatchTime > 0) && (
                            <button onClick={() => { setIsTimerRunning(false); setStopwatchTime(0); setHasAlerted(false); }} className="text-xs text-text-muted hover:text-text-main flex items-center gap-1 mt-2">
                                <span className="material-symbols-outlined text-sm">restart_alt</span> Reset
                            </button>
                         )}
                     </div>

                     {/* Step Content */}
                     <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                         {currentStepData.title && (
                             <h2 className="text-xl md:text-2xl font-bold text-text-muted">{currentStepData.title}</h2>
                         )}
                         <h1 className="text-2xl md:text-3xl font-bold leading-tight">{currentStepData.txt}</h1>
                         {currentStepData.group !== 'Main' && (
                             <span className="inline-block px-3 py-1 rounded-full bg-primary/20 text-primary text-sm font-bold uppercase">{currentStepData.group} Step</span>
                         )}
                     </div>

                     {/* Mistakes Alert */}
                     {recipe.mistakes && recipe.mistakes.length > 0 && (
                         <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 p-4 rounded-xl flex items-start gap-3 max-w-2xl mx-auto">
                             <span className="material-symbols-outlined text-red-500">warning</span>
                             <div>
                                 <h4 className="font-bold text-red-700 dark:text-red-400 text-sm uppercase">Watch Out</h4>
                                 <ul className="text-red-800 dark:text-red-200 text-sm list-disc list-inside">{recipe.mistakes.map((m, i) => <li key={i}>{m}</li>)}</ul>
                             </div>
                         </div>
                     )}
                 </div>
            </div>

            {/* Nav Footer */}
            <div className="p-4 border-t border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark flex gap-4 justify-between max-w-5xl mx-auto w-full">
                 <button onClick={() => setCurrentStep(Math.max(0, currentStep - 1))} disabled={currentStep === 0} className="px-6 py-4 rounded-xl font-bold text-text-muted hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-50 flex items-center gap-2">
                     <span className="material-symbols-outlined">arrow_back</span> Prev
                 </button>
                 {currentStep < allSteps.length - 1 ? (
                     <button onClick={() => setCurrentStep(currentStep + 1)} className="flex-1 bg-primary hover:bg-green-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-primary/20 flex items-center justify-center gap-2">
                         Next Step <span className="material-symbols-outlined">arrow_forward</span>
                     </button>
                 ) : (
                     <button onClick={onClose} className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2">
                         Finish Cooking <span className="material-symbols-outlined">check</span>
                     </button>
                 )}
            </div>

        </section>
      </main>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #ccc; border-radius: 2px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #333; }
      `}</style>
    </div>
  );
};

export default CookMode;
