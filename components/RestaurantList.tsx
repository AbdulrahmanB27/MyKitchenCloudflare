
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Restaurant, VoteSession, Vote } from '../types';
import * as db from '../services/db';
import { Search, Plus, Star, UtensilsCrossed, ThumbsUp, ThumbsDown, Loader, ArrowRight, Clock, BadgeCheck, Heart, Trash2, X, RotateCcw, CheckCircle, MapPin, ExternalLink, Image as ImageIcon, Upload, Lock, Users, ChevronDown, Play, WifiOff, BarChart3, Trophy, Check, ChefHat } from 'lucide-react';
import Checkbox from './Checkbox';
import AuthModal from './AuthModal';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import SortMenu from './SortMenu';
import { v4 as uuidv4 } from 'uuid';
import { sanitize, isNotEmpty, isValidUrl } from '../utils/validation';

interface RestaurantListProps {
    onOpenMenu: () => void;
    showToast?: (message: string, type?: 'success' | 'error') => void;
    showConfirm?: (title: string, message: string, onConfirm: () => void) => void;
    showAlert?: (title: string, message: string) => void;
}

const HOURS = [
    "12:00", "12:30", "1:00", "1:30", "2:00", "2:30", "3:00", "3:30", 
    "4:00", "4:30", "5:00", "5:30", "6:00", "6:30", "7:00", "7:30", 
    "8:00", "8:30", "9:00", "9:30", "10:00", "10:30", "11:00", "11:30"
];

