
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Restaurant, VoteSession, Vote } from '../types';
import * as db from '../services/db';
import { Search, Plus, Star, UtensilsCrossed, ThumbsUp, ThumbsDown, Loader, ArrowRight, Clock, BadgeCheck, Heart, Trash2, X, RotateCcw, CheckCircle } from 'lucide-react';
import AuthModal from './AuthModal';
import { v4 as uuidv4 } from 'uuid';

interface RestaurantListProps {
    onOpenMenu: () => void;
}

const TIME_OPTIONS = (() => {
    const times = [];
    for (let i = 0; i < 24; i++) {
        for (let j = 0; j < 60; j += 30) {
            const h = i === 0 ? 12 : i > 12 ? i - 12 : i;
            const ampm = i < 12 ? 'AM' : 'PM';
            const m = j === 0 ? '00' : '30';
            times.push(`${h}:${m} ${ampm}`);
        }
    }
    return times;
})();

const DAYS = [
    { id: 'Su', label: 'S', full: 'Sun' },
    { id: 'Mo', label: 'M', full: 'Mon' },
    { id: 'Tu', label: 'T', full: 'Tue' },
    { id: 'We', label: 'W', full: 'Wed' },
    { id: 'Th', label: 'T', full: 'Thu' },
    { id: 'Fr', label: 'F', full: 'Fri' },
    { id: 'Sa', label: 'S', full: 'Sat' },
];

interface SwipeableCardProps { 
    restaurant: Restaurant;
    onVote: (val: number) => void;
}

