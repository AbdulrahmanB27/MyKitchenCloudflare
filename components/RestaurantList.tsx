
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Restaurant, VoteSession, Vote } from '../types';
import * as db from '../services/db';
import { Search, Plus, Star, UtensilsCrossed, ThumbsUp, ThumbsDown, Loader, ArrowRight, Clock, BadgeCheck, Heart, Trash2, X, RotateCcw, CheckCircle, MapPin, ExternalLink, Image as ImageIcon, Upload, Lock, Users, ChevronDown, Hand, Play, WifiOff, BarChart3, Trophy } from 'lucide-react';
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
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [result, setResult] = useState<'like' | 'nope' | 'skip' | null>(null);
    const [animating, setAnimating] = useState(false);
    
    const startPos = useRef({ x: 0, y: 0 });
    const cardRef = useRef<HTMLDivElement>(null);

    const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
        if (animating) return;
        setIsDragging(true);
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        startPos.current = { x: clientX, y: clientY };
    };

    const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (!isDragging || animating) return;
        
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        
        const deltaX = clientX - startPos.current.x;
        const deltaY = clientY - startPos.current.y;

        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            setOffset({ x: deltaX, y: deltaY * 0.2 }); 
        } else {
            setOffset({ x: deltaX * 0.2, y: deltaY });
        }
    };

    const handleTouchEnd = () => {
        if (!isDragging || animating) return;
        setIsDragging(false);
        
        const threshold = 100; 
        
        if (offset.x > threshold) {
            finishVote(1); 
        } else if (offset.x < -threshold) {
            finishVote(-1); 
        } else if (Math.abs(offset.y) > threshold) {
            finishVote(0); 
        } else {
            setOffset({ x: 0, y: 0 });
        }
    };

    const finishVote = (val: number) => {
        if (animating) return;
        setAnimating(true);
        let endX = 0;
        let endY = 0;
        
        if (val === 1) { endX = 1000; setResult('like'); }
        else if (val === -1) { endX = -1000; setResult('nope'); }
        else { endY = offset.y > 0 ? 1000 : -1000; setResult('skip'); }

        setOffset({ x: endX, y: endY });
        
        setTimeout(() => {
            onVote(val);
        }, 300);
    };

    const opacityRight = Math.min(Math.max(offset.x / 100, 0), 1);
    const opacityLeft = Math.min(Math.max(-offset.x / 100, 0), 1);
    const opacitySkip = Math.min(Math.max(Math.abs(offset.y) / 100, 0), 1);
    const rotation = offset.x / 15;

    return (
        <div className="absolute inset-0 flex items-center justify-center p-4">
            <div 
                ref={cardRef}
                className="w-full max-w-sm aspect-[3/4] bg-surface-light dark:bg-surface-dark rounded-3xl shadow-xl border border-border-light dark:border-border-dark overflow-hidden relative touch-none select-none cursor-grab active:cursor-grabbing z-20"
                style={{ 
                    transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg)`,
                    transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)',
                    opacity: result ? 0 : 1
                }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onMouseDown={handleTouchStart}
                onMouseMove={handleTouchMove}
                onMouseUp={handleTouchEnd}
                onMouseLeave={handleTouchEnd}
            >
                <div className="absolute top-8 left-8 z-30 border-4 border-green-500 rounded-lg px-4 py-1 transform -rotate-12 transition-opacity pointer-events-none bg-green-500/10 backdrop-blur-sm" style={{ opacity: opacityRight }}>
                    <span className="text-green-500 font-extrabold text-3xl uppercase tracking-widest">Like</span>
                </div>
                <div className="absolute top-8 right-8 z-30 border-4 border-red-500 rounded-lg px-4 py-1 transform rotate-12 transition-opacity pointer-events-none bg-red-500/10 backdrop-blur-sm" style={{ opacity: opacityLeft }}>
                    <span className="text-red-500 font-extrabold text-3xl uppercase tracking-widest">Nope</span>
                </div>
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 border-4 border-blue-400 rounded-lg px-4 py-1 transition-opacity pointer-events-none bg-blue-400/10 backdrop-blur-sm" style={{ opacity: opacitySkip }}>
                    <span className="text-blue-400 font-extrabold text-3xl uppercase tracking-widest">Skip</span>
                </div>

                <div className="relative h-[60%] w-full bg-gray-200 dark:bg-gray-800 pointer-events-none">
                    {restaurant.image ? (
                        <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url("${restaurant.image}")` }} />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary">
                            <UtensilsCrossed size={64} />
                        </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                </div>

                <div className="h-[40%] p-6 flex flex-col justify-between bg-surface-light dark:bg-surface-dark relative pointer-events-none">
                    <div>
                        <div className="flex justify-between items-start gap-2">
                            <h2 className="text-2xl font-display font-extrabold text-text-main dark:text-white leading-tight line-clamp-2">{restaurant.name}</h2>
                        </div>
                        {restaurant.cuisineTags[0] && <p className="text-primary text-sm font-bold uppercase tracking-wider">{restaurant.cuisineTags.join(', ')}</p>}
                        {restaurant.notes && (
                            <div className="mt-2 p-3 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/5">
                                <p className="text-sm text-gray-600 dark:text-gray-300 italic line-clamp-2">"{restaurant.notes}"</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="absolute bottom-8 left-0 right-0 px-8 flex items-center justify-center gap-6 sm:gap-10 pointer-events-auto z-10">
                <button onClick={() => finishVote(-1)} disabled={animating} className="group pointer-events-auto relative flex items-center justify-center size-16 rounded-full bg-white dark:bg-surface-dark shadow-xl hover:scale-110 active:scale-95 transition-all duration-200 border border-gray-100 dark:border-gray-800">
                    <X className="text-red-500" size={32} />
                </button>
                <button onClick={() => finishVote(0)} disabled={animating} className="group pointer-events-auto relative flex items-center justify-center size-12 rounded-full bg-white dark:bg-surface-dark shadow-xl hover:scale-110 active:scale-95 transition-all duration-200 -mt-4 border border-gray-100 dark:border-gray-800">
                    <ArrowRight className="text-blue-400" size={24} />
                </button>
                <button onClick={() => finishVote(1)} disabled={animating} className="group pointer-events-auto relative flex items-center justify-center size-16 rounded-full bg-primary shadow-xl shadow-primary/30 hover:scale-110 active:scale-95 transition-all duration-200">
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
    const [showResults, setShowResults] = useState(false); 
    
    const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    
    const [showAuth, setShowAuth] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [formData, setFormData] = useState<Partial<Restaurant>>({});
    const [isUploading, setIsUploading] = useState(false);

    const [targetFamilyId, setTargetFamilyId] = useState<string>('private');
    const [availableSessions, setAvailableSessions] = useState<any[]>([]);
    const currentFamilyId = db.getCurrentFamilyId();
    const pinnedFamilyId = db.getPinnedFamilyId();

    const [schedDays, setSchedDays] = useState<Set<string>>(new Set(['Mo','Tu','We','Th','Fr']));
    const [schedStart, setSchedStart] = useState('11:00 AM');
    const [schedEnd, setSchedEnd] = useState('9:00 PM');

    const [localArchive, setLocalArchive] = useState<Set<string>>(new Set());
    const [showArchived, setShowArchived] = useState(false);
    const [activeFilter, setActiveFilter] = useState<string>('All');

    const [activeSession, setActiveSession] = useState<VoteSession | null>(null);
    const [sessionVotes, setSessionVotes] = useState<Vote[]>([]);
    const [myVotes, setMyVotes] = useState<Map<string, number>>(new Map()); 
    const [sessionRestaurants, setSessionRestaurants] = useState<Restaurant[]>([]); 
    const [isHost, setIsHost] = useState(false);
    
    const sessionCodeRef = useRef<string | null>(null);
    const [selection, setSelection] = useState<Set<string>>(new Set());
    const [selectedMode, setSelectedMode] = useState<'list' | 'swipe'>('swipe');
    const [hasInitializedSelection, setHasInitializedSelection] = useState(false);

    const [swipeIndex, setSwipeIndex] = useState(0);
    const [swipeFinished, setSwipeFinished] = useState(false);

    useEffect(() => {
        loadData();
        setAvailableSessions(db.getSavedSessions());
        const savedArchive = db.safeGetItem('archived_restaurants');
        if (savedArchive) { try { setLocalArchive(new Set(JSON.parse(savedArchive))); } catch (e) {} }
        const handleUpdates = () => loadData();
        window.addEventListener('restaurants-updated', handleUpdates);
        
        const params = new URLSearchParams(window.location.search);
        const code = params.get('join');
        if (code && code.length === 4) { setJoinCode(code); handleJoinSession(code); }

        return () => window.removeEventListener('restaurants-updated', handleUpdates);
    }, []);

    useEffect(() => { sessionCodeRef.current = activeSession?.accessCode || null; }, [activeSession]);

    const loadData = async () => {
        const data = await db.getRestaurants();
        setRestaurants(data);
        setLoading(false);
    };

    useEffect(() => {
        if (!activeSession && restaurants.length > 0 && !hasInitializedSelection) {
            const activeIds = restaurants.filter(r => !localArchive.has(r.id)).map(r => r.id);
            setSelection(new Set(activeIds));
            setHasInitializedSelection(true);
        }
    }, [restaurants, activeSession, localArchive, hasInitializedSelection]);

    const startSession = async () => {
        if (selection.size === 0) { alert("Please select at least one restaurant."); return; }
        setLoading(true);
        try {
            const subset = restaurants.filter(r => selection.has(r.id));
            setSessionRestaurants(subset);
            setSessionVotes([]);
            setSwipeIndex(0);
            setSwipeFinished(false);
            setIsHost(true);
            setShowResults(false);
            const session = await db.createVoteSession(subset, selectedMode);
            if (session) setActiveSession(session);
        } catch (e: any) {
            alert(`Failed to start: ${e.message}`);
            setView('list');
        } finally { setLoading(false); }
    };

    const handleJoinSession = async (codeOverride?: string) => {
        const code = codeOverride || joinCode;
        if (code.length !== 4) return alert("Please enter a 4-character code.");
        setLoading(true);
        try {
            const data = await db.joinSession(code);
            if (data) {
                setActiveSession(data.session);
                setSessionVotes(data.votes);
                setSessionRestaurants(data.restaurants || []);
                setSwipeIndex(0); 
                setSwipeFinished(false);
                setView('decide');
                setJoinView(false);
                setIsHost(false);
                setShowResults(false);
                if (data.session.mode) setSelectedMode(data.session.mode);
            }
        } catch (e) { alert("Failed to join."); } finally { setLoading(false); }
    };

    const submitVote = async (restId: string, val: number) => {
        if (!activeSession) return;
        setMyVotes(prev => new Map(prev).set(restId, val));
        const currentMode = activeSession.mode || selectedMode;
        if (currentMode === 'swipe') {
            if (swipeIndex < sessionRestaurants.length - 1) setSwipeIndex(prev => prev + 1);
            else setSwipeFinished(true);
        }
        await db.submitVote(activeSession.id, restId, val);
        refreshSession();
    };

    const refreshSession = async () => {
        const code = sessionCodeRef.current;
        if (code) {
            const data = await db.joinSession(code);
            if (data) {
                setActiveSession(data.session);
                setSessionVotes(data.votes);
                const myDeviceId = db.getDeviceId();
                const myMap = new Map<string, number>();
                data.votes.filter(v => v.deviceId === myDeviceId).forEach(v => myMap.set(v.restaurantId, v.voteValue));
                setMyVotes(myMap);
            }
        }
    };

    useEffect(() => {
        let interval: number;
        if (view === 'decide' && activeSession) {
            refreshSession(); 
            interval = window.setInterval(refreshSession, 2000); 
        }
        return () => clearInterval(interval);
    }, [view, activeSession?.id]);

    const calculateScore = (restId: string) => sessionVotes.filter(v => v.restaurantId === restId).reduce((acc, v) => acc + v.voteValue, 0);
    
    const rankedForSession = useMemo(() => {
        return [...sessionRestaurants].sort((a, b) => calculateScore(b.id) - calculateScore(a.id));
    }, [sessionRestaurants, sessionVotes]);

    if (joinView) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background-light dark:bg-background-dark">
                <div className="w-full max-w-sm space-y-6 text-center">
                    <button onClick={() => setJoinView(false)} className="absolute top-4 left-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <h2 className="text-2xl font-bold dark:text-white">Join Session</h2>
                    <input type="text" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} className="w-full text-center text-4xl font-mono tracking-widest p-4 rounded-xl border-2 border-primary bg-surface-light dark:bg-surface-dark dark:text-white uppercase outline-none" placeholder="ABCD" maxLength={4} autoFocus />
                    <button onClick={() => handleJoinSession()} disabled={joinCode.length !== 4 || loading} className="w-full py-4 bg-primary text-white font-bold rounded-xl shadow-lg disabled:opacity-50">
                        {loading ? <Loader className="animate-spin mx-auto" /> : 'Join'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-background-light dark:bg-background-dark">
            <header className="sticky top-0 z-40 w-full bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-border-light dark:border-border-dark">
                <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        {onOpenMenu && <button onClick={onOpenMenu} className="md:hidden p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10"><span className="material-symbols-outlined">menu</span></button>}
                        <div className="size-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg rotate-3"><UtensilsCrossed size={24} /></div>
                        <h2 className="text-text-main dark:text-white text-2xl font-display font-bold tracking-tight hidden sm:block">Eat Out</h2>
                    </div>
                    {view === 'decide' && activeSession && (
                        <div className="flex gap-2">
                            <button onClick={() => setShowResults(!showResults)} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-all ${showResults ? 'bg-primary text-white' : 'bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-muted hover:text-primary'}`}>
                                <BarChart3 size={18} /><span className="hidden sm:inline">{showResults ? 'Hide Results' : 'Results'}</span>
                            </button>
                            <button onClick={() => { setActiveSession(null); setView('list'); }} className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark px-4 py-2 rounded-lg font-bold text-sm text-red-500">Exit</button>
                        </div>
                    )}
                    {view === 'list' && (
                        <button onClick={() => setJoinView(true)} className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark px-4 py-2 rounded-lg font-bold text-sm text-text-muted">Join Code</button>
                    )}
                </div>
            </header>

            <main className="flex-1 overflow-y-auto px-4 py-6">
                <div className="max-w-7xl mx-auto h-full">
                    {view === 'list' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {restaurants.map(r => (
                                <div key={r.id} className="bg-surface-light dark:bg-surface-dark rounded-3xl overflow-hidden border border-border-light dark:border-border-dark shadow-sm p-5 space-y-3">
                                    <div className="flex justify-between items-start">
                                        <h3 className="font-bold text-lg dark:text-white">{r.name}</h3>
                                        <div className="flex text-yellow-400">{Array.from({length: r.stars}).map((_,i) => <Star key={i} size={14} fill="currentColor"/>)}</div>
                                    </div>
                                    <p className="text-xs font-bold text-primary uppercase">{r.cuisineTags.join(', ')}</p>
                                    <p className="text-sm text-text-muted italic">"{r.notes || 'No notes'}"</p>
                                    {r.location && <div className="flex items-center gap-1 text-xs text-text-muted"><MapPin size={12}/>{r.location}</div>}
                                </div>
                            ))}
                        </div>
                    ) : !activeSession ? (
                        <div className="w-full max-w-md mx-auto bg-surface-light dark:bg-surface-dark rounded-3xl shadow-xl overflow-hidden flex flex-col h-[80vh] border border-border-light dark:border-border-dark">
                             <div className="p-8 text-center space-y-4">
                                <h1 className="text-3xl font-black dark:text-white">Start Deciding</h1>
                                <p className="text-text-muted">Pick a mode and the restaurants you want to vote on.</p>
                             </div>
                             <div className="flex-1 overflow-y-auto px-8 space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <button onClick={() => setSelectedMode('swipe')} className={`p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${selectedMode === 'swipe' ? 'border-primary bg-primary/5 text-primary' : 'border-border-light dark:border-border-dark text-text-muted'}`}><Heart size={32}/><span className="font-bold">Swipe</span></button>
                                    <button onClick={() => setSelectedMode('list')} className={`p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${selectedMode === 'list' ? 'border-primary bg-primary/5 text-primary' : 'border-border-light dark:border-border-dark text-text-muted'}`}><ThumbsUp size={32}/><span className="font-bold">List</span></button>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center"><h3 className="font-bold dark:text-white">Pool ({selection.size})</h3><div className="flex gap-2"><button onClick={() => setSelection(new Set(restaurants.map(r=>r.id)))} className="text-xs text-primary font-bold">All</button><button onClick={() => setSelection(new Set())} className="text-xs text-primary font-bold">None</button></div></div>
                                    <div className="max-h-48 overflow-y-auto border rounded-xl p-2 bg-gray-50 dark:bg-white/5 space-y-1">
                                        {restaurants.map(r => (
                                            <label key={r.id} className="flex items-center gap-2 p-2 hover:bg-white dark:hover:bg-white/5 rounded cursor-pointer">
                                                <input type="checkbox" checked={selection.has(r.id)} onChange={() => { const n = new Set(selection); if(n.has(r.id)) n.delete(r.id); else n.add(r.id); setSelection(n); }} className="rounded text-primary"/>
                                                <span className="text-sm font-medium dark:text-gray-200">{r.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                             </div>
                             <div className="p-8"><button onClick={startSession} disabled={selection.size === 0} className="w-full py-4 bg-primary text-white font-bold rounded-2xl shadow-lg disabled:opacity-50">Start Session</button></div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col h-full max-w-3xl mx-auto w-full">
                            <div className="flex justify-between items-center px-4 mb-4">
                                <div className="px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-bold uppercase tracking-widest">Code: {activeSession.accessCode}</div>
                                {!showResults && <div className="text-sm font-bold text-text-muted">{Math.min(swipeIndex + 1, sessionRestaurants.length)} / {sessionRestaurants.length}</div>}
                            </div>
                            {(selectedMode === 'list' || showResults) ? (
                                <div className="space-y-6 px-4">
                                    <div className="text-center">
                                        <Trophy className="mx-auto text-yellow-500 mb-2" size={32}/>
                                        <h2 className="text-3xl font-black dark:text-white">Leaderboard</h2>
                                        {showResults && !swipeFinished && <button onClick={()=>setShowResults(false)} className="text-primary font-bold text-sm hover:underline mt-2">Resume Voting</button>}
                                    </div>
                                    {rankedForSession.map((r, i) => (
                                        <div key={r.id} className="bg-surface-light dark:bg-surface-dark p-5 rounded-2xl border border-border-light dark:border-border-dark flex justify-between items-center shadow-sm">
                                            <div className="flex items-center gap-4">
                                                <span className="text-2xl font-black opacity-20 italic">#{i+1}</span>
                                                <div><h3 className="font-bold dark:text-white">{r.name}</h3><p className="text-xs text-text-muted">{r.cuisineTags.join(', ')}</p></div>
                                            </div>
                                            <div className="flex gap-2">
                                                {selectedMode === 'list' && !showResults && (
                                                    <div className="flex gap-1">
                                                        <button onClick={() => submitVote(r.id, -1)} className={`p-2 rounded-lg ${myVotes.get(r.id) === -1 ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-white/5'}`}><ThumbsDown size={18}/></button>
                                                        <button onClick={() => submitVote(r.id, 1)} className={`p-2 rounded-lg ${myVotes.get(r.id) === 1 ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-white/5'}`}><ThumbsUp size={18}/></button>
                                                    </div>
                                                )}
                                                <div className="px-3 py-1 bg-primary/10 text-primary rounded-lg font-black text-lg">{calculateScore(r.id)}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : swipeFinished ? (
                                <div className="max-w-sm mx-auto p-12 text-center space-y-6 bg-surface-light dark:bg-surface-dark border rounded-3xl animate-in zoom-in">
                                    <CheckCircle size={64} className="text-green-500 mx-auto" />
                                    <h3 className="text-2xl font-black dark:text-white">You've Finished!</h3>
                                    <button onClick={() => setShowResults(true)} className="w-full py-4 bg-primary text-white font-bold rounded-xl flex items-center justify-center gap-2"><BarChart3 size={20}/> See Final Results</button>
                                    <button onClick={() => setView('list')} className="w-full py-4 text-text-muted font-bold">Back to Main List</button>
                                </div>
                            ) : (
                                <div className="relative w-full aspect-[3/4] max-w-sm mx-auto">
                                    {sessionRestaurants[swipeIndex] && <SwipeableCard key={sessionRestaurants[swipeIndex].id} restaurant={sessionRestaurants[swipeIndex]} onVote={(v) => submitVote(sessionRestaurants[swipeIndex].id, v)} />}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {view === 'list' && (
                <div className="absolute bottom-6 right-6 flex flex-col gap-4">
                    <button onClick={() => setView('decide')} className="size-14 bg-white dark:bg-surface-dark text-primary border-2 border-primary/20 rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform"><Play size={24} fill="currentColor"/></button>
                    <button onClick={() => setIsFormOpen(true)} className="size-14 bg-primary text-white rounded-full shadow-xl flex items-center justify-center hover:scale-110 transition-transform"><Plus size={28}/></button>
                </div>
            )}

            {isFormOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsFormOpen(false)}></div>
                    <form onSubmit={async (e) => { e.preventDefault(); await db.upsertRestaurant({...formData, id: uuidv4(), cuisineTags: typeof formData.cuisineTags === 'string' ? formData.cuisineTags.split(',') : []} as any); loadData(); setIsFormOpen(false); }} className="relative bg-surface-light dark:bg-surface-dark p-8 rounded-3xl w-full max-w-lg shadow-2xl border">
                        <h2 className="text-xl font-bold mb-6 dark:text-white">Add New Restaurant</h2>
                        <input required placeholder="Name" className="w-full p-4 rounded-xl border mb-4 bg-gray-50 dark:bg-black/20 dark:text-white" onChange={e => setFormData({...formData, name: e.target.value})} />
                        <input placeholder="Cuisine (Italian, Pizza...)" className="w-full p-4 rounded-xl border mb-4 bg-gray-50 dark:bg-black/20 dark:text-white" onChange={e => setFormData({...formData, cuisineTags: e.target.value as any})} />
                        <textarea placeholder="Notes" className="w-full p-4 rounded-xl border mb-6 bg-gray-50 dark:bg-black/20 dark:text-white" onChange={e => setFormData({...formData, notes: e.target.value})} />
                        <div className="flex gap-4"><button type="button" onClick={()=>setIsFormOpen(false)} className="flex-1 py-4 font-bold text-text-muted">Cancel</button><button type="submit" className="flex-1 py-4 bg-primary text-white font-bold rounded-2xl">Save</button></div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default RestaurantList;
