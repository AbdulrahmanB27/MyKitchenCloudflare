
import React, { useState, useEffect, useRef } from 'react';
import { Recipe, Instruction, Ingredient } from '../types';
import { Lightbulb, Edit, Save, Timer, Play, Pause, RotateCcw, Plus, ChevronUp, ChevronDown, Bell, Square } from 'lucide-react';
import { formatFraction } from '../utils/format';

interface CookModeProps {
  recipe: Recipe;
  onClose: () => void;
  scalingFactor?: number;
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

const CookMode: React.FC<CookModeProps> = ({ recipe, onClose, scalingFactor = 1 }) => {
  const [currentStep, setCurrentStep] = useState(0);
  
  // Sidebar Tabs State
  const [activeTab, setActiveTab] = useState<'steps' | 'ingredients' | 'swaps' | 'tips'>('ingredients');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set());
  
  // Main Timer State (Unified Countdown/Stopwatch)
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isCountdown, setIsCountdown] = useState(false);
  const [timerTarget, setTimerTarget] = useState<number | null>(null); // Original duration for reset (countdown) OR target for alert (stopwatch)
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
          const amt = ing.amount * scalingFactor;
          return `${formatFraction(amt) || ''} ${ing.unit || ''} ${ing.item} ${ing.notes ? `(${ing.notes})` : ''}`.trim();
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
  }, [recipe, scalingFactor]);

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

  // Parse Step Timer
  useEffect(() => {
    if (currentStep >= allSteps.length) return; // End screen

    const step = allSteps[currentStep];
    const stepText = step?.txt || '';
    
    // Default to Stopwatch
    let seconds = 0;
    let modeCountdown = false;

    // Detect explicit timer or regex
    if (step.timer) {
        seconds = step.timer * 60;
        modeCountdown = true;
    } else {
        const match = stepText.match(/(\d+)\s*(?:minutes?|mins?|m)\b/i);
        if (match) {
            seconds = parseInt(match[1], 10) * 60;
            modeCountdown = true;
        }
    }

    setIsTimerRunning(false);
    setHasAlerted(false);
    setIsCountdown(modeCountdown);
    
    if (modeCountdown) {
        setTimerSeconds(seconds);
        setTimerTarget(seconds); // Store original for reset
    } else {
        setTimerSeconds(0);
        setTimerTarget(null);
    }
    
  }, [currentStep, allSteps]);

  // Main Timer Interval
  useEffect(() => {
    let interval: number;
    if (isTimerRunning) {
      interval = window.setInterval(() => {
        setTimerSeconds(prev => {
           if (isCountdown) {
               // Countdown Logic
               const next = prev - 1;
               if (next <= 0 && !hasAlerted) {
                   notifyUser();
                   setHasAlerted(true);
                   return 0;
               }
               return Math.max(0, next);
           } else {
               // Stopwatch Logic
               const next = prev + 1;
               if (timerTarget && next >= timerTarget && !hasAlerted) {
                   notifyUser();
                   setHasAlerted(true);
               }
               return next;
           }
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, isCountdown, timerTarget, hasAlerted]);

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
          new Notification('Timer Done!', { body: `Step ${currentStep + 1} completed.` });
      } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(perm => {
              if (perm === 'granted') new Notification('Timer Done!', { body: `Step ${currentStep + 1} completed.` });
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

  const formatRingTime = (currentSeconds: number) => {
    const now = Date.now();
    let remaining = 0;
    if (isCountdown) {
        remaining = currentSeconds;
    } else if (timerTarget) {
        remaining = Math.max(0, timerTarget - currentSeconds);
    }
    
    if (remaining <= 0) return '';
    
    const target = new Date(now + remaining * 1000);
    return target.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const resetTimer = () => {
      setHasAlerted(false);
      setIsTimerRunning(false);
      if (isCountdown) {
          setTimerSeconds(timerTarget || 0);
      } else {
          setTimerSeconds(0);
      }
  };

  const addTime = (secondsToAdd: number) => {
      if (isCountdown) {
          setTimerSeconds(prev => Math.max(0, prev + secondsToAdd));
          setTimerTarget(prev => (prev || 0) + secondsToAdd);
          setHasAlerted(false);
      } else {
          // Stopwatch
          if (timerTarget) {
              setTimerTarget(Math.max(timerSeconds + 1, timerTarget + secondsToAdd));
          } else {
              setTimerTarget(timerSeconds + secondsToAdd);
          }
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
            {/* Sidebar Toggle */}
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`p-2 rounded-lg transition-colors ${isSidebarOpen ? 'bg-primary text-white' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}>
                <span className="material-symbols-outlined">{isSidebarOpen ? 'menu_open' : 'menu'}</span>
            </button>
        </div>
      </header>

      {/* Main Container - Flex Row to Allow Sidebar Push */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Sidebar (Pushes content) */}
        <aside 
            className={`
                bg-surface-light dark:bg-surface-dark border-r border-border-light dark:border-border-dark flex flex-col 
                transition-[width] duration-300 ease-in-out overflow-hidden
                ${isSidebarOpen ? 'w-80' : 'w-0 border-r-0'}
            `}
        >
            <div className="w-80 h-full flex flex-col">
                <div className="flex border-b border-border-light dark:border-border-dark overflow-x-auto no-scrollbar flex-none">
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
                                    onClick={() => { setCurrentStep(index); /* Optional: auto-close sidebar on step select? */ }}
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
                    <div className="border-t border-border-light dark:border-border-dark p-4 bg-background-light dark:bg-background-dark flex-none">
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
            </div>
        </aside>

        {/* Content Column - Steps & Footer */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
            <div className="flex-1 overflow-y-auto p-6 md:p-12 flex flex-col items-center w-full">
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

                            {/* Timer Section */}
                            <div className="flex justify-center w-full my-6">
                                {(isCountdown || timerSeconds > 0 || timerTarget) ? (
                                    <div className="flex items-center gap-3 p-2 pr-4 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-full shadow-lg shadow-black/5 max-w-fit animate-in fade-in zoom-in-95">
                                         {/* Play/Pause */}
                                         <button 
                                            onClick={() => setIsTimerRunning(!isTimerRunning)}
                                            className={`size-10 rounded-full flex items-center justify-center transition-all ${
                                                hasAlerted ? 'bg-red-500 text-white animate-pulse' : 
                                                isTimerRunning ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400' : 'bg-primary text-white hover:scale-105 shadow-md shadow-primary/20'
                                            }`}
                                        >
                                            {isTimerRunning ? <Pause fill="currentColor" size={18} /> : <Play fill="currentColor" size={18} className="ml-0.5" />}
                                        </button>

                                        {/* Time Info */}
                                        <div className="flex flex-col min-w-[80px]">
                                             <div className="flex items-baseline gap-1.5">
                                                <span className={`text-xl font-mono font-bold leading-none tracking-tight ${hasAlerted ? 'text-red-500' : 'text-text-main dark:text-white'}`}>
                                                    {formatTime(timerSeconds)}
                                                </span>
                                                {(timerTarget || isCountdown) && (
                                                     <span className="text-sm font-medium text-text-muted opacity-80">
                                                         / {formatTime(timerTarget || (isCountdown ? timerSeconds : 0))}
                                                     </span>
                                                )}
                                             </div>
                                             {/* Ring Time / Status */}
                                             {isTimerRunning && !hasAlerted && (timerTarget || isCountdown) && (
                                                 <div className="flex items-center gap-1 text-[10px] font-bold text-text-muted">
                                                     <Bell size={10} /> {formatRingTime(timerSeconds)}
                                                 </div>
                                             )}
                                             {!isTimerRunning && !hasAlerted && (
                                                 <span className="text-[10px] font-medium text-text-muted">Paused</span>
                                             )}
                                             {hasAlerted && (
                                                 <span className="text-[10px] font-bold text-red-500">Timer Done!</span>
                                             )}
                                        </div>

                                        {/* Adjusters */}
                                        <div className="flex flex-col gap-0.5 border-l border-border-light dark:border-border-dark pl-2">
                                            <button onClick={() => addTime(60)} className="p-0.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded text-text-muted hover:text-primary transition-colors"><ChevronUp size={14} /></button>
                                            <button onClick={() => addTime(-60)} className="p-0.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded text-text-muted hover:text-primary transition-colors"><ChevronDown size={14} /></button>
                                        </div>

                                        {/* Reset */}
                                        <button 
                                            onClick={resetTimer} 
                                            className="ml-1 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-text-muted hover:text-red-500 transition-colors"
                                            title="Reset Timer"
                                        >
                                            <RotateCcw size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    /* Start Stopwatch Button */
                                    <button 
                                        onClick={() => { setIsTimerRunning(true); setIsCountdown(false); }}
                                        className="flex items-center gap-2 px-6 py-3 rounded-full bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark shadow-sm hover:border-primary/50 transition-all text-text-muted hover:text-primary group"
                                    >
                                        <div className="p-1.5 bg-gray-100 dark:bg-white/5 rounded-full group-hover:bg-primary/10 transition-colors">
                                             <Timer size={18} />
                                        </div>
                                        <span className="font-bold text-sm">Start Stopwatch</span>
                                    </button>
                                )}
                            </div>

                            {/* Step Tip */}
                            {currentStepData?.tip && (
                                <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30 rounded-xl max-w-md w-full mx-auto">
                                    <Lightbulb className="text-yellow-600 shrink-0" />
                                    <p className="text-sm text-yellow-900 dark:text-yellow-100">{currentStepData.tip}</p>
                                </div>
                            )}

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
    </div>
  );
};

export default CookMode;
