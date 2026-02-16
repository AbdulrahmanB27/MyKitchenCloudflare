
import React, { useState, useEffect, useMemo } from 'react';
import { Restaurant, VoteSession, Vote } from '../types';
import * as db from '../services/db';
import { Search, Plus, Star, UtensilsCrossed, ThumbsUp, ThumbsDown, Loader, ArrowRight, QrCode, CheckSquare, Square, Filter, Clock, BadgeCheck, X, Heart, SkipForward, RotateCcw } from 'lucide-react';
import AuthModal from './AuthModal';
import { v4 as uuidv4 } from 'uuid';

interface RestaurantListProps {
    onOpenMenu: () => void;
}

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

    // Archive State
    const [localArchive, setLocalArchive] = useState<Set<string>>(new Set());
    const [showArchived, setShowArchived] = useState(false);

    // Vote Session State
    const [activeSession, setActiveSession] = useState<VoteSession | null>(null);
    const [sessionVotes, setSessionVotes] = useState<Vote[]>([]);
    const [myVotes, setMyVotes] = useState<Map<string, number>>(new Map()); // RestID -> Value
    const [sessionRestaurants, setSessionRestaurants] = useState<Restaurant[]>([]); // For guest view
    
    // Selection & Setup State
    const [selection, setSelection] = useState<Set<string>>(new Set());
    const [selectedMode, setSelectedMode] = useState<'list' | 'swipe'>('swipe');

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
        return () => window.removeEventListener('restaurants-updated', handleUpdates);
    }, []);

    const loadData = async () => {
        const data = await db.getRestaurants();
        setRestaurants(data);
        setLoading(false);
    };

    // Initialize selection when entering "decide" view or data loads
    useEffect(() => {
        if (!activeSession && restaurants.length > 0) {
            // Default select all non-archived
            const activeIds = restaurants.filter(r => !localArchive.has(r.id)).map(r => r.id);
            setSelection(new Set(activeIds));
        }
    }, [restaurants, activeSession, localArchive]);

    const toggleLocalArchive = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const next = new Set(localArchive);
        if (next.has(id)) next.delete(id); else next.add(id);
        setLocalArchive(next);
        localStorage.setItem('archived_restaurants', JSON.stringify(Array.from(next)));
    };

    // --- Form Handlers ---

    const openForm = (r?: Restaurant) => {
        if (!db.hasAuthToken()) {
            setShowAuth(true);
            return;
        }
        if (r) {
            setFormData(r);
            setEditingId(r.id);
        } else {
            setFormData({ stars: 0, price: '$$', cuisineTags: [], isApproved: false });
            setEditingId(null);
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
            console.error("Failed to save restaurant", err);
            alert(`Unable to save: ${err.message || "Please ensure you are logged in."}`);
        }
    };

    // --- Voting Logic ---

    const refreshSession = async () => {
        if (activeSession?.accessCode) {
            const data = await db.joinSession(activeSession.accessCode);
            if (data) {
                setActiveSession(data.session);
                setSessionVotes(data.votes);
                setSessionRestaurants(data.restaurants);
                
                const myDeviceId = localStorage.getItem('device_id');
                const myMap = new Map<string, number>();
                data.votes.filter(v => v.deviceId === myDeviceId).forEach(v => myMap.set(v.restaurantId, v.voteValue));
                setMyVotes(myMap);
            }
        }
    };

    const startSession = async () => {
        if (selection.size === 0) {
            alert("Please select at least one restaurant.");
            return;
        }
        setLoading(true);
        try {
            const subset = restaurants.filter(r => selection.has(r.id));
            const session = await db.createVoteSession(subset, selectedMode);
            if (!session) throw new Error("Failed to create session.");
            
            // Auto join
            const data = await db.joinSession(session.accessCode);
            if (data) {
                setActiveSession(data.session);
                setSessionVotes(data.votes);
                setSessionRestaurants(data.restaurants);
                setSwipeIndex(0);
                setSwipeFinished(false);
            }
        } catch (e: any) {
            alert(`Failed to start session: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleJoinSession = async () => {
        if (joinCode.length !== 4) return alert("Please enter a 4-character code.");
        setLoading(true);
        try {
            const data = await db.joinSession(joinCode);
            if (!data) {
                alert("Session not found or inactive.");
            } else {
                setActiveSession(data.session);
                setSessionVotes(data.votes);
                setSessionRestaurants(data.restaurants);
                
                // If it's a swipe session, check where user left off? 
                // For simplicity, we start at 0, but could filter out already voted ones.
                const myDeviceId = localStorage.getItem('device_id');
                const myVotedIds = new Set(data.votes.filter(v => v.deviceId === myDeviceId).map(v => v.restaurantId));
                
                // If swipe mode, we can try to skip voted items locally?
                // Actually, let's just leave it 0-based for now or implement smart skip
                
                setView('decide');
                setJoinView(false);
            }
        } catch (e) {
            alert("Failed to join.");
        } finally {
            setLoading(false);
        }
    };

    const submitVote = async (restId: string, val: number) => {
        if (!activeSession) return;
        setMyVotes(prev => new Map(prev).set(restId, val));
        await db.submitVote(activeSession.id, restId, val);
        await refreshSession();
    };

    // Swipe Specific
    const handleSwipeVote = async (val: number) => {
        const currentRest = sessionRestaurants[swipeIndex];
        if (currentRest) {
            await submitVote(currentRest.id, val);
        }
        if (swipeIndex < sessionRestaurants.length - 1) {
            setSwipeIndex(swipeIndex + 1);
        } else {
            setSwipeFinished(true);
        }
    };

    useEffect(() => {
        let interval: number;
        if (view === 'decide' && activeSession) {
            refreshSession();
            interval = window.setInterval(refreshSession, 3000);
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
        // Simple score: Approved (+1) - Rejected (-1)
        return sessionVotes.filter(v => v.restaurantId === restId).reduce((acc, v) => acc + v.voteValue, 0);
    };

    const rankedForSession = useMemo(() => {
        const source = sessionRestaurants.length > 0 ? sessionRestaurants : restaurants;
        if (source.length === 0) return [];
        return [...source].sort((a, b) => calculateScore(b.id) - calculateScore(a.id));
    }, [sessionRestaurants, restaurants, sessionVotes]);

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
                    <button onClick={handleJoinSession} disabled={joinCode.length !== 4 || loading} className="w-full py-4 bg-primary text-white font-bold rounded-xl shadow-lg hover:scale-105 transition-transform disabled:opacity-50">
                        {loading ? <Loader className="animate-spin mx-auto" /> : 'Join'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-background-light dark:bg-background-dark">
            <div className="max-w-4xl mx-auto space-y-6">
                
                {/* Header */}
                <div className="flex items-center justify-between gap-4">
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
                         <button onClick={() => setView(view === 'list' ? 'decide' : 'list')} className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-all">
                             {view === 'list' ? 'Start Vote' : 'Back to List'}
                         </button>
                     </div>
                </div>

                {view === 'list' ? (
                    <>
                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-2.5 text-text-muted" size={18} />
                                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search restaurants..." className="w-full pl-10 pr-4 py-2 rounded-lg bg-surface-light dark:bg-surface-dark border-none focus:ring-2 focus:ring-primary" />
                            </div>
                            <div className="flex gap-2 items-center">
                                <button onClick={() => setShowArchived(!showArchived)} className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${showArchived ? 'bg-primary text-white border-primary' : 'bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark text-text-muted'}`}>
                                    {showArchived ? 'Hidden Shown' : 'Show Hidden'}
                                </button>
                                <button onClick={() => openForm()} className="bg-primary text-white p-2 rounded-lg shadow-lg hover:bg-green-600 transition-colors">
                                    <Plus size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {visibleRestaurants.map(r => (
                                <div key={r.id} onClick={() => openForm(r)} className={`bg-surface-light dark:bg-surface-dark p-4 rounded-xl border ${localArchive.has(r.id) ? 'border-dashed border-gray-300 dark:border-gray-700 opacity-60' : 'border-border-light dark:border-border-dark'} shadow-sm hover:shadow-md transition-all cursor-pointer group relative`}>
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5">
                                                <h3 className="font-bold text-lg text-text-main dark:text-white">{r.name}</h3>
                                                {r.isApproved && (
                                                    <BadgeCheck size={16} className="text-blue-500 fill-blue-100 dark:fill-blue-900/30" />
                                                )}
                                            </div>
                                            {r.location && (
                                                <div className="flex items-center gap-1 text-xs text-text-muted">
                                                    <span className="material-symbols-outlined text-[14px]">location_on</span>
                                                    {r.location}
                                                </div>
                                            )}
                                            {r.openHours && (
                                                <div className="flex items-center gap-1 text-xs text-text-muted">
                                                    <Clock size={12} />
                                                    {r.openHours}
                                                </div>
                                            )}
                                            <div className="flex gap-1 text-yellow-500 text-xs mt-1">
                                                {[1,2,3].map(s => (
                                                    <Star key={s} size={12} fill={r.stars >= s ? "currentColor" : "none"} className={r.stars >= s ? "" : "text-gray-300 dark:text-gray-600"} />
                                                ))}
                                            </div>
                                        </div>
                                        <div className="text-xs font-bold text-text-muted bg-gray-100 dark:bg-white/5 px-2 py-1 rounded">
                                            {r.price || '-'}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {r.cuisineTags.map(t => (
                                            <span key={t} className="text-[10px] uppercase font-bold text-text-muted border border-border-light dark:border-border-dark px-1.5 py-0.5 rounded">
                                                {t}
                                            </span>
                                        ))}
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
                    <div className="space-y-6 animate-in fade-in">
                        {!activeSession ? (
                            <div className="space-y-6">
                                <div className="bg-primary/10 p-6 rounded-2xl border border-primary/20">
                                    <h3 className="text-xl font-bold text-primary mb-4">Setup Vote Session</h3>
                                    
                                    {/* Mode Selector */}
                                    <div className="flex gap-4 mb-6">
                                        <button onClick={() => setSelectedMode('swipe')} className={`flex-1 p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${selectedMode === 'swipe' ? 'border-primary bg-white dark:bg-white/10 shadow-md' : 'border-transparent bg-white/50 dark:bg-white/5 hover:bg-white/80'}`}>
                                            <div className="p-2 bg-pink-100 text-pink-600 rounded-full"><Heart size={24} /></div>
                                            <span className="font-bold text-sm">Swipe Mode</span>
                                            <span className="text-xs text-text-muted">One by one</span>
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
                            <div className="space-y-4">
                                
                                {/* Info Banner */}
                                <div className="bg-primary/10 p-4 rounded-2xl border border-primary/20 text-center flex flex-col items-center gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-text-main/50 uppercase">Code:</span>
                                        <span className="text-xl font-mono font-bold tracking-widest text-primary">{activeSession.accessCode}</span>
                                    </div>
                                    <div className="bg-white p-2 rounded-lg inline-block shadow-sm">
                                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&format=svg&color=17cf54&bgcolor=ffffff&margin=0&data=${encodeURIComponent(`https://mykitchen.com?join=${activeSession.accessCode}`)}`} alt="QR" className="w-20 h-20" />
                                    </div>
                                    <button onClick={startSession} className="text-xs font-bold text-text-muted hover:text-primary underline mt-2">Restart / New Session</button>
                                </div>

                                {/* LIST VIEW MODE */}
                                {activeSession.mode === 'list' && (
                                    <div className="space-y-3">
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

                                {/* SWIPE VIEW MODE */}
                                {activeSession.mode === 'swipe' && (
                                    <div className="relative w-full h-[500px] flex flex-col items-center">
                                        {!swipeFinished && sessionRestaurants[swipeIndex] ? (
                                            <div className="w-full max-w-sm flex-1 flex flex-col relative">
                                                {/* Progress */}
                                                <div className="text-center mb-4 text-xs font-bold text-text-muted uppercase tracking-widest">
                                                    Restaurant {swipeIndex + 1} of {sessionRestaurants.length}
                                                </div>

                                                {/* Card */}
                                                <div className="flex-1 bg-surface-light dark:bg-surface-dark rounded-3xl shadow-xl border border-border-light dark:border-border-dark p-6 flex flex-col items-center justify-center text-center relative overflow-hidden animate-in zoom-in duration-300">
                                                    {/* Background Pattern/Icon */}
                                                    <div className="absolute inset-0 bg-primary/5 dark:bg-white/5 flex items-center justify-center opacity-30 pointer-events-none">
                                                        <UtensilsCrossed size={120} className="text-primary/20" />
                                                    </div>

                                                    <div className="relative z-10 w-full space-y-4">
                                                        <div>
                                                            <div className="flex items-center justify-center gap-2 mb-2">
                                                                <h2 className="text-3xl font-bold text-text-main dark:text-white leading-tight">{sessionRestaurants[swipeIndex].name}</h2>
                                                                {sessionRestaurants[swipeIndex].isApproved && <BadgeCheck size={28} className="text-blue-500 fill-white dark:fill-black" />}
                                                            </div>
                                                            <div className="flex justify-center gap-2 text-sm text-text-muted font-medium uppercase tracking-wide">
                                                                <span>{sessionRestaurants[swipeIndex].price}</span>
                                                                <span>•</span>
                                                                <span>{sessionRestaurants[swipeIndex].cuisineTags[0]}</span>
                                                            </div>
                                                        </div>

                                                        {sessionRestaurants[swipeIndex].location && (
                                                            <div className="bg-white/50 dark:bg-black/20 p-2 rounded-lg text-sm text-text-muted">
                                                                {sessionRestaurants[swipeIndex].location}
                                                            </div>
                                                        )}
                                                        
                                                        {sessionRestaurants[swipeIndex].openHours && (
                                                            <div className="flex items-center justify-center gap-2 text-xs font-bold text-text-muted">
                                                                <Clock size={14} /> {sessionRestaurants[swipeIndex].openHours}
                                                            </div>
                                                        )}

                                                        {sessionRestaurants[swipeIndex].notes && (
                                                            <p className="text-sm italic text-text-muted/80">"{sessionRestaurants[swipeIndex].notes}"</p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Actions */}
                                                <div className="flex justify-center gap-6 mt-8">
                                                    <button onClick={() => handleSwipeVote(-1)} className="size-16 rounded-full bg-white dark:bg-surface-dark border-2 border-red-100 dark:border-red-900/30 text-red-500 shadow-lg flex items-center justify-center hover:scale-110 hover:bg-red-50 transition-all"><X size={32} strokeWidth={3} /></button>
                                                    <button onClick={() => handleSwipeVote(0)} className="size-12 rounded-full bg-gray-100 dark:bg-white/10 text-gray-400 flex items-center justify-center hover:scale-110 transition-all mt-2"><SkipForward size={20} /></button>
                                                    <button onClick={() => handleSwipeVote(1)} className="size-16 rounded-full bg-primary text-white shadow-lg shadow-primary/30 flex items-center justify-center hover:scale-110 hover:bg-green-400 transition-all"><Heart size={32} fill="currentColor" /></button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="w-full max-w-sm flex-1 flex flex-col items-center justify-center text-center space-y-6 animate-in fade-in">
                                                <div className="p-6 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full">
                                                    <CheckSquare size={48} />
                                                </div>
                                                <div>
                                                    <h3 className="text-2xl font-bold">You're all done!</h3>
                                                    <p className="text-text-muted">Waiting for other votes or check results below.</p>
                                                </div>
                                                <button onClick={() => setSwipeFinished(false)} className="text-primary font-bold hover:underline flex items-center gap-1">
                                                    <RotateCcw size={16} /> Review
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Results List (Always visible in Swipe mode after finish, or just below) */}
                                {activeSession.mode === 'swipe' && (
                                    <div className="mt-8 border-t border-border-light dark:border-border-dark pt-6">
                                        <h3 className="font-bold text-lg mb-4">Live Results</h3>
                                        <div className="space-y-2">
                                            {rankedForSession.slice(0, 5).map(r => {
                                                const score = calculateScore(r.id);
                                                if (score <= 0) return null; // Only show positive results in swipe summary
                                                return (
                                                    <div key={r.id} className="flex items-center justify-between p-3 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark">
                                                        <div className="flex items-center gap-2">
                                                            <div className="bg-primary/10 text-primary font-bold px-2 py-1 rounded text-sm">+{score}</div>
                                                            <span className="font-bold">{r.name}</span>
                                                        </div>
                                                        {r.isApproved && <BadgeCheck size={16} className="text-blue-500" />}
                                                    </div>
                                                );
                                            })}
                                            {rankedForSession.every(r => calculateScore(r.id) <= 0) && (
                                                <p className="text-sm text-text-muted text-center">No mutual likes yet.</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Form Modal */}
            {isFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setIsFormOpen(false)}>
                    <div className="bg-surface-light dark:bg-surface-dark p-6 rounded-2xl w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
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
                                    <label className="text-xs font-bold text-text-muted">Stars (Personal)</label>
                                    <div className="flex gap-2 mt-2">
                                        {[1,2,3].map(s => (
                                            <button type="button" key={s} onClick={() => setFormData({...formData, stars: formData.stars === s ? 0 : s})} className={`${(formData.stars || 0) >= s ? 'text-yellow-500' : 'text-gray-300'}`}>
                                                <Star size={24} fill={(formData.stars || 0) >= s ? "currentColor" : "none"} />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <input placeholder="Location / Address" className="w-full p-2 rounded border bg-transparent dark:text-white dark:border-gray-700" value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} />
                            
                            <div className="flex gap-4">
                                <input placeholder="Open Hours (e.g. M-F 9-5)" className="flex-1 p-2 rounded border bg-transparent dark:text-white dark:border-gray-700" value={formData.openHours || ''} onChange={e => setFormData({...formData, openHours: e.target.value})} />
                                <label className="flex items-center gap-2 cursor-pointer p-2 border rounded border-border-light dark:border-border-dark select-none">
                                    <input type="checkbox" className="hidden" checked={formData.isApproved || false} onChange={e => setFormData({...formData, isApproved: e.target.checked})} />
                                    <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${formData.isApproved ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                                        {formData.isApproved && <span className="material-symbols-outlined text-white text-[14px]">check</span>}
                                    </div>
                                    <span className="text-xs font-bold text-text-muted">Verified</span>
                                </label>
                            </div>

                            <input placeholder="Cuisine Tags (comma joined)" className="w-full p-2 rounded border bg-transparent dark:text-white dark:border-gray-700" value={Array.isArray(formData.cuisineTags) ? formData.cuisineTags.join(', ') : formData.cuisineTags || ''} onChange={e => setFormData({...formData, cuisineTags: e.target.value as any})} />
                            <textarea placeholder="Notes (e.g. Get the burger)" rows={3} className="w-full p-2 rounded border bg-transparent dark:text-white dark:border-gray-700" value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} />
                            <input placeholder="Order Link (Optional)" className="w-full p-2 rounded border bg-transparent dark:text-white dark:border-gray-700" value={formData.goToOrder || ''} onChange={e => setFormData({...formData, goToOrder: e.target.value})} />

                            <div className="flex gap-2 pt-2">
                                {editingId && (
                                    <button type="button" onClick={() => handleDelete(editingId)} className="p-2 text-red-500 hover:bg-red-50 rounded">Delete</button>
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
