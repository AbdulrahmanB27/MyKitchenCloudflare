
import React, { useState, useEffect, useMemo } from 'react';
import { Restaurant, VoteSession, Vote } from '../types';
import * as db from '../services/db';
import { Search, Plus, MapPin, DollarSign, Star, UtensilsCrossed, Filter, ArrowRight, ThumbsUp, ThumbsDown, User, Loader } from 'lucide-react';
import AuthModal from './AuthModal';
import { v4 as uuidv4 } from 'uuid';

interface RestaurantListProps {
    onOpenMenu: () => void;
}

const RestaurantList: React.FC<RestaurantListProps> = ({ onOpenMenu }) => {
    const [view, setView] = useState<'list' | 'decide'>('list');
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
            setFormData({ stars: 0, price: '$$', cuisineTags: [] });
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
        } catch (err) {
            console.error("Failed to save restaurant", err);
            // If auth error, modal will likely be triggered by db service callback, 
            // but we should ensure form doesn't close or state is handled.
            alert("Unable to save. Please ensure you are logged in.");
        }
    };

    // --- Voting Logic ---

    const refreshSession = async () => {
        const data = await db.getActiveSession();
        if (data) {
            setActiveSession(data.session);
            setSessionVotes(data.votes);
            
            // Map my local votes
            const myDeviceId = localStorage.getItem('device_id');
            const myMap = new Map<string, number>();
            data.votes.filter(v => v.deviceId === myDeviceId).forEach(v => myMap.set(v.restaurantId, v.voteValue));
            setMyVotes(myMap);
        } else {
            setActiveSession(null);
        }
    };

    const startSession = async () => {
        setLoading(true);
        try {
            await db.createVoteSession();
            await refreshSession();
        } catch (e) {
            console.error("Error starting session", e);
            alert("Failed to start session. Check your connection.");
        } finally {
            setLoading(false);
        }
    };

    const submitVote = async (restId: string, val: number) => {
        if (!activeSession) return;
        // Optimistic
        setMyVotes(prev => new Map(prev).set(restId, val));
        
        await db.submitVote(activeSession.id, restId, val);
        await refreshSession(); // Sync full state
    };

    useEffect(() => {
        let interval: number;
        if (view === 'decide') {
            refreshSession();
            interval = window.setInterval(refreshSession, 5000); // Poll every 5s
        }
        return () => clearInterval(interval);
    }, [view]);


    // --- Filtering ---
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
        return [...visibleRestaurants].sort((a, b) => calculateScore(b.id) - calculateScore(a.id));
    }, [visibleRestaurants, sessionVotes]);

    // --- Render ---

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
                     <button onClick={() => setView(view === 'list' ? 'decide' : 'list')} className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-all">
                         {view === 'list' ? 'Decide where to eat' : 'Back to List'}
                     </button>
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
                                        <div>
                                            <h3 className="font-bold text-lg text-text-main dark:text-white">{r.name}</h3>
                                            <div className="flex gap-1 text-yellow-500 text-xs my-1">
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
                                    
                                    {/* Action Buttons */}
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
                        <div className="bg-primary/10 p-6 rounded-2xl border border-primary/20 text-center">
                            {!activeSession ? (
                                <div className="space-y-4">
                                    <h3 className="text-xl font-bold text-primary">No Active Vote</h3>
                                    <p className="text-sm text-text-muted">Start a session so the family can vote on where to eat.</p>
                                    <button onClick={startSession} disabled={loading} className="px-6 py-3 bg-primary text-white rounded-xl font-bold shadow-lg hover:scale-105 transition-transform flex items-center justify-center gap-2 mx-auto">
                                        {loading ? <Loader className="animate-spin" /> : 'Start New Session'}
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between">
                                    <div className="text-left">
                                        <h3 className="text-lg font-bold text-primary">Voting in Progress</h3>
                                        <p className="text-xs text-text-muted">Session started {new Date(activeSession.createdAt).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})}</p>
                                    </div>
                                    <button onClick={startSession} className="text-xs font-bold text-text-muted hover:text-primary underline">Restart</button>
                                </div>
                            )}
                        </div>

                        {activeSession && (
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
                                                <h3 className="font-bold text-text-main dark:text-white">{r.name}</h3>
                                                <div className="flex gap-2 text-xs text-text-muted">
                                                    <span>{r.price}</span>
                                                    <span>•</span>
                                                    <span>{r.cuisineTags.join(', ')}</span>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => submitVote(r.id, -1)}
                                                    className={`p-3 rounded-full transition-colors ${myVote === -1 ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-white/5 text-gray-400 hover:text-red-500'}`}
                                                >
                                                    <ThumbsDown size={20} />
                                                </button>
                                                <button 
                                                    onClick={() => submitVote(r.id, 1)}
                                                    className={`p-3 rounded-full transition-colors ${myVote === 1 ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-white/5 text-gray-400 hover:text-green-500'}`}
                                                >
                                                    <ThumbsUp size={20} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
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
                                            <button type="button" key={s} onClick={() => setFormData({...formData, stars: s})} className={`${(formData.stars || 0) >= s ? 'text-yellow-500' : 'text-gray-300'}`}>
                                                <Star size={24} fill={(formData.stars || 0) >= s ? "currentColor" : "none"} />
                                            </button>
                                        ))}
                                    </div>
                                </div>
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