const parseTime = (timeStr: string) => {
    if (!timeStr) return { time: '12:00', period: 'PM' };
    const parts = timeStr.split(' ');
    if (parts.length < 2) return { time: '12:00', period: 'PM' };
    return { time: parts[0], period: parts[1] as 'AM' | 'PM' };
};

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

        // Add some resistance/rotation logic
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
            finishVote(1); // Like
        } else if (offset.x < -threshold) {
            finishVote(-1); // Nope
        } else if (Math.abs(offset.y) > threshold) {
            finishVote(0); // Skip
        } else {
            setOffset({ x: 0, y: 0 });
        }
    };

    const finishVote = (val: number) => {
        setAnimating(true);
        let endX = 0;
        let endY = 0;
        
        if (val === 1) { endX = window.innerWidth; setResult('like'); }
        else if (val === -1) { endX = -window.innerWidth; setResult('nope'); }
        else { endY = offset.y > 0 ? window.innerHeight : -window.innerHeight; setResult('skip'); }

        setOffset({ x: endX, y: endY });
        
        // Wait for transition to finish before calling parent
        setTimeout(() => {
            onVote(val);
            // Reset for next card (if component reused, though usually it unmounts)
            setOffset({ x: 0, y: 0 });
            setResult(null);
            setAnimating(false);
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
                className="w-full max-w-sm aspect-[3/4] bg-white dark:bg-card-dark rounded-3xl shadow-2xl overflow-hidden relative touch-none select-none cursor-grab active:cursor-grabbing z-20"
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
                {/* Overlay Indicators */}
                <div className="absolute top-8 left-8 z-30 border-4 border-green-500 rounded-lg px-4 py-1 transform -rotate-12 transition-opacity pointer-events-none bg-green-500/10 backdrop-blur-sm" style={{ opacity: opacityRight }}>
                    <span className="text-green-500 font-extrabold text-3xl uppercase tracking-widest">Like</span>
                </div>
                <div className="absolute top-8 right-8 z-30 border-4 border-red-500 rounded-lg px-4 py-1 transform rotate-12 transition-opacity pointer-events-none bg-red-500/10 backdrop-blur-sm" style={{ opacity: opacityLeft }}>
                    <span className="text-red-500 font-extrabold text-3xl uppercase tracking-widest">Nope</span>
                </div>
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 border-4 border-blue-400 rounded-lg px-4 py-1 transition-opacity pointer-events-none bg-blue-400/10 backdrop-blur-sm" style={{ opacity: opacitySkip }}>
                    <span className="text-blue-400 font-extrabold text-3xl uppercase tracking-widest">Skip</span>
                </div>

                {/* Card Content */}
                <div className="relative h-[60%] w-full bg-bg-subtle dark:bg-white/10 pointer-events-none">
                    {restaurant.image ? (
                        <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url("${restaurant.image}")` }} />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-[#2d333f] text-gray-400 dark:text-[#4a5568]">
                            <UtensilsCrossed size={64} strokeWidth={1.5} />
                        </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
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

                <div className="h-[40%] p-6 flex flex-col justify-between bg-white dark:bg-card-dark relative pointer-events-none">
                    <div>
                        <div className="flex justify-between items-start gap-2">
                            <h2 className="text-2xl font-display font-extrabold text-text-main dark:text-white leading-tight line-clamp-2">{restaurant.name}</h2>
                            {restaurant.stars > 0 && (
                                <div className="flex items-center shrink-0">
                                    <ChefHat size={14} className="text-yellow-500 fill-yellow-500 mr-1" />
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
                            <div className="mt-4 p-3 bg-bg-subtle dark:bg-white/5 rounded-xl border border-border-thin dark:border-border-dark">
                                <p className="text-sm text-gray-600 dark:text-gray-300 italic line-clamp-2">"{restaurant.notes}"</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Buttons - Outside card to stay fixed and below */}
            <div className="absolute -bottom-24 left-0 right-0 px-8 flex items-center justify-center gap-6 sm:gap-10 pointer-events-auto z-30">
                <button onClick={() => finishVote(-1)} disabled={animating} className="group pointer-events-auto relative flex items-center justify-center size-16 rounded-full bg-white dark:bg-card-dark shadow-xl hover:scale-110 active:scale-95 transition-all duration-200 border border-border-thin dark:border-border-dark">
                    <X className="text-red-500" size={32} />
                </button>
                <button onClick={() => finishVote(0)} disabled={animating} className="group pointer-events-auto relative flex items-center justify-center size-12 rounded-full bg-white dark:bg-card-dark shadow-xl hover:scale-110 active:scale-95 transition-all duration-200 -mt-4 border border-border-thin dark:border-border-dark">
                    <ArrowRight className="text-blue-400" size={24} />
                </button>
                <button onClick={() => finishVote(1)} disabled={animating} className="group pointer-events-auto relative flex items-center justify-center size-16 rounded-full bg-primary shadow-xl shadow-primary/30 hover:scale-110 active:scale-95 transition-all duration-200">
                    <Heart className="text-white fill-white" size={32} />
                </button>
            </div>
        </div>
    );
};

const RestaurantList: React.FC<RestaurantListProps> = ({ onOpenMenu, showToast, showConfirm, showAlert }) => {
    const [view, setView] = useState<'list' | 'decide'>('list');
    const [joinView, setJoinView] = useState(false);
    const [joinCode, setJoinCode] = useState('');
    const [showResults, setShowResults] = useState(false); // Toggle for live results during session
    
    const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Auth/Form State
    const [showAuth, setShowAuth] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isFamilySelectorOpen, setIsFamilySelectorOpen] = useState(false);
    const [formData, setFormData] = useState<Partial<Restaurant>>({});
    const [isUploading, setIsUploading] = useState(false);

    // Share/Sync State
    const [targetFamilyId, setTargetFamilyId] = useState<string>('private');
    const [syncToAll, setSyncToAll] = useState(false);
    const [availableSessions, setAvailableSessions] = useState<any[]>([]);
    const currentFamilyId = db.getCurrentFamilyId();
    const pinnedFamilyId = db.getPinnedFamilyId();

    // Delete Modal State
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [restaurantToDelete, setRestaurantToDelete] = useState<Restaurant | null>(null);

    // Schedule State for Form
    const [schedDays, setSchedDays] = useState<Set<string>>(new Set(['Mo','Tu','We','Th','Fr']));
    const [schedStart, setSchedStart] = useState('11:00 AM');
    const [schedEnd, setSchedEnd] = useState('9:00 PM');
    const [isStartPeriodOpen, setIsStartPeriodOpen] = useState(false);
    const [isEndPeriodOpen, setIsEndPeriodOpen] = useState(false);

    // Draft Management
    const saveRestaurantDraft = () => {
        if (!isFormOpen) return;
        const draft = {
            formData,
            schedDays: Array.from(schedDays),
            schedStart,
            schedEnd,
            targetFamilyId,
            editingId
        };
        db.safeSetItem(editingId ? `mykitchen_restaurant_draft_${editingId}` : 'mykitchen_restaurant_draft_new', JSON.stringify(draft));
    };

    const clearRestaurantDraft = (id: string | null) => {
        db.safeRemoveItem(id ? `mykitchen_restaurant_draft_${id}` : 'mykitchen_restaurant_draft_new');
    };

    const restoreRestaurantDraft = (id: string | null) => {
        const draftStr = db.safeGetItem(id ? `mykitchen_restaurant_draft_${id}` : 'mykitchen_restaurant_draft_new');
        if (draftStr) {
            try {
                const draft = JSON.parse(draftStr);
                setFormData(draft.formData);
                setSchedDays(new Set(draft.schedDays));
                setSchedStart(draft.schedStart);
                setSchedEnd(draft.schedEnd);
                setTargetFamilyId(draft.targetFamilyId);
                return true;
            } catch (e) {
                console.error("Failed to restore restaurant draft", e);
            }
        }
        return false;
    };

    useEffect(() => {
        const timeout = setTimeout(() => {
            saveRestaurantDraft();
        }, 1000);
        return () => clearTimeout(timeout);
    }, [formData, schedDays, schedStart, schedEnd, targetFamilyId, isFormOpen]);

    const handleTimeChange = (value: string, currentFullTime: string, setter: (val: string) => void) => {
        // Only allow numbers and one colon
        let sanitized = value.replace(/[^0-9:]/g, '');
        
        // Prevent multiple colons
        const colonCount = (sanitized.match(/:/g) || []).length;
        if (colonCount > 1) {
            const parts = sanitized.split(':');
            sanitized = parts[0] + ':' + parts.slice(1).join('');
        }

        // Limit length
        if (sanitized.length > 5) sanitized = sanitized.slice(0, 5);

        const period = parseTime(currentFullTime).period;
        setter(`${sanitized} ${period}`);
    };

    const validateAndFormatTime = (fullTime: string, setter: (val: string) => void) => {
        const { time, period } = parseTime(fullTime);
        let [hours, minutes] = time.split(':');
        
        if (!hours && !minutes) {
            setter(`12:00 ${period}`);
            return;
        }
        
        if (!minutes) minutes = '00';
        
        let h = parseInt(hours);
        let m = parseInt(minutes);
        
        if (isNaN(h)) h = 12;
        if (isNaN(m)) m = 0;
        
        // Clamp values for 12-hour format
        if (h < 1) h = 1;
        if (h > 12) h = 12;
        if (m < 0) m = 0;
        if (m > 59) m = 59;
        
        const formattedTime = `${h}:${m.toString().padStart(2, '0')}`;
        setter(`${formattedTime} ${period}`);
    };

    // Sorting & Filtering
    const [sortBy, setSortBy] = useState<'name' | 'rating' | 'price' | 'recent'>('recent');
    const [filterTag, setFilterTag] = useState<string | null>(null);

    const sortOptions = [
        { id: 'recent', label: 'Recently Added', icon: <Clock size={16} /> },
        { id: 'name', label: 'Name (A-Z)', icon: <ArrowRight size={16} /> },
        { id: 'rating', label: 'Highest Rated', icon: <ChefHat size={16} /> },
        { id: 'price', label: 'Price (Low-High)', icon: <span className="font-bold text-xs">$</span> },
    ];

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        restaurants.forEach(r => r.cuisineTags.forEach(t => tags.add(t)));
        return Array.from(tags).sort();
    }, [restaurants]);

    const filteredRestaurants = useMemo(() => {
        let res = restaurants;
        
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            res = res.filter(r => 
                r.name.toLowerCase().includes(q) || 
                r.cuisineTags.some(t => t.toLowerCase().includes(q)) ||
                r.location?.toLowerCase().includes(q)
            );
        }

        if (filterTag) {
            res = res.filter(r => r.cuisineTags.includes(filterTag));
        }

        return res.sort((a, b) => {
            if (sortBy === 'name') return a.name.localeCompare(b.name);
            if (sortBy === 'rating') return b.stars - a.stars;
            if (sortBy === 'price') return (a.price?.length || 0) - (b.price?.length || 0);
            return (b.createdAt || 0) - (a.createdAt || 0);
        });
    }, [restaurants, searchQuery, filterTag, sortBy]);

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
    
    const sessionCodeRef = useRef<string | null>(null);
    
    const [selection, setSelection] = useState<Set<string>>(new Set());
    const [selectedMode, setSelectedMode] = useState<'list' | 'swipe'>('swipe');
    const [hasInitializedSelection, setHasInitializedSelection] = useState(false);

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

    useEffect(() => {
        sessionCodeRef.current = activeSession?.accessCode || null;
    }, [activeSession]);

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

    const openForm = (r?: Restaurant) => {
        if (r) {
            setFormData(r);
            setEditingId(r.id);
            if (r.familyId && availableSessions.some(s => s.id === r.familyId)) {
                setTargetFamilyId(r.familyId);
            } else {
                setTargetFamilyId('private');
            }
            restoreRestaurantDraft(r.id);
        } else {
            setFormData({ stars: 0, price: '$$', cuisineTags: [], isApproved: false });
            setEditingId(null);
            setSchedDays(new Set(['Mo','Tu','We','Th','Fr']));
            setSchedStart('11:00 AM');
            setSchedEnd('9:00 PM');
            if (pinnedFamilyId) setTargetFamilyId(pinnedFamilyId);
            else if (currentFamilyId) setTargetFamilyId(currentFamilyId);
            else setTargetFamilyId('private');
            restoreRestaurantDraft(null);
        }
        setIsFormOpen(true);
    };

    const handleDelete = async (id: string) => {
        const r = restaurants.find(r => r.id === id);
        if (!r) return;

        if (r.familyId && r.familyId !== 'global' && !db.hasAuthToken()) { 
            setShowAuth(true); 
            return; 
        }
        
        setRestaurantToDelete(r);
        setShowDeleteModal(true);
    };

    const confirmDeleteRestaurant = async (selectedFamilyIds: string[]) => {
        if (!restaurantToDelete) return;

        const currentFamilyId = db.getCurrentFamilyId();
        const promises: Promise<any>[] = [];

        for (const familyId of selectedFamilyIds) {
            if (familyId === 'private' || familyId === currentFamilyId) {
                // Local Delete (handles sync if needed)
                promises.push(db.deleteRestaurant(restaurantToDelete.id));
            } else {
                // Cross Delete
                if (db.crossDeleteRestaurant) {
                    promises.push(db.crossDeleteRestaurant(restaurantToDelete.id, familyId));
                }
            }
        }

        try {
            await Promise.all(promises);
            await loadData();
            setIsFormOpen(false);
            setEditingId(null);
        } catch (e: any) {
            console.error(e);
            if (showToast) showToast(`Failed to delete: ${e.message}`, 'error');
            else if (showAlert) showAlert("Delete Failed", `Failed to delete: ${e.message}`);
        } finally {
            setShowDeleteModal(false);
            setRestaurantToDelete(null);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!isNotEmpty(formData.name)) {
            if (showToast) showToast("Restaurant name is required", 'error');
            else if (showAlert) showAlert("Missing Info", "Restaurant name is required");
            return;
        }

        if (formData.image && !isValidUrl(formData.image)) {
            // It might be a base64 or a local path, but usually it's a URL here.
            // If it's not a valid URL, we might want to warn, but some images are base64.
            // Let's just sanitize it.
        }

        try {
            const r: Restaurant = {
                ...formData as Restaurant,
                name: sanitize(formData.name || ''),
                location: sanitize(formData.location || ''),
                notes: sanitize(formData.notes || ''),
                goToOrder: sanitize(formData.goToOrder || ''),
                image: formData.image ? sanitize(formData.image) : undefined,
                openHours: formData.openHours ? sanitize(formData.openHours) : undefined,
                id: editingId || uuidv4(),
                familyId: targetFamilyId === 'private' ? 'private' : targetFamilyId, 
                createdAt: formData.createdAt || Date.now(),
                updatedAt: Date.now(),
                cuisineTags: typeof formData.cuisineTags === 'string' 
                    ? (formData.cuisineTags as string).split(',').map(t => sanitize(t.trim())).filter(Boolean) 
                    : (formData.cuisineTags || []).map(t => sanitize(t))
            };

            if (targetFamilyId === 'private') {
                await db.upsertRestaurant(r, { localOnly: true });
            } else {
                // If it's for the current family, use upsertRestaurant which handles sync
                if (targetFamilyId === currentFamilyId) {
                    await db.upsertRestaurant(r);
                } else {
                    // If it's for another family, use crossPostRestaurant
                    await db.crossPostRestaurant(r, targetFamilyId);
                }
                
                // Sync to all if checked
                if (syncToAll && availableSessions.length > 1) {
                     const otherSessions = availableSessions.filter(s => s.id !== targetFamilyId);
                     await Promise.all(otherSessions.map(s => db.crossPostRestaurant(r, s.id)));
                }

                if (targetFamilyId !== currentFamilyId) {
                    if (showToast) {
                        showToast(`Restaurant saved to ${availableSessions.find(s => s.id === targetFamilyId)?.name}${syncToAll ? ' and synced to all families' : ''}.`);
                    } else if (showAlert) {
                        showAlert("Restaurant Saved", `Restaurant saved to ${availableSessions.find(s => s.id === targetFamilyId)?.name}${syncToAll ? ' and synced to all families' : ''}.`);
                    }
                    clearRestaurantDraft(editingId);
                    setIsFormOpen(false);
                    return;
                }
            }

            await loadData();
            clearRestaurantDraft(editingId);
            setIsFormOpen(false);
        } catch (err: any) {
            if (showToast) showToast(`Unable to save: ${err.message}`, 'error');
            else if (showAlert) showAlert("Save Error", `Unable to save: ${err.message}`);
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
            if (showToast) showToast("Failed to upload image.", 'error');
            else if (showAlert) showAlert("Upload Error", "Failed to upload image.");
        } finally {
            setIsUploading(false);
        }
    };

    const toggleSchedDay = (id: string) => {
        const next = new Set(schedDays);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSchedDays(next);
    };

    const refreshSession = async () => {
        const code = sessionCodeRef.current;
        if (code && code !== 'LOCAL') {
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
        if (selection.size === 0) { 
            if (showToast) showToast("Please select at least one restaurant.", 'error');
            else if (showAlert) showAlert("Nothing Selected", "Please select at least one restaurant.");
            return; 
        }
        
        setLoading(true);
        
        try {
            const subset = restaurants.filter(r => selection.has(r.id));
            if (subset.length === 0) throw new Error("Selection invalid.");

            setSessionRestaurants(subset);
            // Don't setView here, already in 'decide' view
            setSessionVotes([]);
            setSwipeIndex(0);
            setSwipeFinished(false);
            setIsHost(true);
            setShowResults(false);

            // Attempt create on server, fallback to local if fails (offline)
            let session = await db.createVoteSession(subset, selectedMode);
            
            if (!session) {
                // Local Fallback
                session = {
                    id: 'local-' + Date.now(),
                    accessCode: 'LOCAL',
                    mode: selectedMode,
                    active: true,
                    createdAt: Date.now(),
                    snapshot: subset
                };
            }
            
            setActiveSession(session);
        } catch (e: any) {
            console.error(e);
            if (showToast) showToast(`Failed to start session: ${e.message}`, 'error');
            else if (showAlert) showAlert("Start Error", `Failed to start session: ${e.message}`);
            setView('list');
            setIsHost(false);
        } finally {
            setLoading(false);
        }
    };

    const handleJoinSession = async (codeOverride?: string) => {
        const code = codeOverride || joinCode;
        if (code.length !== 4) {
            if (showToast) showToast("Please enter a 4-character code.", 'error');
            else if (showAlert) showAlert("Invalid Code", "Please enter a 4-character code.");
            return;
        }
        setLoading(true);
        try {
            const data = await db.joinSession(code);
            if (!data) {
                if (showToast) showToast("Session not found or inactive.", 'error');
                else if (showAlert) showAlert("Session Not Found", "Session not found or inactive.");
            } else {
                setActiveSession(data.session);
                setSessionVotes(data.votes);
                setSessionRestaurants(data.restaurants || data.session.snapshot || []);
                setSwipeIndex(0); 
                setSwipeFinished(false);
                setView('decide');
                setJoinView(false);
                setIsHost(false);
                setShowResults(false);
                if (data.session.mode) setSelectedMode(data.session.mode);
            }
        } catch (e) {
            if (showToast) showToast("Failed to join.", 'error');
            else if (showAlert) showAlert("Join Error", "Failed to join.");
        } finally {
            setLoading(false);
        }
    };

    const handleBackToList = () => {
        const doBack = () => {
            setActiveSession(null);
            setSessionVotes([]);
            setSessionRestaurants([]);
            setMyVotes(new Map());
            setIsHost(false);
            setView('list');
            setSwipeIndex(0);
            setSwipeFinished(false);
            setShowResults(false);
            try {
                window.history.replaceState({}, '', window.location.pathname);
            } catch (e) {}
        };

        if (isHost && activeSession && activeSession.accessCode !== 'LOCAL') {
            if (showConfirm) {
                showConfirm("End Session", "End this session for everyone?", () => {
                    db.endSession(activeSession.id);
                    doBack();
                });
            } else {
                db.endSession(activeSession.id);
                doBack();
            }
        } else {
            doBack();
        }
    };

    const submitVote = async (restId: string, val: number) => {
        if (!activeSession) return;
        setMyVotes(prev => new Map(prev).set(restId, val));
        
        const currentMode = activeSession.mode || selectedMode;
        if (currentMode === 'swipe') {
            if (swipeIndex < sessionRestaurants.length - 1) {
                setSwipeIndex(prev => prev + 1);
            } else {
                setSwipeFinished(true);
            }
        }

        if (activeSession.accessCode === 'LOCAL') {
            // Local mode: Update sessionVotes locally to drive rankings
            setSessionVotes(prev => {
                const others = prev.filter(v => v.restaurantId !== restId);
                return [...others, {
                    id: 'local-v-' + Date.now(),
                    sessionId: activeSession.id,
                    restaurantId: restId,
                    deviceId: 'local',
                    voteValue: val,
                    createdAt: Date.now()
                }];
            });
        } else {
            await db.submitVote(activeSession.id, restId, val);
            refreshSession();
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
                const q = sanitize(searchQuery).toLowerCase();
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
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-bg-white dark:bg-bg-dark animate-in fade-in">
                <div className="w-full max-w-sm space-y-6 text-center">
                    <button onClick={() => setJoinView(false)} className="absolute top-4 left-4 p-2 rounded-full hover:bg-bg-subtle dark:hover:bg-white/10 text-text-secondary">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <h2 className="text-2xl font-bold font-display text-text-main dark:text-white">Join Session</h2>
                    <input 
                        type="text" 
                        value={joinCode} 
                        onChange={e => setJoinCode(e.target.value.toUpperCase())} 
                        className="w-full text-center text-4xl font-mono tracking-widest p-4 rounded-xl border-2 border-forest-green/50 dark:border-accent-herb/50 focus:border-forest-green dark:focus:border-accent-herb bg-white dark:bg-card-dark text-text-main dark:text-white uppercase outline-none shadow-lg" 
                        placeholder="ABCD" 
                        maxLength={4}
                        autoFocus
                    />
                    <button onClick={() => handleJoinSession()} disabled={joinCode.length !== 4 || loading} className="w-full py-4 bg-forest-green dark:bg-accent-herb text-white dark:text-black font-bold rounded-xl shadow-lg hover:scale-105 transition-transform disabled:opacity-50">
                        {loading ? <Loader className="animate-spin mx-auto" /> : 'Join'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-bg-subtle dark:bg-bg-dark">
            
            <header className="md:hidden sticky top-0 z-40 w-full bg-bg-white dark:bg-sidebar-dark border-b border-border-thin dark:border-border-dark transition-colors duration-300">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16 gap-3">
                        <div className="flex items-center gap-3 shrink-0">
                            {onOpenMenu && (
                                <button onClick={onOpenMenu} className="p-2 -ml-2 rounded-full hover:bg-bg-subtle dark:hover:bg-white/10 text-text-secondary">
                                    <span className="material-symbols-outlined">menu</span>
                                </button>
                            )}
                        </div>
                        
                        {view === 'list' && (
                            <>
                                <div className="flex-1 relative group">
                                    <Search className="absolute left-0 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-forest-green dark:group-focus-within:text-accent-herb transition-colors" size={18} />
                                    <input 
                                        type="text" 
                                        placeholder="Search..." 
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="w-full pl-8 pr-4 py-2 bg-transparent border-b border-border-thin dark:border-border-dark text-sm font-medium text-text-main dark:text-white placeholder-text-secondary focus:border-forest-green dark:focus:border-accent-herb transition-all outline-none"
                                    />
                                </div>
                                <SortMenu options={sortOptions} currentSort={sortBy} onSortChange={setSortBy} />
                            </>
                        )}

                        <div className="flex items-center gap-2 shrink-0">
                            {view === 'list' && (
                                <>
                                    <button onClick={() => setJoinView(true)} className="p-2 rounded-full hover:bg-bg-subtle dark:hover:bg-white/10 text-text-secondary" title="Join Code">
                                        <Users size={20} />
                                    </button>
                                </>
                            )}
                            {view === 'decide' && activeSession && (
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => setShowResults(!showResults)}
                                        className={`p-2 rounded-lg shadow-sm transition-all ${showResults ? 'bg-forest-green dark:bg-accent-herb text-white dark:text-black' : 'bg-white dark:bg-card-dark border border-border-thin dark:border-border-dark text-text-secondary'}`}
                                    >
                                        <BarChart3 size={18} />
                                    </button>
                                    <button onClick={handleBackToList} className="bg-white dark:bg-card-dark border border-border-thin dark:border-border-dark px-3 py-2 rounded-lg font-bold text-xs shadow-sm text-red-500 border-red-200 dark:border-red-900/30">
                                        {isHost ? 'End' : 'Exit'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 scroll-smooth">
                <div className="max-w-7xl mx-auto h-full flex flex-col">
                    
                    {view === 'list' ? (
                        <>
                            {/* Desktop Top Bar */}
                            <div className="hidden md:flex flex-row gap-4 justify-between items-center mb-8">
                                <div className="relative flex-1 max-w-xl group flex items-center gap-4">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-0 top-1/2 -translate-y-1/2 text-text-secondary dark:text-text-secondary-dark group-focus-within:text-forest-green dark:group-focus-within:text-accent-herb transition-colors" size={20} />
                                        <input 
                                            type="text" 
                                            value={searchQuery} 
                                            onChange={e => setSearchQuery(e.target.value)} 
                                            placeholder="Search places..." 
                                            className="w-full pl-8 pr-4 py-3 bg-transparent border-b border-border-thin dark:border-border-dark focus:border-forest-green dark:focus:border-accent-herb focus:ring-0 text-base text-text-main dark:text-white placeholder:text-text-secondary outline-none transition-all font-normal" 
                                        />
                                    </div>
                                    <SortMenu options={sortOptions} currentSort={sortBy} onSortChange={setSortBy} />
                                </div>
                                <div className="flex gap-3 items-center">
                                    <button onClick={() => setJoinView(true)} className="bg-white dark:bg-card-dark border border-border-thin dark:border-border-dark px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-bg-subtle dark:hover:bg-white/5 transition-all text-text-secondary hover:text-text-main dark:hover:text-white flex items-center gap-2">
                                        <Users size={16} />
                                        Join Code
                                    </button>
                                </div>
                            </div>

                            {/* Filters */}
                            <div className="space-y-4 mb-8">
                                <div className="flex gap-3 overflow-x-auto pb-4 pt-1 px-1 no-scrollbar items-center">
                                    <button 
                                        onClick={() => setFilterTag(null)}
                                        className={`shrink-0 px-5 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${!filterTag ? 'bg-forest-green dark:bg-accent-herb text-white dark:text-white shadow-md transform scale-105' : 'bg-white dark:bg-card-dark text-text-secondary dark:text-text-secondary-dark hover:bg-gray-50 dark:hover:bg-card-hover border border-border-thin dark:border-border-dark hover:border-forest-green dark:hover:border-accent-herb'}`}
                                    >
                                        All
                                    </button>
                                    {allTags.map(tag => (
                                        <button 
                                            key={tag}
                                            onClick={() => setFilterTag(tag === filterTag ? null : tag)}
                                            className={`shrink-0 px-5 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${tag === filterTag ? 'bg-forest-green dark:bg-accent-herb text-white dark:text-white shadow-md transform scale-105' : 'bg-white dark:bg-card-dark text-text-secondary dark:text-text-secondary-dark hover:bg-gray-50 dark:hover:bg-card-hover border border-border-thin dark:border-border-dark hover:border-forest-green dark:hover:border-accent-herb'}`}
                                        >
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Restaurant Grid */}
                            {filteredRestaurants.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-center">
                                    <div className="w-24 h-24 bg-bg-subtle dark:bg-white/5 rounded-full flex items-center justify-center mb-6">
                                        <UtensilsCrossed size={48} className="text-text-secondary opacity-50" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-text-main dark:text-white mb-2">No restaurants found</h3>
                                    <p className="text-text-secondary max-w-md mx-auto mb-8">
                                        {searchQuery || filterTag ? "Try adjusting your search or filters to find what you're looking for." : "You haven't added any restaurants yet. Start building your list to make dining out decisions easier!"}
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {filteredRestaurants.map(r => (
                                    <div 
                                        key={r.id} 
                                        onClick={() => openForm(r)}
                                        className="group bg-white dark:bg-card-dark rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col cursor-pointer relative hover:-translate-y-1"
                                    >
                                        <div className="relative h-48 overflow-hidden bg-gray-100 dark:bg-gray-800">
                                            {r.image ? (
                                                <div className="w-full h-full bg-cover bg-center transform group-hover:scale-105 transition-transform duration-500" style={{ backgroundImage: `url("${r.image}")` }}></div>
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-[#2d333f] text-gray-400 dark:text-[#4a5568]">
                                                    <UtensilsCrossed size={48} strokeWidth={1.5} />
                                                </div>
                                            )}
                                            <div className="absolute top-3 right-3 flex gap-2">
                                                <div className="text-text-main dark:text-white text-[10px] font-bold px-1 py-0.5">
                                                    {r.cuisineTags[0]}
                                                </div>
                                                {r.stars > 0 && (
                                                    <div className="text-yellow-600 dark:text-yellow-400 text-[10px] font-bold px-1 py-0.5 flex items-center gap-1">
                                                        <ChefHat size={12} fill="currentColor" /> {r.stars === 3 ? 'Super' : r.stars === 2 ? 'Great' : 'Good'}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="p-5 flex flex-col flex-1">
                                            <div className="flex justify-between items-start gap-2 mb-1">
                                                <h3 className="text-text-main dark:text-white text-xl font-display font-bold leading-tight group-hover:text-forest-green dark:group-hover:text-accent-herb transition-colors">{r.name}</h3>
                                                <span className="text-text-main dark:text-gray-400 font-bold text-sm">{r.price}</span>
                                            </div>
                                            <p className="text-text-secondary text-sm mb-4 line-clamp-2">{r.notes || "No notes available."}</p>
                                            <div className="mt-auto flex items-center justify-between pt-4 border-t border-border-thin dark:border-border-dark">
                                                <div className="flex items-center gap-1.5 text-text-secondary">
                                                    <MapPin size={16} />
                                                    <span className="text-xs font-semibold max-w-[100px] truncate">{r.location || 'Unknown loc'}</span>
                                                </div>
                                                {r.isApproved && <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-md border border-blue-100 dark:border-blue-900/30">Verified</span>}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            )}
                        </>
                    ) : (
                        <div className="h-full flex flex-col">
                            {loading && !activeSession ? (
                                <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-4 animate-in fade-in">
                                    <div className="relative">
                                        <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse"></div>
                                        <Loader className="animate-spin text-primary relative z-10" size={48} />
                                    </div>
                                    <div className="text-center space-y-2">
                                        <h3 className="text-2xl font-bold text-text-main dark:text-white">Starting Session...</h3>
                                        <p className="text-text-muted">Connecting to the kitchen server.</p>
                                    </div>
                                </div>
                            ) : !activeSession ? (
                                <div className="w-full max-w-md mx-auto bg-white dark:bg-card-dark rounded-3xl shadow-xl overflow-hidden flex flex-col h-[85vh] max-h-[800px] relative">
                                    <button 
                                        onClick={() => setView('list')}
                                        className="absolute top-4 right-4 p-2 rounded-full hover:bg-bg-subtle dark:hover:bg-white/10 z-10"
                                    >
                                        <X size={20} className="text-text-secondary"/>
                                    </button>
                                    <header className="pt-8 px-6 pb-2 shrink-0 text-center">
                                        <div className="inline-flex items-center justify-center size-12 rounded-full bg-forest-green/10 dark:bg-accent-herb/10 text-forest-green dark:text-accent-herb mb-4">
                                            <UtensilsCrossed size={24} />
                                        </div>
                                        <h1 className="font-display text-3xl font-extrabold text-text-main dark:text-white tracking-tight mb-2">Swipe to Decide</h1>
                                        <p className="text-text-secondary text-sm leading-relaxed px-4">
                                            Setup your group voting session.
                                        </p>
                                    </header>
                                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-8">
                                        <section>
                                            <div className="flex items-center justify-between mb-3">
                                                <h3 className="font-display font-bold text-lg text-text-main dark:text-white">Pool Selection</h3>
                                                <div className="flex gap-2">
                                                    <button onClick={selectAll} className="text-xs font-medium text-forest-green dark:text-accent-herb hover:underline">All</button>
                                                    <button onClick={selectNone} className="text-xs font-medium text-forest-green dark:text-accent-herb hover:underline">None</button>
                                                </div>
                                            </div>
                                            <div className="max-h-40 overflow-y-auto border border-border-thin dark:border-border-dark rounded-xl p-2 bg-bg-subtle dark:bg-bg-dark custom-scrollbar">
                                                {visibleRestaurants.map(r => (
                                                    <div key={r.id} onClick={() => toggleSelect(r.id)} className={`flex items-center gap-2 p-2 rounded cursor-pointer ${selection.has(r.id) ? 'bg-forest-green/10 dark:bg-accent-herb/10 text-forest-green dark:text-accent-herb' : 'text-text-secondary'}`}>
                                                        <div className={`size-4 rounded-full border ${selection.has(r.id) ? 'bg-forest-green dark:bg-accent-herb border-forest-green dark:border-accent-herb' : 'border-gray-400'}`}></div>
                                                        <span className="text-sm font-bold truncate">{r.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                        <section>
                                            <h3 className="font-display font-bold text-lg text-text-main dark:text-white mb-3">Game Mode</h3>
                                            <div className="grid grid-cols-2 gap-4">
                                                <button onClick={() => setSelectedMode('swipe')} className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${selectedMode === 'swipe' ? 'border-forest-green dark:border-accent-herb bg-forest-green/5 dark:bg-accent-herb/5 text-forest-green dark:text-accent-herb' : 'border-border-thin dark:border-border-dark text-text-secondary'}`}>
                                                    <Heart size={24} />
                                                    <span className="font-bold text-sm">Swipe</span>
                                                </button>
                                                <button onClick={() => setSelectedMode('list')} className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${selectedMode === 'list' ? 'border-forest-green dark:border-accent-herb bg-forest-green/5 dark:bg-accent-herb/5 text-forest-green dark:text-accent-herb' : 'border-border-thin dark:border-border-dark text-text-secondary'}`}>
                                                    <ThumbsUp size={24} />
                                                    <span className="font-bold text-sm">List</span>
                                                </button>
                                            </div>
                                        </section>
                                    </div>
                                    <div className="p-6 bg-white dark:bg-card-dark border-t border-border-thin dark:border-border-dark">
                                        <div className="flex flex-col items-center gap-4">
                                            <span className="text-sm font-semibold text-text-secondary bg-bg-subtle dark:bg-white/5 px-3 py-1 rounded-full animate-pulse">
                                                ✨ {selection.size} restaurants selected
                                            </span>
                                            <button onClick={startSession} disabled={selection.size === 0} className="w-full bg-forest-green dark:bg-accent-herb hover:bg-gray-800 dark:hover:bg-herb-hover text-white dark:text-black font-display font-bold text-lg py-4 rounded-2xl shadow-lg transform transition hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2 group disabled:opacity-50">
                                                Start Session
                                                <ArrowRight className="group-hover:translate-x-1 transition-transform" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col h-full max-w-3xl mx-auto w-full">
                                    {/* Session Header - Code & Progress */}
                                    <div className="flex-none px-4 py-2 flex items-center justify-between">
                                        <div className="flex items-center gap-2 bg-white/80 dark:bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-border-thin dark:border-border-dark shadow-sm">
                                            {activeSession.accessCode === 'LOCAL' ? (
                                                <>
                                                    <WifiOff size={14} className="text-orange-500" />
                                                    <span className="text-xs font-semibold tracking-wide uppercase text-text-secondary">Offline Mode</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="size-2 rounded-full bg-green-400 animate-pulse"></span>
                                                    <span className="text-xs font-semibold tracking-wide uppercase text-text-secondary">Code: {activeSession.accessCode}</span>
                                                </>
                                            )}
                                        </div>
                                        {!showResults && (
                                            <div className="font-bold text-text-secondary tracking-widest text-sm">
                                                <span className="text-text-main dark:text-white text-lg">{Math.min(swipeIndex + 1, sessionRestaurants.length)}</span> / {sessionRestaurants.length}
                                            </div>
                                        )}
                                    </div>

                                    {(activeSession.mode === 'list' || (!activeSession.mode && selectedMode === 'list') || showResults) ? (
                                        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
                                            <div className="text-center mb-4">
                                                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-sm font-bold mb-3">
                                                    <Trophy size={18} />
                                                    Live Rankings
                                                </div>
                                                <h2 className="text-3xl font-black text-text-main dark:text-white mb-2">Group Favorites</h2>
                                                {showResults && !swipeFinished && (
                                                    <button onClick={() => setShowResults(false)} className="text-primary text-sm font-bold hover:underline mt-1">
                                                        Resume Swiping
                                                    </button>
                                                )}
                                            </div>
                                            
                                            {rankedForSession.map((r, idx) => {
                                                const score = calculateScore(r.id);
                                                const myVote = myVotes.get(r.id);
                                                return (
                                                    <div key={r.id} className="bg-white dark:bg-card-dark rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 relative group">
                                                        {idx === 0 && score > 0 && (
                                                            <div className="absolute top-4 right-4 z-10 bg-white/95 dark:bg-black/80 backdrop-blur text-forest-green dark:text-accent-herb px-3 py-1.5 rounded-lg font-bold shadow-sm flex items-center gap-1 border border-black/5 dark:border-white/10">
                                                                <Heart size={16} fill="currentColor" /> Top Match
                                                            </div>
                                                        )}
                                                        <div className="grid sm:grid-cols-3 gap-0 h-full">
                                                            <div className="relative h-32 sm:h-auto overflow-hidden bg-gray-200 dark:bg-gray-800">
                                                                {r.image ? (
                                                                    <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url("${r.image}")` }}></div>
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-[#2d333f] text-gray-400 dark:text-[#4a5568]">
                                                                        <UtensilsCrossed size={32} strokeWidth={1.5} />
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="sm:col-span-2 p-5 flex flex-col justify-center">
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <div>
                                                                        <h3 className="text-xl font-bold text-text-main dark:text-white">{r.name}</h3>
                                                                        <p className="text-text-secondary text-sm font-medium">{r.cuisineTags.join(', ')} • {r.price}</p>
                                                                    </div>
                                                                    {/* Only show voting buttons in List Mode, NOT in Results View of Swipe Mode */}
                                                                    {(activeSession.mode === 'list' || (!activeSession.mode && selectedMode === 'list')) && !showResults && (
                                                                        <div className="flex items-center gap-2">
                                                                            <button onClick={() => submitVote(r.id, -1)} className={`p-2 rounded-full ${myVote === -1 ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-white/5 text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'}`}><ThumbsDown size={18}/></button>
                                                                            <button onClick={() => submitVote(r.id, 1)} className={`p-2 rounded-full ${myVote === 1 ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-white/5 text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'}`}><ThumbsUp size={18}/></button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-2">
                                                                    <div className="flex items-center gap-1 text-green-600 dark:text-green-400 font-bold bg-green-50 dark:bg-green-900/10 px-2 py-1 rounded border border-green-100 dark:border-green-900/20">
                                                                        <ThumbsUp size={14} /> {sessionVotes.filter(v => v.restaurantId === r.id && v.voteValue === 1).length}
                                                                    </div>
                                                                    <div className="flex items-center gap-1 text-red-500 dark:text-red-400 font-bold bg-red-50 dark:bg-red-900/10 px-2 py-1 rounded border border-red-100 dark:border-red-900/20">
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
                                        <div className="flex-1 w-full max-w-md mx-auto px-4 flex flex-col justify-center relative pb-24">
                                            {sessionRestaurants.length === 0 ? (
                                                <div className="text-center text-text-secondary">
                                                    No restaurants found for session.
                                                </div>
                                            ) : swipeFinished ? (
                                                <div className="w-full max-w-sm mx-auto bg-white dark:bg-card-dark rounded-3xl shadow-xl p-8 text-center space-y-6 animate-in zoom-in">
                                                    <div className="inline-flex p-6 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full mb-2">
                                                        <CheckCircle size={48} />
                                                    </div>
                                                    <h3 className="text-2xl font-black dark:text-white">All Caught Up!</h3>
                                                    <p className="text-text-secondary">You've voted on all restaurants.</p>
                                                    
                                                    <div className="grid gap-3 pt-2">
                                                        <button 
                                                            onClick={() => setShowResults(true)} 
                                                            className="w-full py-3 bg-forest-green dark:bg-accent-herb text-white dark:text-black rounded-xl font-bold hover:bg-gray-800 dark:hover:bg-herb-hover transition-all flex items-center justify-center gap-2 shadow-lg shadow-forest-green/20 dark:shadow-accent-herb/20"
                                                        >
                                                            <BarChart3 size={20} /> View Live Results
                                                        </button>
                                                        
                                                        <button onClick={() => { setSwipeIndex(0); setSwipeFinished(false); }} className="w-full py-3 bg-bg-subtle dark:bg-white/5 text-text-main dark:text-white rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-white/10 transition-all flex items-center justify-center gap-2 border border-border-thin dark:border-border-dark">
                                                            <RotateCcw size={18} /> Review Again
                                                        </button>
                                                        
                                                        <button onClick={handleBackToList} className="w-full py-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl font-bold transition-all border border-transparent hover:border-red-100 dark:hover:border-red-900/30">
                                                            Exit Session
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="relative w-full aspect-[3/4]">
                                                    {swipeIndex + 1 < sessionRestaurants.length && (
                                                        <div className="absolute inset-0 bg-white dark:bg-card-dark rounded-3xl shadow-xl transform scale-95 translate-y-4 opacity-50 border border-border-thin dark:border-border-dark"></div>
                                                    )}
                                                    {sessionRestaurants[swipeIndex] && (
                                                        <SwipeableCard 
                                                            key={sessionRestaurants[swipeIndex]?.id || 'loading'}
                                                            restaurant={sessionRestaurants[swipeIndex]} 
                                                            onVote={(val) => submitVote(sessionRestaurants[swipeIndex].id, val)}
                                                        />
                                                    )}
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

            {view === 'list' && (
                <div className="absolute bottom-8 right-8 flex flex-col gap-4 z-30">
                    <button 
                        onClick={() => setView('decide')}
                        className="size-16 bg-white dark:bg-card-dark text-forest-green dark:text-accent-herb rounded-full shadow-xl flex items-center justify-center hover:scale-105 transition-all duration-300 group"
                        title="Help us Decide"
                    >
                        <Play size={28} fill="currentColor" className="group-hover:scale-110 transition-transform" />
                    </button>
                    <button 
                        onClick={() => openForm()}
                        className="size-16 bg-forest-green dark:bg-accent-herb text-white rounded-full shadow-xl flex items-center justify-center hover:bg-forest-green/90 dark:hover:bg-herb-hover hover:scale-105 transition-all duration-300 group"
                        title="Add Restaurant"
                    >
                        <Plus size={32} className="group-hover:rotate-90 transition-transform duration-300" />
                    </button>
                </div>
            )}

            {showAuth && (
                <AuthModal 
                    onClose={() => setShowAuth(false)} 
                    onSuccess={() => setShowAuth(false)} 
                    initialView="login"
                />
            )}

            {showDeleteModal && restaurantToDelete && (
                <DeleteConfirmationModal 
                    isOpen={showDeleteModal} 
                    itemName={restaurantToDelete.name} 
                    onClose={() => { setShowDeleteModal(false); setRestaurantToDelete(null); }} 
                    onConfirm={confirmDeleteRestaurant} 
                />
            )}

            {isFormOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsFormOpen(false)}></div>
                    <form onSubmit={handleSave} className="relative w-full max-w-4xl bg-white dark:bg-card-dark rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden transform transition-all border border-border-thin dark:border-border-dark" onClick={e => e.stopPropagation()}>
                        
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border-thin dark:border-border-dark bg-white dark:bg-card-dark">
                            <div className="flex items-center gap-3">
                                <div className="bg-forest-green dark:bg-accent-herb text-white dark:text-black p-2 rounded-xl shadow-sm shadow-forest-green/20 dark:shadow-accent-herb/20">
                                    <UtensilsCrossed size={20} />
                                </div>
                                <h2 className="text-xl font-display font-bold text-text-main dark:text-white">
                                    {editingId ? 'Edit Gem' : 'Add New Gem'}
                                </h2>
                            </div>
                            <button type="button" onClick={() => setIsFormOpen(false)} className="p-2 rounded-full hover:bg-bg-subtle dark:hover:bg-white/10 transition-colors text-text-secondary">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Scrollable Body */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-bg-subtle dark:bg-bg-dark">
                            <div className="grid grid-cols-12 gap-6">
                                
                                {/* Left Column */}
                                <div className="col-span-12 lg:col-span-8 space-y-6">
                                    
                                    {/* Basic Info Card */}
                                    <div className="bg-white dark:bg-card-dark p-5 rounded-2xl shadow-sm border border-border-thin dark:border-border-dark space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="col-span-1 md:col-span-2">
                                                <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">Name</label>
                                                <input required type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full rounded-xl border-border-thin dark:border-border-dark bg-bg-subtle dark:bg-black/20 px-4 py-3 text-sm focus:border-forest-green dark:focus:border-accent-herb focus:ring-forest-green dark:focus:ring-accent-herb text-text-main dark:text-white placeholder-gray-400 font-medium transition-all outline-none border" placeholder="Restaurant Name" />
                                            </div>
                                            <div className="col-span-1 md:col-span-2">
                                                <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">Cuisine Tags</label>
                                                <div className="relative">
                                                    <Search className="absolute left-3 top-3 text-gray-400" size={18} />
                                                    <input type="text" value={Array.isArray(formData.cuisineTags) ? formData.cuisineTags.join(', ') : formData.cuisineTags || ''} onChange={e => setFormData({...formData, cuisineTags: e.target.value as any})} className="w-full pl-10 rounded-xl border-border-thin dark:border-border-dark bg-bg-subtle dark:bg-black/20 px-4 py-3 text-sm focus:border-forest-green dark:focus:border-accent-herb focus:ring-forest-green dark:focus:ring-accent-herb text-text-main dark:text-white placeholder-gray-400 font-medium transition-all outline-none border" placeholder="Italian, Pizza, Fast Food..." />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Rating & Price Card */}
                                    <div className="bg-white dark:bg-card-dark p-5 rounded-2xl shadow-sm border border-border-thin dark:border-border-dark">
                                        <div className="flex flex-col sm:flex-row gap-6">
                                            <div className="flex-1">
                                                <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">Rating</label>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {[1, 2, 3].map(s => (
                                                        <button key={s} type="button" onClick={() => setFormData({...formData, stars: s === formData.stars ? 0 : s})} className={`group p-2 rounded-xl border transition-all flex flex-col items-center gap-1 flex-1 sm:flex-none sm:min-w-[70px] ${formData.stars && formData.stars >= s ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-900/50' : 'bg-transparent border-transparent hover:bg-bg-subtle dark:hover:bg-white/5'}`}>
                                                        <ChefHat size={24} className={`transition-all ${formData.stars && formData.stars >= s ? 'text-yellow-500 fill-yellow-500 scale-110' : 'text-gray-300 dark:text-gray-600'}`} />
                                                            <span className={`text-[10px] font-bold ${formData.stars && formData.stars >= s ? 'text-yellow-700 dark:text-yellow-400' : 'text-gray-400'}`}>
                                                                {s === 1 ? 'Good' : s === 2 ? 'Great' : 'Super'}
                                                            </span>
                                                        </button>
                                                    ))}
                                                    <div className="w-px h-10 bg-border-thin dark:bg-border-dark mx-1 sm:mx-2 hidden sm:block"></div>
                                                    <button 
                                                        type="button" 
                                                        onClick={() => setFormData({...formData, isApproved: !formData.isApproved})}
                                                        className={`group flex flex-col items-center gap-1 p-2 rounded-xl transition-all flex-1 sm:flex-none sm:min-w-[60px] ${formData.isApproved ? 'bg-blue-50 border border-blue-200 dark:bg-blue-900/20 dark:border-blue-900/50' : 'border border-transparent hover:bg-bg-subtle dark:hover:bg-white/5'}`}
                                                    >
                                                        <div className={`size-6 flex items-center justify-center transition-all ${formData.isApproved ? 'text-blue-500' : 'text-gray-300 dark:text-gray-600'}`}>
                                                            <BadgeCheck size={24} className={formData.isApproved ? "text-blue-500" : "text-gray-300"} />
                                                        </div>
                                                        <span className={`text-[10px] font-bold ${formData.isApproved ? 'text-blue-700 dark:text-blue-400' : 'text-gray-400'}`}>Verified</span>
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="w-px bg-border-thin dark:bg-border-dark hidden sm:block"></div>
                                            <div>
                                                <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">Price</label>
                                                <div className="flex flex-wrap bg-bg-subtle dark:bg-black/20 p-1.5 rounded-xl border border-border-thin dark:border-border-dark">
                                                    {['$', '$$', '$$$', '$$$$'].map(p => (
                                                        <button 
                                                            key={p} 
                                                            type="button"
                                                            onClick={() => setFormData({...formData, price: p as any})} 
                                                            className={`px-3 py-2 text-xs font-bold rounded-lg transition-all flex-1 sm:flex-none ${formData.price === p ? 'bg-white dark:bg-card-dark text-text-main dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                                                        >
                                                            {p}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Schedule Card */}
                                    <div className="bg-white dark:bg-card-dark p-5 rounded-2xl shadow-sm border border-border-thin dark:border-border-dark">
                                        <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">Operating Hours</label>
                                        <div className="flex items-center justify-between gap-1 mb-4">
                                            {DAYS.map(day => (
                                                <button 
                                                    key={day.id}
                                                    type="button" 
                                                    onClick={() => toggleSchedDay(day.id)}
                                                    className={`size-7 sm:size-9 shrink-0 rounded-full text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center border ${schedDays.has(day.id) ? 'bg-forest-green dark:bg-accent-herb text-white dark:text-black border-forest-green dark:border-accent-herb shadow-md shadow-forest-green/30 dark:shadow-accent-herb/30' : 'bg-bg-subtle dark:bg-white/5 border-border-thin dark:border-border-dark text-gray-400 hover:border-forest-green/50 dark:hover:border-accent-herb/50'}`}
                                                >
                                                    {day.label}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="flex flex-col sm:flex-row items-center gap-3 p-4 bg-bg-subtle dark:bg-black/20 rounded-xl border border-border-thin dark:border-border-dark">
                                            <div className="flex items-center gap-2 w-full sm:flex-1 bg-white dark:bg-card-dark rounded-lg p-1 border border-border-thin dark:border-white/5 shadow-sm">
                                                <Clock size={14} className="text-text-secondary ml-2 shrink-0" />
                                                <input 
                                                    type="text"
                                                    value={parseTime(schedStart).time} 
                                                    onChange={e => handleTimeChange(e.target.value, schedStart, setSchedStart)}
                                                    onBlur={() => validateAndFormatTime(schedStart, setSchedStart)}
                                                    className="bg-transparent border-none text-sm font-bold text-text-main dark:text-white font-sans focus:ring-0 py-1 pl-1 w-full"
                                                    placeholder="11:00"
                                                />
                                                <div className="w-px h-4 bg-border-thin dark:bg-white/10 shrink-0"></div>
                                                <div className="relative shrink-0">
                                                    <button 
                                                        type="button"
                                                        onClick={() => setIsStartPeriodOpen(!isStartPeriodOpen)}
                                                        className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-forest-green dark:text-accent-herb hover:bg-bg-subtle dark:hover:bg-white/5 rounded transition-colors"
                                                    >
                                                        {parseTime(schedStart).period}
                                                        <ChevronDown size={12} className={`transition-transform ${isStartPeriodOpen ? 'rotate-180' : ''}`} />
                                                    </button>
                                                    {isStartPeriodOpen && (
                                                        <div className="absolute top-full right-0 mt-1 w-20 bg-white dark:bg-card-dark rounded-lg shadow-xl border border-border-thin dark:border-border-dark overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-200">
                                                            {['AM', 'PM'].map(p => (
                                                                <button
                                                                    key={p}
                                                                    type="button"
                                                                    onClick={() => { setSchedStart(`${parseTime(schedStart).time} ${p}`); setIsStartPeriodOpen(false); }}
                                                                    className={`w-full text-left px-3 py-2 text-xs font-bold transition-colors hover:bg-bg-subtle dark:hover:bg-white/5 ${parseTime(schedStart).period === p ? 'text-forest-green dark:text-accent-herb bg-forest-green/5' : 'text-text-main dark:text-gray-300'}`}
                                                                >
                                                                    {p}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            <span className="text-gray-400 font-medium text-xs uppercase shrink-0">to</span>
                                            
                                            <div className="flex items-center gap-2 w-full sm:flex-1 bg-white dark:bg-card-dark rounded-lg p-1 border border-border-thin dark:border-white/5 shadow-sm">
                                                <Clock size={14} className="text-text-secondary ml-2 shrink-0" />
                                                <input 
                                                    type="text"
                                                    value={parseTime(schedEnd).time} 
                                                    onChange={e => handleTimeChange(e.target.value, schedEnd, setSchedEnd)}
                                                    onBlur={() => validateAndFormatTime(schedEnd, setSchedEnd)}
                                                    className="bg-transparent border-none text-sm font-bold text-text-main dark:text-white font-sans focus:ring-0 py-1 pl-1 w-full"
                                                    placeholder="9:00"
                                                />
                                                <div className="w-px h-4 bg-border-thin dark:bg-white/10 shrink-0"></div>
                                                <div className="relative shrink-0">
                                                    <button 
                                                        type="button"
                                                        onClick={() => setIsEndPeriodOpen(!isEndPeriodOpen)}
                                                        className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-text-secondary hover:bg-bg-subtle dark:hover:bg-white/5 rounded transition-colors"
                                                    >
                                                        {parseTime(schedEnd).period}
                                                        <ChevronDown size={12} className={`transition-transform ${isEndPeriodOpen ? 'rotate-180' : ''}`} />
                                                    </button>
                                                    {isEndPeriodOpen && (
                                                        <div className="absolute top-full right-0 mt-1 w-20 bg-white dark:bg-card-dark rounded-lg shadow-xl border border-border-thin dark:border-border-dark overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-200">
                                                            {['AM', 'PM'].map(p => (
                                                                <button
                                                                    key={p}
                                                                    type="button"
                                                                    onClick={() => { setSchedEnd(`${parseTime(schedEnd).time} ${p}`); setIsEndPeriodOpen(false); }}
                                                                    className={`w-full text-left px-3 py-2 text-xs font-bold transition-colors hover:bg-bg-subtle dark:hover:bg-white/5 ${parseTime(schedEnd).period === p ? 'text-text-main dark:text-white bg-bg-subtle dark:bg-white/5' : 'text-text-secondary dark:text-gray-400'}`}
                                                                >
                                                                    {p}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                </div>

                                {/* Right Column */}
                                <div className="col-span-12 lg:col-span-4 space-y-6">
                                    
                                    {/* Location Card */}
                                    <div className="bg-white dark:bg-card-dark rounded-2xl shadow-sm border border-border-thin dark:border-border-dark overflow-hidden h-48 relative group">
                                        <div className="absolute inset-0 bg-bg-subtle dark:bg-black/40 flex items-center justify-center bg-[url('https://maps.googleapis.com/maps/api/staticmap?center=40.7128,-74.0060&zoom=13&size=600x300&sensor=false&style=feature:all|element:labels|visibility:off')] bg-cover opacity-50">
                                            <MapPin size={32} className="text-gray-400" />
                                        </div>
                                        <div className="absolute bottom-0 inset-x-0 p-3 bg-white/95 dark:bg-card-dark/95 backdrop-blur border-t border-border-thin dark:border-border-dark">
                                            <div className="flex items-center gap-2">
                                                <MapPin size={16} className="text-forest-green dark:text-accent-herb shrink-0" />
                                                <input type="text" value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} className="w-full bg-transparent border-none p-0 text-xs font-bold text-text-main dark:text-white placeholder-gray-400 focus:ring-0" placeholder="Enter address..." />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Cover Photo */}
                                    <div className="bg-white dark:bg-card-dark rounded-2xl shadow-sm border border-border-thin dark:border-border-dark p-5">
                                        <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Cover Photo</label>
                                        
                                        <div className="relative group">
                                            {formData.image ? (
                                                <div className="h-32 w-full rounded-xl bg-cover bg-center border border-border-thin dark:border-border-dark" style={{ backgroundImage: `url("${formData.image}")` }}>
                                                    <button type="button" onClick={() => setFormData({...formData, image: ''})} className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-red-500 transition-colors opacity-0 group-hover:opacity-100">
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <label className={`h-32 border-2 border-dashed border-border-thin dark:border-border-dark rounded-xl flex flex-col items-center justify-center text-center hover:border-forest-green/50 dark:hover:border-accent-herb/50 hover:bg-forest-green/5 dark:hover:bg-accent-herb/5 transition-all cursor-pointer bg-bg-subtle dark:bg-black/20 ${isUploading ? 'opacity-50 cursor-wait' : ''}`}>
                                                    {isUploading ? <Loader className="animate-spin text-forest-green dark:text-accent-herb" size={24}/> : <ImageIcon size={24} className="text-gray-400 mb-2"/>}
                                                    <p className="text-[10px] text-gray-500 font-medium">{isUploading ? 'Uploading...' : 'Drop image or click'}</p>
                                                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={isUploading} />
                                                </label>
                                            )}
                                            <div className="mt-3">
                                                <input type="text" value={formData.image || ''} onChange={e => setFormData({...formData, image: e.target.value})} className="w-full text-[10px] p-2 rounded-lg bg-bg-subtle dark:bg-black/20 border border-border-thin dark:border-border-dark text-text-secondary placeholder-gray-400 focus:outline-none focus:border-forest-green/50 dark:focus:border-accent-herb/50" placeholder="Or paste image URL..." />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Notes */}
                                    <div className="bg-white dark:bg-card-dark rounded-2xl shadow-sm border border-border-thin dark:border-border-dark p-5">
                                        <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Must Try Dish / Notes</label>
                                        <textarea rows={3} value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full rounded-xl border-border-thin dark:border-border-dark bg-bg-subtle dark:bg-black/20 px-3 py-2 text-sm focus:border-forest-green dark:focus:border-accent-herb focus:ring-forest-green dark:focus:ring-accent-herb text-text-main dark:text-white placeholder-gray-400 transition-shadow resize-none outline-none border" placeholder="e.g. Spicy Rigatoni..." />
                                    </div>

                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-border-thin dark:border-border-dark bg-white dark:bg-card-dark flex flex-col sm:flex-row justify-between items-center gap-4">
                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 w-full sm:w-auto">
                                <div className="relative">
                                    <button 
                                        type="button"
                                        onClick={() => setIsFamilySelectorOpen(!isFamilySelectorOpen)}
                                        className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg bg-bg-subtle dark:bg-black/20 border border-border-thin dark:border-border-dark hover:border-forest-green/50 dark:hover:border-accent-herb/50 text-xs font-bold text-text-main dark:text-text-main-dark transition-all shadow-sm"
                                    >
                                        {targetFamilyId === 'private' ? <Lock size={14} className="text-forest-green dark:text-accent-herb" /> : <Users size={14} className="text-forest-green dark:text-accent-herb" />}
                                        <span className="text-xs font-bold text-text-secondary uppercase mr-1 hidden sm:inline">Save to:</span>
                                        <span>{targetFamilyId === 'private' ? 'Private List' : availableSessions.find(s => s.id === targetFamilyId)?.name || 'Select Family'}</span>
                                        <ChevronDown size={14} className={`text-text-secondary transition-transform ${isFamilySelectorOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isFamilySelectorOpen && (
                                        <div className="absolute bottom-full left-0 mb-2 w-56 bg-white dark:bg-card-dark rounded-xl shadow-xl border border-border-thin dark:border-border-dark overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-200">
                                            <div className="py-1">
                                                <button
                                                    type="button"
                                                    onClick={() => { setTargetFamilyId('private'); setIsFamilySelectorOpen(false); }}
                                                    className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${targetFamilyId === 'private' ? 'bg-forest-green/5 dark:bg-accent-herb/10 text-forest-green dark:text-accent-herb' : 'text-text-main dark:text-text-main-dark'}`}
                                                >
                                                    <Lock size={16} />
                                                    <span className="text-sm font-bold">Private List</span>
                                                    {targetFamilyId === 'private' && <Check size={14} className="ml-auto" />}
                                                </button>
                                                <div className="h-px bg-border-thin dark:border-border-dark mx-3 my-1"></div>
                                                {availableSessions.map(s => {
                                                    const isPrimary = targetFamilyId === s.id;
                                                    
                                                    return (
                                                        <button
                                                            key={s.id}
                                                            type="button"
                                                            onClick={() => { setTargetFamilyId(s.id); setIsFamilySelectorOpen(false); }}
                                                            className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${isPrimary ? 'bg-forest-green/5 dark:bg-accent-herb/10 text-forest-green dark:text-accent-herb' : 'text-text-main dark:text-text-main-dark'}`}
                                                        >
                                                            <Users size={16} />
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-bold">{s.name}</span>
                                                                {s.id === currentFamilyId && <span className="text-[10px] text-text-secondary uppercase font-bold">Current</span>}
                                                            </div>
                                                            {isPrimary && <Check size={14} className="ml-auto" />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                
                                {targetFamilyId !== 'private' && (
                                    <div 
                                        onClick={() => setSyncToAll(!syncToAll)}
                                        className="flex items-center gap-2 cursor-pointer select-none"
                                    >
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${syncToAll ? 'bg-forest-green dark:bg-accent-herb border-forest-green dark:border-accent-herb' : 'border-gray-400 bg-transparent'}`}>
                                            {syncToAll && <Check size={10} className="text-white dark:text-black" />}
                                        </div>
                                        <span className="text-xs font-bold text-text-secondary hover:text-forest-green dark:hover:text-accent-herb transition-colors">
                                            {availableSessions.length > 1 ? "Sync to all" : "Sync"}
                                        </span>
                                    </div>
                                )}

                                {editingId && (
                                    <button type="button" onClick={() => handleDelete(editingId)} className="text-red-400 hover:text-red-500 text-sm font-bold flex items-center gap-1 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10">
                                        <Trash2 size={16} /> Delete
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-3 w-full sm:w-auto">
                                <button type="button" onClick={() => setIsFormOpen(false)} className="flex-1 sm:flex-none px-6 py-3 rounded-xl text-sm font-bold text-text-secondary hover:bg-bg-subtle dark:hover:bg-white/5 transition-colors">
                                    Cancel
                                </button>
                                <button type="submit" className="flex-1 sm:flex-none px-8 py-3 rounded-xl text-sm font-bold bg-forest-green dark:bg-accent-herb text-white dark:text-black hover:bg-gray-800 dark:hover:bg-herb-hover shadow-lg shadow-forest-green/30 dark:shadow-accent-herb/30 transform hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2">
                                    {editingId ? 'Update Gem' : 'Save Gem'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default RestaurantList;
