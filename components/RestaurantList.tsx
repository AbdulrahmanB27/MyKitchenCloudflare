
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Restaurant, VoteSession, Vote } from '../types';
import * as db from '../services/db';
import { Search, Plus, Star, UtensilsCrossed, ThumbsUp, ThumbsDown, Loader, ArrowRight, Clock, BadgeCheck, Heart, Trash2, X, RotateCcw, CheckCircle, MapPin, ExternalLink, Image as ImageIcon, Upload, Lock, Users, ChevronDown } from 'lucide-react';
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
            setOffset(0); // Reset for next card
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
                <div className="absolute top-8 left-8 z-20 border-4 border-green-500 rounded-lg px-4 py-1 transform -rotate-12 transition-opacity pointer-events-none" style={{ opacity: opacityRight }}>
                    <span className="text-green-500 font-extrabold text-3xl uppercase tracking-widest">Like</span>
                </div>
                <div className="absolute top-8 right-8 z-20 border-4 border-red-500 rounded-lg px-4 py-1 transform rotate-12 transition-opacity pointer-events-none" style={{ opacity: opacityLeft }}>
                    <span className="text-red-500 font-extrabold text-3xl uppercase tracking-widest">Nope</span>
                </div>

                {/* Image Section */}
                <div className="relative h-[60%] w-full bg-gray-200 dark:bg-gray-800">
                    {restaurant.image ? (
                        <div className="w-full h-full bg-cover bg-center pointer-events-none" style={{ backgroundImage: `url("${restaurant.image}")` }} />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary">
                            <UtensilsCrossed size={64} />
                        </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                    <div className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2">
                        {restaurant.price && (
                            <span className="px-3 py-1 bg-white/20 backdrop-blur-md border border-white/30 text-white text-xs font-bold rounded-full shadow-sm">
                                {restaurant.price}
                            </span>
                        )}
                        {restaurant.cuisineTags.slice(0, 2).map(t => (
                            <span key={t} className="px-3 py-1 bg-white/20 backdrop-blur-md border border-white/30 text-white text-xs font-bold rounded-full shadow-sm">
                                {t}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Content Section */}
                <div className="h-[40%] p-6 flex flex-col justify-between bg-surface-light dark:bg-surface-dark relative">
                    <div>
                        <div className="flex justify-between items-start gap-2">
                            <h2 className="text-2xl font-display font-extrabold text-text-main dark:text-white leading-tight line-clamp-2">{restaurant.name}</h2>
                            {restaurant.stars > 0 && (
                                <div className="flex items-center bg-yellow-100 dark:bg-yellow-900/30 px-2 py-1 rounded-lg shrink-0">
                                    <Star size={14} className="text-yellow-500 fill-yellow-500 mr-1" />
                                    <span className="text-sm font-bold text-yellow-700 dark:text-yellow-400">{restaurant.stars}</span>
                                </div>
                            )}
                        </div>
                        {restaurant.location && (
                            <div className="mt-2 flex items-center gap-1 text-text-muted text-sm font-medium">
                                <MapPin size={16} />
                                <span className="line-clamp-1">{restaurant.location}</span>
                            </div>
                        )}
                        {restaurant.notes && (
                            <div className="mt-4 p-3 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/5">
                                <p className="text-sm text-gray-600 dark:text-gray-300 italic line-clamp-2">"{restaurant.notes}"</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Floating Action Buttons */}
            <div className="absolute bottom-8 left-0 right-0 px-8 flex items-center justify-center gap-6 sm:gap-10 pointer-events-none">
                <button onClick={() => handleVote(-1)} className="group pointer-events-auto relative flex items-center justify-center size-16 rounded-full bg-white dark:bg-surface-dark shadow-xl hover:scale-110 active:scale-95 transition-all duration-200">
                    <X className="text-red-500" size={32} />
                </button>
                <button onClick={() => handleVote(0)} className="group pointer-events-auto relative flex items-center justify-center size-12 rounded-full bg-white dark:bg-surface-dark shadow-xl hover:scale-110 active:scale-95 transition-all duration-200 -mt-4">
                    <ArrowRight className="text-blue-400" size={24} />
                </button>
                <button onClick={() => handleVote(1)} className="group pointer-events-auto relative flex items-center justify-center size-16 rounded-full bg-primary shadow-xl shadow-primary/30 hover:scale-110 active:scale-95 transition-all duration-200">
                    <Heart className="text-white fill-white" size={32} />
                </button>
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
    const [isUploading, setIsUploading] = useState(false);

    // Share/Sync State
    const [targetFamilyId, setTargetFamilyId] = useState<string>('private');
    const [availableSessions, setAvailableSessions] = useState<any[]>([]);
    const currentFamilyId = db.getCurrentFamilyId();
    const pinnedFamilyId = db.getPinnedFamilyId();

    // Schedule State for Form
    const [schedDays, setSchedDays] = useState<Set<string>>(new Set(['Mo','Tu','We','Th','Fr']));
    const [schedStart, setSchedStart] = useState('11:00 AM');
    const [schedEnd, setSchedEnd] = useState('9:00 PM');

    // Archive State
    const [localArchive, setLocalArchive] = useState<Set<string>>(new Set());
    const [showArchived, setShowArchived] = useState(false);
    const [activeFilter, setActiveFilter] = useState<string>('All');

    // Vote Session State
    const [activeSession, setActiveSession] = useState<VoteSession | null>(null);
    const [sessionVotes, setSessionVotes] = useState<Vote[]>([]);
    const [myVotes, setMyVotes] = useState<Map<string, number>>(new Map()); 
    const [sessionRestaurants, setSessionRestaurants] = useState<Restaurant[]>([]); 
    const [isHost, setIsHost] = useState(false);
    
    // Sync Ref to avoid stale closures in interval
    const sessionCodeRef = useRef<string | null>(null);
    
    // Selection & Setup State
    const [selection, setSelection] = useState<Set<string>>(new Set());
    const [selectedMode, setSelectedMode] = useState<'list' | 'swipe'>('swipe');
    const [hasInitializedSelection, setHasInitializedSelection] = useState(false);

    // Swipe Mode Specific State
    const [swipeIndex, setSwipeIndex] = useState(0);
    const [swipeFinished, setSwipeFinished] = useState(false);

    useEffect(() => {
        loadData();
        const sessions = db.getSavedSessions();
        setAvailableSessions(sessions);

        const savedArchive = db.safeGetItem('archived_restaurants');
        if (savedArchive) {
            try {
                setLocalArchive(new Set(JSON.parse(savedArchive)));
            } catch (e) {}
        }

        const handleUpdates = () => loadData();
        window.addEventListener('restaurants-updated', handleUpdates);
        
        // Check URL for join code
        const params = new URLSearchParams(window.location.search);
        const code = params.get('join');
        if (code && code.length === 4) {
            setJoinCode(code);
            handleJoinSession(code);
            try {
                window.history.replaceState({}, '', window.location.pathname);
            } catch (e) {}
        }

        return () => window.removeEventListener('restaurants-updated', handleUpdates);
    }, []);

    // Keep ref updated
    useEffect(() => {
        sessionCodeRef.current = activeSession?.accessCode || null;
    }, [activeSession]);

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
        db.safeSetItem('archived_restaurants', JSON.stringify(Array.from(next)));
    };

    // --- Form Handlers ---
    const openForm = (r?: Restaurant) => {
        if (r) {
            setFormData(r);
            setEditingId(r.id);
            // Default to current context logic if editing existing
            if (currentFamilyId) setTargetFamilyId(currentFamilyId);
            else setTargetFamilyId('private');
        } else {
            setFormData({ stars: 0, price: '$$', cuisineTags: [], isApproved: false });
            setEditingId(null);
            setSchedDays(new Set(['Mo','Tu','We','Th','Fr']));
            setSchedStart('11:00 AM');
            setSchedEnd('9:00 PM');
            
            // Set default family logic for new item
            if (pinnedFamilyId) setTargetFamilyId(pinnedFamilyId);
            else if (currentFamilyId) setTargetFamilyId(currentFamilyId);
            else setTargetFamilyId('private');
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
                // familyId will be handled by upsertRestaurant based on logic below or passed explicitly
                familyId: 'global', 
                createdAt: formData.createdAt || Date.now(),
                updatedAt: Date.now(),
                cuisineTags: typeof formData.cuisineTags === 'string' ? (formData.cuisineTags as string).split(',').map(t => t.trim()).filter(Boolean) : (formData.cuisineTags || [])
            };

            if (targetFamilyId === 'private') {
                // Save locally only
                await db.upsertRestaurant(r, { localOnly: true });
            } else if (targetFamilyId === currentFamilyId) {
                // Normal sync to current family
                await db.upsertRestaurant(r); 
            } else {
                // Cross-post to another family
                await db.crossPostRestaurant(r, targetFamilyId);
                alert(`Restaurant saved to ${availableSessions.find(s => s.id === targetFamilyId)?.name}.`);
                // Do NOT await loadData() because we didn't save it to the current context
                setIsFormOpen(false);
                return;
            }

            await loadData();
            setIsFormOpen(false);
        } catch (err: any) {
            alert(`Unable to save: ${err.message}`);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        try {
            const url = await db.uploadImage(file);
            setFormData(prev => ({ ...prev, image: url }));
        } catch (error) {
            alert("Failed to upload image.");
        } finally {
            setIsUploading(false);
        }
    };

    const toggleSchedDay = (id: string) => {
        const next = new Set(schedDays);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSchedDays(next);
    };

    // --- Voting Logic ---

    const refreshSession = async () => {
        const code = sessionCodeRef.current;
        if (code) {
            try {
                const data = await db.joinSession(code);
                if (data) {
                    setActiveSession(data.session);
                    setSessionVotes(data.votes);
                    
                    const incomingRestaurants = data.restaurants || data.session.snapshot || [];
                    if (incomingRestaurants.length > 0) {
                        setSessionRestaurants(incomingRestaurants);
                    }
                    
                    const myDeviceId = db.getDeviceId();
                    const myMap = new Map<string, number>();
                    data.votes.filter(v => v.deviceId === myDeviceId).forEach(v => myMap.set(v.restaurantId, v.voteValue));
                    setMyVotes(myMap);
                }
            } catch (e) {
                console.error("Sync error", e);
            }
        }
    };

    const startSession = async () => {
        if (selection.size === 0) { alert("Please select at least one restaurant."); return; }
        setLoading(true);
        
        try {
            const subset = restaurants.filter(r => selection.has(r.id));
            if (subset.length === 0) throw new Error("Selection invalid.");

            // Optimistic update
            setSessionRestaurants(subset);
            setView('decide');
            setSessionVotes([]);
            setSwipeIndex(0);
            setSwipeFinished(false);
            setIsHost(true);

            // Create session in background
            const session = await db.createVoteSession(subset, selectedMode);
            if (!session) {
                // Revert if failed
                alert("Failed to create session.");
                setView('list');
                return;
            }
            
            setActiveSession(session);
        } catch (e: any) {
            alert(`Failed to start session: ${e.message}`);
            setView('list');
            setIsHost(false); // Reset host status on error
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
                setSessionRestaurants(data.restaurants || data.session.snapshot || []);
                setSwipeIndex(0); 
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
        if (isHost && activeSession) {
            if (confirm("End this session for everyone?")) {
                db.endSession(activeSession.id);
            } else {
                return;
            }
        }
        
        setActiveSession(null);
        setSessionVotes([]);
        setSessionRestaurants([]);
        setMyVotes(new Map());
        setIsHost(false);
        setView('list');
        setSwipeIndex(0);
        setSwipeFinished(false);
        try {
            window.history.replaceState({}, '', window.location.pathname);
        } catch (e) {
            // Ignore security errors in restricted envs
        }
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

    useEffect(() => {
        let interval: number;
        if (view === 'decide' && activeSession) {
            refreshSession(); 
            interval = window.setInterval(refreshSession, 2000); 
        }
        return () => clearInterval(interval);
    }, [view, activeSession?.id]);


    // --- Filtering & Sorting ---
    const allCuisines = useMemo(() => {
        const tags = new Set<string>();
        restaurants.forEach(r => r.cuisineTags.forEach(t => tags.add(t)));
        return ['All', ...Array.from(tags).sort()];
    }, [restaurants]);

    const visibleRestaurants = useMemo(() => {
        return restaurants.filter(r => {
            if (!showArchived && localArchive.has(r.id)) return false;
            if (activeFilter !== 'All' && !r.cuisineTags.includes(activeFilter)) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                return r.name.toLowerCase().includes(q) || r.cuisineTags.some(t => t.toLowerCase().includes(q));
            }
            return true;
        }).sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name));
    }, [restaurants, localArchive, showArchived, searchQuery, activeFilter]);

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
            
            {/* STICKY HEADER */}
            <header className="sticky top-0 z-40 w-full bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-border-light dark:border-border-dark transition-colors duration-300">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-20 gap-4">
                        <div className="flex items-center gap-3 shrink-0">
                            {onOpenMenu && (
                                <button onClick={onOpenMenu} className="md:hidden p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10">
                                    <span className="material-symbols-outlined">menu</span>
                                </button>
                            )}
                            <div className="size-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary/30 rotate-3">
                                <span className="material-symbols-outlined text-2xl">restaurant_menu</span>
                            </div>
                            <h2 className="text-text-main dark:text-white text-2xl font-display font-bold tracking-tight hidden sm:block">Eat Out</h2>
                        </div>
                        
                        {view === 'list' && (
                            <div className="flex flex-1 justify-center max-w-lg mx-4">
                                <div className="w-full relative group">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Search size={18} className="text-text-muted group-focus-within:text-primary transition-colors"/>
                                    </div>
                                    <input 
                                        value={searchQuery} 
                                        onChange={e => setSearchQuery(e.target.value)} 
                                        className="block w-full pl-10 pr-4 py-3 border-none rounded-2xl leading-5 bg-surface-light dark:bg-surface-dark text-text-main dark:text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 shadow-sm transition-all" 
                                        placeholder="Search restaurants..." 
                                        type="text"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                            {view === 'list' && (
                                <button onClick={() => setJoinView(true)} className="hidden sm:flex bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-all text-text-muted">
                                    Join Code
                                </button>
                            )}
                            {view === 'decide' && (
                                <button onClick={handleBackToList} className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-all text-red-500 hover:text-red-600 border-red-200 dark:border-red-900/30">
                                    {isHost ? 'End' : 'Exit'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* MAIN CONTENT AREA */}
            <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 scroll-smooth">
                <div className="max-w-7xl mx-auto h-full flex flex-col">
                    
                    {view === 'list' ? (
                        <>
                            {/* Horizontal Filters */}
                            <div className="flex overflow-x-auto hide-scrollbar gap-2 pb-6 sticky top-0 z-30 bg-background-light dark:bg-background-dark pt-2 -mx-4 px-4 sm:mx-0 sm:px-0 mask-image-linear-gradient">
                                {allCuisines.map(tag => (
                                    <button 
                                        key={tag}
                                        onClick={() => setActiveFilter(tag)}
                                        className={`flex shrink-0 items-center justify-center gap-x-2 rounded-2xl px-4 py-2 border border-transparent shadow-sm hover:shadow-md transition-all ${activeFilter === tag ? 'bg-text-main dark:bg-white text-white dark:text-text-main font-bold transform -translate-y-0.5 shadow-lg' : 'bg-surface-light dark:bg-surface-dark text-text-main dark:text-white hover:border-primary/30'}`}
                                    >
                                        <span className="text-sm font-medium font-display">{tag}</span>
                                    </button>
                                ))}
                                <div className="w-[1px] bg-border-light dark:border-border-dark mx-2"></div>
                                <button onClick={() => setShowArchived(!showArchived)} className={`flex shrink-0 items-center justify-center gap-x-2 rounded-2xl px-4 py-2 border transition-all ${showArchived ? 'bg-primary text-white border-primary' : 'bg-surface-light dark:bg-surface-dark text-text-muted border-transparent shadow-sm'}`}>
                                    <span className="text-sm font-medium font-display">Archived</span>
                                </button>
                            </div>

                            {/* Restaurant Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-24">
                                {visibleRestaurants.map(r => (
                                    <div key={r.id} onClick={() => openForm(r)} className="bg-surface-light dark:bg-surface-dark rounded-3xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group relative flex flex-col h-full border-2 border-transparent hover:border-primary/20 cursor-pointer">
                                        <div className="relative h-48 overflow-hidden bg-gray-200 dark:bg-gray-800">
                                            {r.image ? (
                                                <div className="w-full h-full bg-cover bg-center transform group-hover:scale-110 transition-transform duration-700" style={{ backgroundImage: `url("${r.image}")` }}></div>
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <UtensilsCrossed size={48} className="text-gray-400" />
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); /* Favorite Logic later */ }} 
                                                className="absolute top-4 right-4 size-10 flex items-center justify-center bg-white/90 dark:bg-black/50 backdrop-blur-sm rounded-full shadow-lg hover:scale-110 transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <Star className="text-yellow-500 fill-yellow-500" size={20} />
                                            </button>
                                            <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                                                {r.cuisineTags[0] && (
                                                    <span className="px-3 py-1 bg-white/90 dark:bg-black/80 backdrop-blur-md text-text-main dark:text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-sm">
                                                        {r.cuisineTags[0]}
                                                    </span>
                                                )}
                                                {r.stars > 0 && (
                                                    <div className="flex gap-0.5 text-yellow-400 drop-shadow-md">
                                                        {Array.from({length: r.stars}).map((_, i) => <Star key={i} size={16} fill="currentColor" />)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="p-5 flex flex-col flex-1">
                                            <div className="flex justify-between items-start gap-2 mb-1">
                                                <h3 className="text-text-main dark:text-white text-xl font-display font-bold leading-tight">{r.name}</h3>
                                                <span className="text-text-main dark:text-gray-400 font-bold text-sm">{r.price}</span>
                                            </div>
                                            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4 line-clamp-2">{r.notes || "No notes available."}</p>
                                            <div className="mt-auto flex items-center justify-between pt-4 border-t border-border-light dark:border-border-dark">
                                                <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                                                    <MapPin size={16} />
                                                    <span className="text-xs font-semibold max-w-[100px] truncate">{r.location || 'Unknown loc'}</span>
                                                </div>
                                                {r.isApproved && <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-md">Verified</span>}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="h-full flex flex-col">
                            {!activeSession ? (
                                // SETUP SCREEN
                                <div className="w-full max-w-md mx-auto bg-surface-light dark:bg-surface-dark rounded-3xl shadow-xl overflow-hidden flex flex-col h-[85vh] max-h-[800px] relative border border-border-light dark:border-border-dark">
                                    <header className="pt-8 px-6 pb-2 shrink-0 text-center">
                                        <div className="inline-flex items-center justify-center size-12 rounded-full bg-primary/10 text-primary mb-4">
                                            <UtensilsCrossed size={24} />
                                        </div>
                                        <h1 className="font-display text-3xl font-extrabold text-text-main dark:text-white tracking-tight mb-2">Swipe to Decide</h1>
                                        <p className="text-text-muted text-sm leading-relaxed px-4">
                                            Pick what you like, discard what you don't.
                                        </p>
                                    </header>
                                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-8">
                                        <section>
                                            <div className="flex items-center justify-between mb-3">
                                                <h3 className="font-display font-bold text-lg text-text-main dark:text-white">Pool Selection</h3>
                                                <div className="flex gap-2">
                                                    <button onClick={selectAll} className="text-xs font-medium text-primary hover:underline">All</button>
                                                    <button onClick={selectNone} className="text-xs font-medium text-primary hover:underline">None</button>
                                                </div>
                                            </div>
                                            <div className="max-h-40 overflow-y-auto border border-border-light dark:border-border-dark rounded-xl p-2 bg-background-light dark:bg-background-dark">
                                                {visibleRestaurants.map(r => (
                                                    <div key={r.id} onClick={() => toggleSelect(r.id)} className={`flex items-center gap-2 p-2 rounded cursor-pointer ${selection.has(r.id) ? 'bg-primary/10 text-primary' : 'text-text-muted'}`}>
                                                        <div className={`size-4 rounded-full border ${selection.has(r.id) ? 'bg-primary border-primary' : 'border-gray-400'}`}></div>
                                                        <span className="text-sm font-bold truncate">{r.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                        <section>
                                            <h3 className="font-display font-bold text-lg text-text-main dark:text-white mb-3">Game Mode</h3>
                                            <div className="grid grid-cols-2 gap-4">
                                                <button onClick={() => setSelectedMode('swipe')} className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${selectedMode === 'swipe' ? 'border-primary bg-primary/5 text-primary' : 'border-border-light dark:border-border-dark text-text-muted'}`}>
                                                    <Heart size={24} />
                                                    <span className="font-bold text-sm">Swipe</span>
                                                </button>
                                                <button onClick={() => setSelectedMode('list')} className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${selectedMode === 'list' ? 'border-primary bg-primary/5 text-primary' : 'border-border-light dark:border-border-dark text-text-muted'}`}>
                                                    <ThumbsUp size={24} />
                                                    <span className="font-bold text-sm">List</span>
                                                </button>
                                            </div>
                                        </section>
                                    </div>
                                    <div className="p-6 bg-surface-light dark:bg-surface-dark border-t border-border-light dark:border-border-dark">
                                        <div className="flex flex-col items-center gap-4">
                                            <span className="text-sm font-semibold text-text-muted bg-gray-100 dark:bg-white/5 px-3 py-1 rounded-full animate-pulse">
                                                ✨ {selection.size} restaurants selected
                                            </span>
                                            <button onClick={startSession} disabled={selection.size === 0 || loading} className="w-full bg-primary hover:bg-green-600 text-white font-display font-bold text-lg py-4 rounded-2xl shadow-lg transform transition hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2 group disabled:opacity-50">
                                                {loading ? <Loader className="animate-spin" /> : 'Start Session'}
                                                <ArrowRight className="group-hover:translate-x-1 transition-transform" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* ACTIVE SESSION */
                                <div className="flex-1 flex flex-col h-full max-w-3xl mx-auto w-full">
                                    <div className="flex-none px-4 py-2 flex items-center justify-between">
                                        <div className="flex items-center gap-2 bg-white/80 dark:bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-border-light dark:border-border-dark shadow-sm">
                                            <span className="size-2 rounded-full bg-green-400 animate-pulse"></span>
                                            <span className="text-xs font-semibold tracking-wide uppercase text-text-muted">Code: {activeSession.accessCode}</span>
                                        </div>
                                        <div className="font-bold text-text-muted tracking-widest text-sm">
                                            <span className="text-text-main dark:text-white text-lg">{Math.min(swipeIndex + 1, sessionRestaurants.length)}</span> / {sessionRestaurants.length}
                                        </div>
                                    </div>

                                    {(activeSession.mode === 'list' || (!activeSession.mode && selectedMode === 'list')) ? (
                                        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
                                            <div className="text-center mb-4">
                                                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-sm font-bold mb-3">
                                                    <span className="material-symbols-outlined text-lg">celebration</span>
                                                    Live Rankings
                                                </div>
                                                <h2 className="text-3xl font-black text-text-main dark:text-white mb-2">Family Picks</h2>
                                            </div>
                                            
                                            {rankedForSession.map((r, idx) => {
                                                const score = calculateScore(r.id);
                                                const myVote = myVotes.get(r.id);
                                                return (
                                                    <div key={r.id} className="bg-surface-light dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 relative group border border-border-light dark:border-border-dark">
                                                        {idx === 0 && score > 0 && (
                                                            <div className="absolute top-4 right-4 z-10 bg-white/95 dark:bg-black/80 backdrop-blur text-primary px-3 py-1.5 rounded-lg font-bold shadow-sm flex items-center gap-1">
                                                                <Heart size={16} fill="currentColor" /> Top Match
                                                            </div>
                                                        )}
                                                        <div className="grid sm:grid-cols-3 gap-0 h-full">
                                                            <div className="relative h-32 sm:h-auto overflow-hidden bg-gray-200 dark:bg-gray-800">
                                                                {r.image ? (
                                                                    <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url("${r.image}")` }}></div>
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center"><UtensilsCrossed className="text-gray-400"/></div>
                                                                )}
                                                            </div>
                                                            <div className="sm:col-span-2 p-5 flex flex-col justify-center">
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <div>
                                                                        <h3 className="text-xl font-bold text-text-main dark:text-white">{r.name}</h3>
                                                                        <p className="text-text-muted text-sm font-medium">{r.cuisineTags.join(', ')} • {r.price}</p>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <button onClick={() => submitVote(r.id, -1)} className={`p-2 rounded-full ${myVote === -1 ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-white/5 text-gray-400'}`}><ThumbsDown size={18}/></button>
                                                                        <button onClick={() => submitVote(r.id, 1)} className={`p-2 rounded-full ${myVote === 1 ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-white/5 text-gray-400'}`}><ThumbsUp size={18}/></button>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-2">
                                                                    <div className="flex items-center gap-1 text-green-600 dark:text-green-400 font-bold bg-green-50 dark:bg-green-900/10 px-2 py-1 rounded">
                                                                        <ThumbsUp size={14} /> {sessionVotes.filter(v => v.restaurantId === r.id && v.voteValue === 1).length}
                                                                    </div>
                                                                    <div className="flex items-center gap-1 text-red-500 dark:text-red-400 font-bold bg-red-50 dark:bg-red-900/10 px-2 py-1 rounded">
                                                                        <ThumbsDown size={14} /> {sessionVotes.filter(v => v.restaurantId === r.id && v.voteValue === -1).length}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        // SWIPE STACK
                                        <div className="flex-1 w-full max-w-md mx-auto px-4 flex flex-col justify-center relative pb-24">
                                            {sessionRestaurants.length === 0 ? (
                                                <div className="text-center text-text-muted">
                                                    {loading ? <><Loader className="animate-spin inline mr-2"/> Loading...</> : "No restaurants found for session."}
                                                </div>
                                            ) : swipeFinished ? (
                                                <div className="text-center space-y-4 animate-in zoom-in">
                                                    <div className="inline-flex p-6 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full">
                                                        <CheckCircle size={48} />
                                                    </div>
                                                    <h3 className="text-2xl font-bold dark:text-white">All Caught Up!</h3>
                                                    <p className="text-text-muted">Waiting for others to vote...</p>
                                                    <button onClick={() => { setSwipeIndex(0); setSwipeFinished(false); }} className="text-primary font-bold hover:underline flex items-center justify-center gap-2">
                                                        <RotateCcw size={16} /> Review Again
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="relative w-full aspect-[3/4]">
                                                    {/* Next Card Placeholder */}
                                                    {swipeIndex + 1 < sessionRestaurants.length && (
                                                        <div className="absolute inset-0 bg-surface-light dark:bg-surface-dark rounded-3xl shadow-xl transform scale-95 translate-y-4 opacity-50 border border-border-light dark:border-border-dark"></div>
                                                    )}
                                                    {/* Active Card */}
                                                    <SwipeableCard 
                                                        key={sessionRestaurants[swipeIndex]?.id || 'loading'}
                                                        restaurant={sessionRestaurants[swipeIndex]} 
                                                        onVote={(val) => submitVote(sessionRestaurants[swipeIndex].id, val)}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* Bottom Floating Actions */}
            {view === 'list' && (
                <>
                    {/* Gradient Fade for scroll content underneath */}
                    <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background-light dark:from-background-dark to-transparent pointer-events-none z-20"></div>

                    {/* Centered Decide Button */}
                    <div className="absolute bottom-6 left-0 right-0 flex justify-center z-30 pointer-events-none">
                        <button onClick={() => setView('decide')} className="pointer-events-auto flex items-center justify-center h-14 px-8 rounded-full bg-primary hover:bg-green-600 text-white shadow-xl shadow-primary/30 hover:scale-105 transition-all duration-300 gap-3 group">
                            <UtensilsCrossed size={24} className="animate-pulse" />
                            <span className="text-lg font-display font-bold tracking-wide">Help us Decide!</span>
                        </button>
                    </div>

                    {/* Right Add Button */}
                    <button onClick={() => openForm()} className="absolute bottom-6 right-6 size-14 bg-primary text-white rounded-full shadow-xl flex items-center justify-center hover:scale-105 transition-transform z-30 pointer-events-auto">
                        <Plus size={28} />
                    </button>
                </>
            )}

            {/* Form Modal */}
            {isFormOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setIsFormOpen(false)}>
                    <div className="bg-surface-light dark:bg-surface-dark p-6 rounded-2xl w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto border border-border-light dark:border-border-dark shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold dark:text-white">{editingId ? 'Edit Restaurant' : 'Add Restaurant'}</h2>
                        
                        <form onSubmit={handleSave} className="space-y-4">
                            {/* Basics & Share Control */}
                            <div className="flex items-center justify-between border-b border-border-light dark:border-border-dark pb-2">
                                <h3 className="text-sm font-bold text-primary">Basics</h3>
                                
                                {/* Family Selector */}
                                <div className="relative group">
                                    <select 
                                        value={targetFamilyId} 
                                        onChange={(e) => setTargetFamilyId(e.target.value)}
                                        className="appearance-none pl-9 pr-8 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary font-bold text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    >
                                        <option value="private">Private (Device Only)</option>
                                        {availableSessions.map(s => (
                                            <option key={s.id} value={s.id}>{s.name} {s.id === currentFamilyId ? '(Current)' : ''}</option>
                                        ))}
                                    </select>
                                    <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-primary">
                                        {targetFamilyId === 'private' ? <Lock size={14} /> : <Users size={14} />}
                                    </div>
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-primary">
                                        <ChevronDown size={14} />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-text-muted uppercase">Name</label>
                                <input required placeholder="Restaurant Name" className="w-full p-3 rounded-xl border border-border-light dark:border-border-dark bg-background-light dark:bg-black/20 focus:ring-2 focus:ring-primary outline-none dark:text-white" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-text-muted uppercase">Price</label>
                                    <select 
                                        className="w-full p-3 rounded-xl border border-border-light dark:border-border-dark bg-background-light dark:bg-black/20 text-text-main dark:text-white outline-none" 
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
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-text-muted uppercase">Rating & Verification</label>
                                    <div className="flex items-center gap-4 mt-2">
                                        <div className="flex gap-1">
                                            {[1,2,3].map(s => (
                                                <button type="button" key={s} onClick={() => setFormData({...formData, stars: formData.stars === s ? 0 : s})} className={`${(formData.stars || 0) >= s ? 'text-yellow-500' : 'text-gray-300'}`}>
                                                    <Star size={24} fill={(formData.stars || 0) >= s ? "currentColor" : "none"} />
                                                </button>
                                            ))}
                                        </div>
                                        
                                        {/* Verified Toggle Inline */}
                                        <button 
                                            type="button"
                                            onClick={() => setFormData({...formData, isApproved: !formData.isApproved})}
                                            className="flex items-center justify-center p-1 focus:outline-none"
                                            title="Toggle Verified Status"
                                        >
                                            <CheckCircle 
                                                size={24} 
                                                className={`transition-colors ${formData.isApproved ? 'text-blue-500 fill-blue-500/10' : 'text-gray-300 hover:text-gray-400'}`}
                                            />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-text-muted uppercase">Image URL or Upload</label>
                                <div className="flex gap-2">
                                    <input placeholder="https://..." className="flex-1 p-3 rounded-xl border border-border-light dark:border-border-dark bg-background-light dark:bg-black/20 outline-none dark:text-white" value={formData.image || ''} onChange={e => setFormData({...formData, image: e.target.value})} disabled={isUploading} />
                                    <label className={`p-3 border border-border-light dark:border-border-dark rounded-xl cursor-pointer transition-colors flex items-center justify-center ${isUploading ? 'bg-gray-100 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-white/5 bg-background-light dark:bg-black/20'}`}>
                                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={isUploading} />
                                        {isUploading ? <Loader className="animate-spin text-primary" size={20} /> : <Upload size={20} className="text-primary" />}
                                    </label>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-text-muted uppercase">Location</label>
                                <input placeholder="e.g. Downtown" className="w-full p-3 rounded-xl border border-border-light dark:border-border-dark bg-background-light dark:bg-black/20 outline-none dark:text-white" value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-text-muted uppercase">Tags</label>
                                <input placeholder="Italian, Pizza, Casual..." className="w-full p-3 rounded-xl border border-border-light dark:border-border-dark bg-background-light dark:bg-black/20 outline-none dark:text-white" value={Array.isArray(formData.cuisineTags) ? formData.cuisineTags.join(', ') : formData.cuisineTags || ''} onChange={e => setFormData({...formData, cuisineTags: e.target.value as any})} />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-text-muted uppercase">Notes</label>
                                <textarea placeholder="Best pasta in town..." rows={3} className="w-full p-3 rounded-xl border border-border-light dark:border-border-dark bg-background-light dark:bg-black/20 outline-none dark:text-white resize-none" value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} />
                            </div>

                            <div className="flex gap-3 pt-4">
                                {editingId && (
                                    <button type="button" onClick={() => handleDelete(editingId)} className="p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors">
                                        <Trash2 size={20} />
                                    </button>
                                )}
                                <button type="button" onClick={() => setIsFormOpen(false)} className="flex-1 py-3 text-text-muted font-bold hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl">Cancel</button>
                                <button type="submit" className="flex-1 py-3 bg-primary hover:bg-green-600 text-white rounded-xl font-bold shadow-lg">Save</button>
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