const SwipeableCard: React.FC<SwipeableCardProps> = ({ 
    restaurant, 
    onVote
}) => {
    const [offset, setOffset] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const startX = useRef(0);
    const cardRef = useRef<HTMLDivElement>(null);

    const handleTouchStart = (e: React.TouchEvent) => {
        startX.current = e.touches[0].clientX;
        setIsDragging(true);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging) return;
        const currentX = e.touches[0].clientX;
        const delta = currentX - startX.current;
        setOffset(delta);
    };

    const handleTouchEnd = () => {
        if (!isDragging) return;
        setIsDragging(false);
        
        const threshold = 100; // px
        if (offset > threshold) {
            handleVote(1);
        } else if (offset < -threshold) {
            handleVote(-1);
        } else {
            setOffset(0);
        }
    };

    const handleVote = (val: number) => {
        setOffset(val * 500); // Fly off screen
        setTimeout(() => {
            onVote(val);
            setOffset(0); // Reset for next card (if reused, though likely unmounted)
        }, 200);
    };

    // Derived styles for swipe feedback
    const opacityRight = Math.min(Math.max(offset / 150, 0), 1);
    const opacityLeft = Math.min(Math.max(-offset / 150, 0), 1);
    const rotation = offset / 20;

    return (
        <div className="absolute inset-0 flex items-center justify-center p-4">
            <div 
                ref={cardRef}
                className="w-full max-w-sm aspect-[3/4] bg-surface-light dark:bg-surface-dark rounded-3xl shadow-xl border border-border-light dark:border-border-dark overflow-hidden relative touch-pan-y select-none"
                style={{ 
                    transform: `translateX(${offset}px) rotate(${rotation}deg)`,
                    transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
                }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {/* Overlay Indicators */}
                <div className="absolute inset-0 bg-green-500/20 z-10 pointer-events-none flex items-center justify-center transition-opacity" style={{ opacity: opacityRight }}>
                    <div className="bg-green-500 text-white p-4 rounded-full shadow-lg transform scale-150">
                        <ThumbsUp size={48} strokeWidth={3} />
                    </div>
                </div>
                <div className="absolute inset-0 bg-red-500/20 z-10 pointer-events-none flex items-center justify-center transition-opacity" style={{ opacity: opacityLeft }}>
                    <div className="bg-red-500 text-white p-4 rounded-full shadow-lg transform scale-150">
                        <ThumbsDown size={48} strokeWidth={3} />
                    </div>
                </div>

                {/* Content */}
                <div className="flex flex-col h-full p-6">
                    <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
                        <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                            <UtensilsCrossed size={48} className="text-primary" />
                        </div>
                        <h2 className="text-3xl font-bold font-display text-text-main dark:text-white leading-tight">{restaurant.name}</h2>
                        
                        <div className="flex flex-wrap justify-center gap-2">
                            {restaurant.price && <span className="px-3 py-1 bg-gray-100 dark:bg-white/10 rounded-full text-sm font-bold">{restaurant.price}</span>}
                            {restaurant.cuisineTags.slice(0,3).map(t => (
                                <span key={t} className="px-3 py-1 border border-border-light dark:border-white/10 rounded-full text-xs font-bold text-text-muted uppercase tracking-wide">{t}</span>
                            ))}
                        </div>

                        {restaurant.notes && (
                            <p className="text-sm italic text-gray-500 dark:text-gray-400 mt-2">"{restaurant.notes}"</p>
                        )}
                    </div>

                    <div className="flex justify-between items-center pt-6 border-t border-border-light dark:border-border-dark w-full">
                        <button onClick={() => handleVote(-1)} className="p-4 rounded-full bg-red-100 dark:bg-red-900/20 text-red-500 hover:bg-red-200 transition-colors">
                            <X size={32} />
                        </button>
                        <div className="text-xs font-bold text-text-muted uppercase tracking-widest opacity-50">Swipe</div>
                        <button onClick={() => handleVote(1)} className="p-4 rounded-full bg-green-100 dark:bg-green-900/20 text-green-500 hover:bg-green-200 transition-colors">
                            <Heart size={32} fill="currentColor" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const RestaurantList: React.FC<RestaurantListProps> = ({ onOpenMenu }) => {
    const [view, setView] = useState<'list' | 'decide'>('list');
    const [joinView, setJoinView] = useState(false);
    const [joinCode, setJoinCode] = useState('');
    
    const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Auth/Form State
    const [showAuth, setShowAuth] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [formData, setFormData] = useState<Partial<Restaurant>>({});

    // Schedule State for Form
    const [schedDays, setSchedDays] = useState<Set<string>>(new Set(['Mo','Tu','We','Th','Fr']));
    const [schedStart, setSchedStart] = useState('11:00 AM');
    const [schedEnd, setSchedEnd] = useState('9:00 PM');

    // Archive State
    const [localArchive, setLocalArchive] = useState<Set<string>>(new Set());
    const [showArchived, setShowArchived] = useState(false);

    // Vote Session State
    const [activeSession, setActiveSession] = useState<VoteSession | null>(null);
    const [sessionVotes, setSessionVotes] = useState<Vote[]>([]);
    const [myVotes, setMyVotes] = useState<Map<string, number>>(new Map()); 
    const [sessionRestaurants, setSessionRestaurants] = useState<Restaurant[]>([]); 
    const [isHost, setIsHost] = useState(false);
    
    // Selection & Setup State
    const [selection, setSelection] = useState<Set<string>>(new Set());
    const [selectedMode, setSelectedMode] = useState<'list' | 'swipe'>('swipe');
    const [hasInitializedSelection, setHasInitializedSelection] = useState(false);

    // Swipe Mode Specific State
    const [swipeIndex, setSwipeIndex] = useState(0);
    const [swipeFinished, setSwipeFinished] = useState(false);

    useEffect(() => {
        loadData();
        const savedArchive = localStorage.getItem('archived_restaurants');
        if (savedArchive) {
            setLocalArchive(new Set(JSON.parse(savedArchive)));
        }

        const handleUpdates = () => loadData();
        window.addEventListener('restaurants-updated', handleUpdates);
        
        // Check URL for join code
        const params = new URLSearchParams(window.location.search);
        const code = params.get('join');
        if (code && code.length === 4) {
            setJoinCode(code);
            handleJoinSession(code);
            window.history.replaceState({}, '', window.location.pathname);
        }

        return () => window.removeEventListener('restaurants-updated', handleUpdates);
    }, []);

    // Sync Schedule to formData string
    useEffect(() => {
        if (!isFormOpen) return;
        let dayStr = '';
        if (schedDays.size === 7) dayStr = 'Daily';
        else if (schedDays.size === 5 && !schedDays.has('Sa') && !schedDays.has('Su')) dayStr = 'Weekdays';
        else if (schedDays.size === 2 && schedDays.has('Sa') && schedDays.has('Su')) dayStr = 'Weekends';
        else {
            const ordered = DAYS.filter(d => schedDays.has(d.id)).map(d => d.full);
            dayStr = ordered.join(', ');
        }
        if (schedDays.size === 0) {
            setFormData(prev => ({ ...prev, openHours: '' }));
        } else {
            setFormData(prev => ({ ...prev, openHours: `${dayStr} ${schedStart} - ${schedEnd}` }));
        }
    }, [schedDays, schedStart, schedEnd, isFormOpen]);

    const loadData = async () => {
        const data = await db.getRestaurants();
        setRestaurants(data);
        setLoading(false);
    };

    // Initialize selection only once when data is ready
    useEffect(() => {
        if (!activeSession && restaurants.length > 0 && !hasInitializedSelection) {
            const activeIds = restaurants.filter(r => !localArchive.has(r.id)).map(r => r.id);
            setSelection(new Set(activeIds));
            setHasInitializedSelection(true);
        }
    }, [restaurants, activeSession, localArchive, hasInitializedSelection]);

    const toggleLocalArchive = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const next = new Set(localArchive);
        if (next.has(id)) next.delete(id); else next.add(id);
        setLocalArchive(next);
        localStorage.setItem('archived_restaurants', JSON.stringify(Array.from(next)));
    };

    // --- Form Handlers ---
    const openForm = (r?: Restaurant) => {
        if (!db.hasAuthToken()) { setShowAuth(true); return; }
        if (r) {
            setFormData(r);
            setEditingId(r.id);
            
            // Try to parse existing hours
            if (r.openHours) {
                try {
                    const parts = r.openHours.split(' - ');
                    if (parts.length === 2) {
                        const end = parts[1].trim();
                        const firstPart = parts[0];
                        const timeMatch = firstPart.match(/(\d{1,2}:\d{2} [AP]M)$/);
                        if (timeMatch) {
                            setSchedStart(timeMatch[1]);
                            setSchedEnd(end);
                            const dayPart = firstPart.substring(0, firstPart.length - timeMatch[1].length).trim();
                            if (dayPart === 'Daily') setSchedDays(new Set(DAYS.map(d => d.id)));
                            else if (dayPart === 'Weekdays') setSchedDays(new Set(['Mo','Tu','We','Th','Fr']));
                            else if (dayPart === 'Weekends') setSchedDays(new Set(['Sa','Su']));
                            else {
                                const days = new Set<string>();
                                DAYS.forEach(d => {
                                    if (dayPart.includes(d.full) || dayPart.includes(d.id)) days.add(d.id);
                                });
                                if (days.size > 0) setSchedDays(days);
                            }
                        }
                    }
                } catch (e) {
                    // Fail silently
                }
            } else {
                setSchedDays(new Set(['Mo','Tu','We','Th','Fr']));
                setSchedStart('11:00 AM');
                setSchedEnd('9:00 PM');
            }
        } else {
            setFormData({ stars: 0, price: '$$', cuisineTags: [], isApproved: false });
            setEditingId(null);
            setSchedDays(new Set(['Mo','Tu','We','Th','Fr']));
            setSchedStart('11:00 AM');
            setSchedEnd('9:00 PM');
        }
        setIsFormOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this restaurant for everyone?")) return;
        if (!db.hasAuthToken()) { setShowAuth(true); return; }
        await db.deleteRestaurant(id);
        setRestaurants(prev => prev.filter(r => r.id !== id));
        setIsFormOpen(false);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const r: Restaurant = {
                ...formData as Restaurant,
                id: editingId || uuidv4(),
                familyId: 'global',
                createdAt: formData.createdAt || Date.now(),
                updatedAt: Date.now(),
                cuisineTags: typeof formData.cuisineTags === 'string' ? (formData.cuisineTags as string).split(',').map(t => t.trim()).filter(Boolean) : (formData.cuisineTags || [])
            };
            await db.upsertRestaurant(r);
            await loadData();
            setIsFormOpen(false);
        } catch (err: any) {
            alert(`Unable to save: ${err.message}`);
        }
    };

    const toggleSchedDay = (id: string) => {
        const next = new Set(schedDays);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSchedDays(next);
    };

    // --- Voting Logic ---

    const refreshSession = async () => {
        if (activeSession?.accessCode) {
            const data = await db.joinSession(activeSession.accessCode);
            if (data) {
                setActiveSession(data.session);
                setSessionVotes(data.votes);
                // Update restaurants if strictly necessary, usually snapshot is constant
                if (data.restaurants && data.restaurants.length > 0) {
                    setSessionRestaurants(data.restaurants);
                }
                
                const myDeviceId = localStorage.getItem('device_id');
                const myMap = new Map<string, number>();
                data.votes.filter(v => v.deviceId === myDeviceId).forEach(v => myMap.set(v.restaurantId, v.voteValue));
                setMyVotes(myMap);
            }
        }
    };

    const startSession = async () => {
        if (selection.size === 0) { alert("Please select at least one restaurant."); return; }
        setLoading(true);
        try {
            const subset = restaurants.filter(r => selection.has(r.id));
            if (subset.length === 0) throw new Error("Selection invalid.");

            const session = await db.createVoteSession(subset, selectedMode);
            if (!session) throw new Error("Failed to create session.");
            
            setActiveSession(session);
            setSessionRestaurants(subset);
            setSessionVotes([]);
            setSwipeIndex(0);
            setSwipeFinished(false);
            setIsHost(true);
            setView('decide');
        } catch (e: any) {
            alert(`Failed to start session: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleJoinSession = async (codeOverride?: string) => {
        const code = codeOverride || joinCode;
        if (code.length !== 4) return alert("Please enter a 4-character code.");
        setLoading(true);
        try {
            const data = await db.joinSession(code);
            if (!data) {
                alert("Session not found or inactive.");
            } else {
                setActiveSession(data.session);
                setSessionVotes(data.votes);
                setSessionRestaurants(data.restaurants || []);
                setSwipeIndex(0); // Start from beginning of stack
                setSwipeFinished(false);
                setView('decide');
                setJoinView(false);
                setIsHost(false);
            }
        } catch (e) {
            alert("Failed to join.");
        } finally {
            setLoading(false);
        }
    };

    const handleBackToList = () => {
        // If host, end the session completely
        if (isHost && activeSession) {
            if (confirm("End this session for everyone?")) {
                db.endSession(activeSession.id);
            } else {
                return; // User cancelled exit
            }
        }
        
        // Reset local state
        setActiveSession(null);
        setSessionVotes([]);
        setSessionRestaurants([]);
        setMyVotes(new Map());
        setIsHost(false);
        setView('list');
        setSwipeIndex(0);
        setSwipeFinished(false);
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
    };

    const handleEndSession = async () => {
        if (activeSession && confirm('Are you sure you want to end this session for everyone?')) {
            await db.endSession(activeSession.id);
            handleBackToList();
        }
    };

    const submitVote = async (restId: string, val: number) => {
        if (!activeSession) return;
        setMyVotes(prev => new Map(prev).set(restId, val));
        
        // Optimistic update for Swipe Mode
        if (activeSession.mode === 'swipe') {
            if (swipeIndex < sessionRestaurants.length - 1) {
                setSwipeIndex(prev => prev + 1);
            } else {
                setSwipeFinished(true);
            }
        }

        await db.submitVote(activeSession.id, restId, val);
        refreshSession();
    };

    // Auto-Sync Polling
    useEffect(() => {
        let interval: number;
        if (view === 'decide' && activeSession) {
            refreshSession(); // Initial fetch
            interval = window.setInterval(refreshSession, 2000); // Poll every 2s
        }
        return () => clearInterval(interval);
    }, [view, activeSession?.id]);


    // --- Filtering & Sorting ---
    const visibleRestaurants = useMemo(() => {
        return restaurants.filter(r => {
            if (!showArchived && localArchive.has(r.id)) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                return r.name.toLowerCase().includes(q) || r.cuisineTags.some(t => t.toLowerCase().includes(q));
            }
            return true;
        }).sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name));
    }, [restaurants, localArchive, showArchived, searchQuery]);

    const calculateScore = (restId: string) => {
        return sessionVotes.filter(v => v.restaurantId === restId).reduce((acc, v) => acc + v.voteValue, 0);
    };

    const rankedForSession = useMemo(() => {
        const source = sessionRestaurants.length > 0 ? sessionRestaurants : [];
        if (source.length === 0) return [];
        return [...source].sort((a, b) => calculateScore(b.id) - calculateScore(a.id));
    }, [sessionRestaurants, sessionVotes]);

    // --- Selection Handlers ---
    const toggleSelect = (id: string) => {
        const next = new Set(selection);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelection(next);
    };
    const selectAll = () => { setSelection(new Set(visibleRestaurants.map(r => r.id))); };
    const selectNone = () => setSelection(new Set());

    // --- Render ---

    if (joinView) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background-light dark:bg-background-dark animate-in fade-in">
                <div className="w-full max-w-sm space-y-6 text-center">
                    <button onClick={() => setJoinView(false)} className="absolute top-4 left-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <h2 className="text-2xl font-bold dark:text-white">Join Session</h2>
                    <input 
                        type="text" 
                        value={joinCode} 
                        onChange={e => setJoinCode(e.target.value.toUpperCase())} 
                        className="w-full text-center text-4xl font-mono tracking-widest p-4 rounded-xl border-2 border-primary/50 focus:border-primary bg-surface-light dark:bg-surface-dark dark:text-white uppercase outline-none" 
                        placeholder="ABCD" 
                        maxLength={4}
                        autoFocus
                    />
                    <button onClick={() => handleJoinSession()} disabled={joinCode.length !== 4 || loading} className="w-full py-4 bg-primary text-white font-bold rounded-xl shadow-lg hover:scale-105 transition-transform disabled:opacity-50">
                        {loading ? <Loader className="animate-spin mx-auto" /> : 'Join'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-background-light dark:bg-background-dark">
            <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
                <div className="max-w-4xl mx-auto space-y-6 h-full flex flex-col">
                    
                    {/* Header */}
                    <div className="flex items-center justify-between gap-4 flex-none">
                        <div className="flex items-center gap-4">
                            <button onClick={onOpenMenu} className="md:hidden p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10">
                                <span className="material-symbols-outlined">menu</span>
                            </button>
                            <h1 className="text-2xl font-bold font-display text-text-main dark:text-white flex items-center gap-2">
                                <UtensilsCrossed className="text-primary" /> Eat Out
                            </h1>
                        </div>
                        <div className="flex gap-2">
                            {view === 'list' && (
                                <button onClick={() => setJoinView(true)} className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-all text-text-muted">
                                    Join Code
                                </button>
                            )}
                            {view === 'decide' && (
                                <button onClick={handleBackToList} className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-all">
                                    {isHost ? 'End Session' : 'Exit Session'}
                                </button>
                            )}
                            {view === 'list' && (
                                <button onClick={() => setView('decide')} className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-all">
                                    Start Vote
                                </button>
                            )}
                        </div>
                    </div>

                    {view === 'list' ? (
                        <>
                            <div className="flex flex-col md:flex-row gap-4 flex-none">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-2.5 text-text-muted" size={18} />
                                    <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search restaurants..." className="w-full pl-10 pr-4 py-2 rounded-lg bg-surface-light dark:bg-surface-dark border-none focus:ring-2 focus:ring-primary" />
                                </div>
                                <div className="flex gap-2 items-center">
                                    <button onClick={() => setShowArchived(!showArchived)} className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${showArchived ? 'bg-primary text-white border-primary' : 'bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark text-text-muted'}`}>
                                        {showArchived ? 'Hidden Shown' : 'Show Hidden'}
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-20">
                                {visibleRestaurants.map(r => (
                                    <div key={r.id} onClick={() => openForm(r)} className={`bg-surface-light dark:bg-surface-dark p-4 rounded-xl border ${localArchive.has(r.id) ? 'border-dashed border-gray-300 dark:border-gray-700 opacity-60' : 'border-border-light dark:border-border-dark'} shadow-sm hover:shadow-md transition-all cursor-pointer group relative`}>
                                        <div className="flex justify-between items-start">
                                            <div className="space-y-1 w-full pr-8">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className="font-bold text-lg text-text-main dark:text-white">{r.name}</h3>
                                                    {r.isApproved && (
                                                        <BadgeCheck size={16} className="text-blue-500 fill-blue-100 dark:fill-blue-900/30" />
                                                    )}
                                                    {r.price && <span className="text-xs font-bold text-text-muted bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded">{r.price}</span>}
                                                </div>
                                                {r.location && <div className="flex items-center gap-1 text-xs text-text-muted"><span className="material-symbols-outlined text-[14px]">location_on</span>{r.location}</div>}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {r.cuisineTags.map(t => <span key={t} className="text-[10px] uppercase font-bold text-text-muted border border-border-light dark:border-border-dark px-1.5 py-0.5 rounded">{t}</span>)}
                                        </div>
                                        {r.notes && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">{r.notes}</p>}
                                        
                                        <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={(e) => toggleLocalArchive(r.id, e)} className="p-1.5 bg-white dark:bg-black/50 rounded-full shadow-sm hover:bg-gray-100 text-text-muted">
                                                {localArchive.has(r.id) ? <span className="material-symbols-outlined text-[16px]">visibility</span> : <span className="material-symbols-outlined text-[16px]">visibility_off</span>}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="space-y-6 animate-in fade-in h-full flex flex-col">
                            {!activeSession ? (
                                <div className="space-y-6">
                                    <div className="bg-primary/10 p-6 rounded-2xl border border-primary/20">
                                        <h3 className="text-xl font-bold text-primary mb-4">Setup Vote Session</h3>
                                        <div className="flex gap-4 mb-6">
                                            <button onClick={() => setSelectedMode('swipe')} className={`flex-1 p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${selectedMode === 'swipe' ? 'border-primary bg-white dark:bg-white/10 shadow-md' : 'border-transparent bg-white/50 dark:bg-white/5 hover:bg-white/80'}`}>
                                                <div className="p-2 bg-pink-100 text-pink-600 rounded-full"><Heart size={24} /></div>
                                                <span className="font-bold text-sm">Feed Mode</span>
                                                <span className="text-xs text-text-muted">Swipe Social Style</span>
                                            </button>
                                            <button onClick={() => setSelectedMode('list')} className={`flex-1 p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${selectedMode === 'list' ? 'border-primary bg-white dark:bg-white/10 shadow-md' : 'border-transparent bg-white/50 dark:bg-white/5 hover:bg-white/80'}`}>
                                                <div className="p-2 bg-blue-100 text-blue-600 rounded-full"><ThumbsUp size={24} /></div>
                                                <span className="font-bold text-sm">List Mode</span>
                                                <span className="text-xs text-text-muted">Vote on all</span>
                                            </button>
                                        </div>

                                        <h4 className="font-bold text-sm text-text-muted uppercase mb-2">Pool Selection ({selection.size})</h4>
                                        <div className="flex gap-2 mb-4">
                                            <button onClick={selectAll} className="text-xs font-bold text-primary hover:underline">Select All</button>
                                            <span className="text-text-muted">•</span>
                                            <button onClick={selectNone} className="text-xs font-bold text-primary hover:underline">Select None</button>
                                        </div>

                                        <div className="max-h-60 overflow-y-auto bg-white dark:bg-black/20 rounded-xl border border-border-light dark:border-border-dark mb-4">
                                            {visibleRestaurants.length > 0 ? (
                                                visibleRestaurants.map(r => (
                                                    <div 
                                                        key={r.id} 
                                                        onClick={() => toggleSelect(r.id)}
                                                        className="flex items-center gap-3 p-3 border-b border-border-light dark:border-border-dark last:border-0 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer transition-colors"
                                                    >
                                                        <div className={`size-5 rounded border flex items-center justify-center transition-colors ${selection.has(r.id) ? 'bg-primary border-primary' : 'border-gray-300 dark:border-gray-600'}`}>
                                                            {selection.has(r.id) && <span className="material-symbols-outlined text-white text-[16px]">check</span>}
                                                        </div>
                                                        <div className="flex-1">
                                                            <span className="text-sm font-bold text-text-main dark:text-white block">{r.name}</span>
                                                        </div>
                                                        {r.isApproved && <BadgeCheck size={14} className="text-blue-500" />}
                                                    </div>
                                                ))
                                            ) : <div className="p-4 text-center text-sm text-text-muted">No restaurants found.</div>}
                                        </div>

                                        <button 
                                            onClick={startSession} 
                                            disabled={loading || selection.size === 0} 
                                            className="w-full px-6 py-3 bg-primary text-white rounded-xl font-bold shadow-lg hover:scale-105 transition-transform flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:scale-100"
                                        >
                                            {loading ? <Loader className="animate-spin" /> : 'Start Session'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* Active Session */
                                <div className="flex-1 flex flex-col gap-4">
                                    <div className="bg-primary/10 p-4 rounded-2xl border border-primary/20 flex flex-row items-center justify-between gap-4 flex-none">
                                        <div className="flex flex-col items-start gap-1">
                                            <span className="text-xs font-bold text-primary/70 uppercase tracking-widest">Join Code</span>
                                            <span className="text-4xl md:text-5xl font-display font-bold text-primary tracking-widest">{activeSession.accessCode}</span>
                                        </div>
                                        <div className="p-2 bg-white rounded-xl shadow-sm shrink-0">
                                            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&format=svg&color=17cf54&margin=0&data=${encodeURIComponent(`${window.location.origin}?join=${activeSession.accessCode}`)}`} alt="QR" className="w-20 h-20" />
                                        </div>
                                    </div>

                                    {(activeSession.mode === 'list' || !activeSession.mode) && (
                                        <div className="space-y-3 overflow-y-auto pb-20">
                                            {rankedForSession.length === 0 && (
                                                <div className="text-center p-8 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark text-text-muted">
                                                    <Loader className="animate-spin mx-auto mb-2" />
                                                    <p>Loading restaurants...</p>
                                                </div>
                                            )}
                                            {rankedForSession.map(r => {
                                                const score = calculateScore(r.id);
                                                const myVote = myVotes.get(r.id);
                                                return (
                                                    <div key={r.id} className="bg-surface-light dark:bg-surface-dark p-4 rounded-xl border border-border-light dark:border-border-dark flex items-center gap-4 shadow-sm">
                                                        <div className={`flex flex-col items-center justify-center min-w-[40px] ${score > 0 ? 'text-green-500' : score < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                                            <span className="text-2xl font-bold">{score > 0 ? `+${score}` : score}</span>
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-1.5">
                                                                <h3 className="font-bold text-text-main dark:text-white">{r.name}</h3>
                                                                {r.isApproved && <BadgeCheck size={16} className="text-blue-500 fill-blue-50 dark:fill-blue-900/30" />}
                                                            </div>
                                                            <div className="flex gap-2 text-xs text-text-muted">
                                                                <span>{r.price}</span>
                                                                <span>•</span>
                                                                <span>{r.cuisineTags.join(', ')}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button onClick={() => submitVote(r.id, -1)} className={`p-3 rounded-full transition-colors ${myVote === -1 ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-white/5 text-gray-400 hover:text-red-500'}`}><ThumbsDown size={20} /></button>
                                                            <button onClick={() => submitVote(r.id, 1)} className={`p-3 rounded-full transition-colors ${myVote === 1 ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-white/5 text-gray-400 hover:text-green-500'}`}><ThumbsUp size={20} /></button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {activeSession.mode === 'swipe' && (
                                        <div className="flex-1 relative overflow-hidden flex flex-col">
                                            <div className="flex-1 relative">
                                                {sessionRestaurants.length === 0 ? (
                                                    <div className="absolute inset-0 flex items-center justify-center text-text-muted">
                                                        <Loader className="animate-spin mr-2"/> Loading Feed...
                                                    </div>
                                                ) : swipeFinished ? (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 space-y-4">
                                                        <div className="p-4 bg-green-100 dark:bg-green-900/20 text-green-600 rounded-full">
                                                            <CheckCircle size={48} />
                                                        </div>
                                                        <h3 className="text-2xl font-bold dark:text-white">All Caught Up!</h3>
                                                        <p className="text-text-muted">Waiting for others to vote...</p>
                                                        <button onClick={() => { setSwipeIndex(0); setSwipeFinished(false); }} className="flex items-center gap-2 text-primary hover:underline">
                                                            <RotateCcw size={16} /> Review Again
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <SwipeableCard 
                                                        key={sessionRestaurants[swipeIndex].id}
                                                        restaurant={sessionRestaurants[swipeIndex]} 
                                                        onVote={(val) => submitVote(sessionRestaurants[swipeIndex].id, val)}
                                                    />
                                                )}
                                            </div>
                                            
                                            {/* Live Ticker */}
                                            <div className="flex-none p-4 border-t border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h3 className="font-bold text-xs uppercase text-text-muted">Leaderboard</h3>
                                                    <span className="text-xs text-text-muted">{swipeIndex + 1} / {sessionRestaurants.length}</span>
                                                </div>
                                                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                                                    {rankedForSession.filter(r => calculateScore(r.id) > 0).slice(0, 3).map(r => (
                                                        <div key={r.id} className="flex items-center gap-1 bg-primary/10 px-2 py-1 rounded text-xs font-bold text-primary whitespace-nowrap">
                                                            <span>{r.name}</span>
                                                            <span className="bg-white dark:bg-black/20 px-1 rounded">+{calculateScore(r.id)}</span>
                                                        </div>
                                                    ))}
                                                    {rankedForSession.every(r => calculateScore(r.id) <= 0) && <span className="text-xs text-text-muted">Vote to see results...</span>}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Floating Action Button (Bottom Right) */}
            {view === 'list' && (
                <button 
                    onClick={() => openForm()} 
                    className="absolute bottom-6 right-6 size-14 bg-primary text-white rounded-full shadow-xl flex items-center justify-center hover:scale-105 transition-transform z-30"
                    title="Add Restaurant"
                >
                    <Plus size={28} />
                </button>
            )}

            {/* Form Modal */}
            {isFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setIsFormOpen(false)}>
                    <div className="bg-surface-light dark:bg-surface-dark p-6 rounded-2xl w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold dark:text-white">{editingId ? 'Edit Restaurant' : 'Add Restaurant'}</h2>
                        <form onSubmit={handleSave} className="space-y-4">
                            <input required placeholder="Name" className="w-full p-2 rounded border bg-transparent dark:text-white dark:border-gray-700" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-text-muted">Price</label>
                                    <select 
                                        className="w-full p-2 rounded border bg-surface-light dark:bg-surface-dark text-text-main dark:text-white dark:border-gray-700" 
                                        value={formData.price || ''} 
                                        onChange={e => setFormData({...formData, price: e.target.value as any})}
                                    >
                                        <option value="">-</option>
                                        <option value="$">$</option>
                                        <option value="$$">$$</option>
                                        <option value="$$$">$$$</option>
                                        <option value="$$$$">$$$$</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-text-muted">Stars</label>
                                    <div className="flex gap-2 mt-2 items-center justify-between">
                                        <div className="flex gap-2">
                                            {[1,2,3].map(s => (
                                                <button type="button" key={s} onClick={() => setFormData({...formData, stars: formData.stars === s ? 0 : s})} className={`${(formData.stars || 0) >= s ? 'text-yellow-500' : 'text-gray-300'}`}>
                                                    <Star size={24} fill={(formData.stars || 0) >= s ? "currentColor" : "none"} />
                                                </button>
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-1 cursor-pointer" onClick={() => setFormData({...formData, isApproved: !formData.isApproved})} title="Verified / Approved">
                                            <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${formData.isApproved ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-gray-600'}`}>
                                                {formData.isApproved && <span className="material-symbols-outlined text-white text-[14px]">check</span>}
                                            </div>
                                            <BadgeCheck size={16} className={formData.isApproved ? 'text-blue-500' : 'text-gray-400'} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <input placeholder="Location" className="w-full p-2 rounded border bg-transparent dark:text-white dark:border-gray-700" value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} />
                            
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-text-muted">Open Hours</label>
                                <div className="flex gap-1 justify-between bg-gray-100 dark:bg-white/5 p-2 rounded-lg">
                                    {DAYS.map(d => (
                                        <button 
                                            key={d.id}
                                            type="button"
                                            onClick={() => toggleSchedDay(d.id)}
                                            className={`size-8 rounded-full text-xs font-bold flex items-center justify-center transition-all ${
                                                schedDays.has(d.id) 
                                                    ? 'bg-primary text-white shadow-md' 
                                                    : 'text-text-muted hover:bg-gray-200 dark:hover:bg-white/10'
                                            }`}
                                        >
                                            {d.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-2 items-center">
                                    <select 
                                        className="flex-1 p-2 rounded border bg-surface-light dark:bg-surface-dark dark:text-white dark:border-gray-700 text-sm"
                                        value={schedStart}
                                        onChange={e => setSchedStart(e.target.value)}
                                    >
                                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                    <span className="text-text-muted text-xs font-bold">TO</span>
                                    <select 
                                        className="flex-1 p-2 rounded border bg-surface-light dark:bg-surface-dark dark:text-white dark:border-gray-700 text-sm"
                                        value={schedEnd}
                                        onChange={e => setSchedEnd(e.target.value)}
                                    >
                                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                            </div>

                            <input placeholder="Cuisine Tags (comma joined)" className="w-full p-2 rounded border bg-transparent dark:text-white dark:border-gray-700" value={Array.isArray(formData.cuisineTags) ? formData.cuisineTags.join(', ') : formData.cuisineTags || ''} onChange={e => setFormData({...formData, cuisineTags: e.target.value as any})} />
                            <textarea placeholder="Notes" rows={3} className="w-full p-2 rounded border bg-transparent dark:text-white dark:border-gray-700" value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} />
                            <input placeholder="Order Link" className="w-full p-2 rounded border bg-transparent dark:text-white dark:border-gray-700" value={formData.goToOrder || ''} onChange={e => setFormData({...formData, goToOrder: e.target.value})} />

                            <div className="flex gap-2 pt-2">
                                {editingId && (
                                    <button type="button" onClick={() => handleDelete(editingId)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
                                        <Trash2 size={20} />
                                    </button>
                                )}
                                <div className="flex-1"></div>
                                <button type="button" onClick={() => setIsFormOpen(false)} className="px-4 py-2 text-text-muted">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-primary text-white rounded font-bold">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showAuth && <AuthModal onClose={() => setShowAuth(false)} onSuccess={() => setShowAuth(false)} />}
        </div>
    );
};

export default RestaurantList;
