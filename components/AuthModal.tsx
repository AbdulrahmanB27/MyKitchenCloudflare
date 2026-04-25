
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Loader, UserPlus, Users, X, ShieldAlert, LogOut, CheckCircle, Plus, Eye, EyeOff, Link as LinkIcon, Settings, Share2, ChevronDown } from 'lucide-react';
import * as db from '../services/db';
import { sanitize, isNotEmpty } from '../utils/validation';

interface AuthModalProps {
    onClose: () => void;
    onSuccess: () => void;
    initialView?: 'login' | 'register' | 'switch' | 'admin';
    initialFamilyName?: string;
    showToast?: (message: string, type?: 'success' | 'error') => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ onClose, onSuccess, initialView = 'login', initialFamilyName = '', showToast }) => {
    const INPUT_CLASS = "w-full p-3 rounded-xl border border-border-thin dark:border-border-dark bg-bg-subtle dark:bg-card-dark/50 text-text-main dark:text-text-main-dark font-sans outline-none focus:ring-2 focus:ring-forest-green dark:focus:ring-accent-herb transition-all placeholder:text-text-secondary/50";
    const LABEL_CLASS = "block text-xs font-bold text-text-secondary uppercase mb-1";

    const [mode, setMode] = useState<'login' | 'register' | 'admin' | 'switch'>(initialView);
    const [familyName, setFamilyName] = useState(initialFamilyName);
    const [password, setPassword] = useState('');
    const [adminPassword, setAdminPassword] = useState('');
    
    // Admin Actions State
    const [adminAction, setAdminAction] = useState<'update'|'delete'|'rename'|'view_password'|'links'>('update');
    const [isAdminActionOpen, setIsAdminActionOpen] = useState(false);
    const adminActionDropdownRef = React.useRef<HTMLDivElement>(null);

    const [newFamilyPassword, setNewFamilyPassword] = useState('');
    const [newAdminPassword, setNewAdminPassword] = useState('');
    const [newFamilyName, setNewFamilyName] = useState('');
    
    // UI State for Passwords
    const [showPassword, setShowPassword] = useState(false);
    const [showAdminPassword, setShowAdminPassword] = useState(false);
    const [showNewFamilyPassword, setShowNewFamilyPassword] = useState(false);
    const [showNewAdminPassword, setShowNewAdminPassword] = useState(false);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    
    // UI Drawer State (Mutually Exclusive)
    const [activeDrawer, setActiveDrawer] = useState<'password' | 'share' | null>(null);
    
    // Turnstile
    const [turnstileToken, setTurnstileToken] = useState('');
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [confirmLeaveFamily, setConfirmLeaveFamily] = useState<{ id: string, name: string } | null>(null);
    const quickShareFamily = activeDrawer === 'share' ? { id: db.getCurrentFamilyId() || '', name: db.getCurrentFamilyName() } : null;
    const showPasswordInline = activeDrawer === 'password';

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (adminActionDropdownRef.current && !adminActionDropdownRef.current.contains(event.target as Node)) {
                setIsAdminActionOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        // Initialize Turnstile if available
        let widgetId: string | undefined;
        if ((window as any).turnstile) {
            try {
                // Clear container first to be safe
                const container = document.getElementById('turnstile-container');
                if (container) container.innerHTML = '';
                
                widgetId = (window as any).turnstile.render('#turnstile-container', {
                    sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAAAzyj7W1jX7W1jX7', // Use env or fallback to demo
                    callback: (token: string) => setTurnstileToken(token),
                });
            } catch(e) {
                console.warn("Turnstile render error", e);
            }
        }
        return () => {
            if (widgetId && (window as any).turnstile) {
                try {
                    (window as any).turnstile.remove(widgetId);
                } catch (e) {}
            }
        };
    }, [mode]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const cleanFamilyName = sanitize(familyName);
        if (!isNotEmpty(cleanFamilyName)) {
            setError('Family name is required');
            return;
        }

        setLoading(true);
        setError('');
        const res = await db.authenticate(cleanFamilyName, password, turnstileToken); // db.authenticate handles token storage safely
        setLoading(false);
        if (res.success) {
            onSuccess();
            onClose();
        } else {
            setError(res.error || 'Login failed');
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();

        const cleanFamilyName = sanitize(familyName);
        if (!isNotEmpty(cleanFamilyName)) {
            setError('Family name is required');
            return;
        }

        setLoading(true);
        setError('');
        const res = await db.registerFamily(cleanFamilyName, password, adminPassword, turnstileToken);
        setLoading(false);
        if (res.success) {
            onSuccess();
            onClose();
        } else {
            setError(res.error || 'Registration failed');
        }
    };

    // Links State
    const [generatedLinks, setGeneratedLinks] = useState<{ temp?: string, view?: string, permanent?: string }>({});

    const handleGenerateLink = async (type: 'temporary' | 'view' | 'permanent') => {
        if (type === 'permanent') {
            const familyName = db.getCurrentFamilyName();
            const link = `${window.location.origin}/?join_family=${encodeURIComponent(familyName)}`;
            setGeneratedLinks(prev => ({ ...prev, permanent: link }));
            return;
        }

        setLoading(true);
        const res = await db.generateFamilyLink(type);
        setLoading(false);
        if (res.success) {
            const queryParam = type === 'temporary' ? 'temp_join' : 'view_family';
            const link = `${window.location.origin}/?${queryParam}=${res.token}`;
            setGeneratedLinks(prev => ({ ...prev, [type === 'temporary' ? 'temp' : type]: link }));
        } else {
            setError(res.error || `Failed to generate ${type} link`);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        if (showToast) {
            showToast('Link copied to clipboard!');
        } else {
            alert('Link copied to clipboard!');
        }
    };

    const handleAdminSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (adminAction === 'view_password' || adminAction === 'links') return;

        setLoading(true);
        setError('');

        let actionType: 'update_passwords' | 'delete_family' | 'rename_family' = 'update_passwords';
        let payload: any = { adminPassword };

        if (adminAction === 'update') {
            actionType = 'update_passwords';
            payload.newFamilyPassword = newFamilyPassword;
            payload.newAdminPassword = newAdminPassword;
        } else if (adminAction === 'delete') {
            actionType = 'delete_family';
        } else if (adminAction === 'rename') {
            actionType = 'rename_family';
            payload.newFamilyName = newFamilyName;
        }

        const res = await db.adminAction(actionType, payload);
        
        setLoading(false);
        if (res.success) {
            if (adminAction === 'delete') {
                if (showToast) showToast('Family deleted.');
                db.logout(); // Use safe logout
                onClose();
            } else if (adminAction === 'rename') {
                if (showToast) showToast('Family renamed.');
                // Update local storage name safely
                db.safeSetItem('current_family_name', newFamilyName);
                onSuccess(); // Trigger refresh
                onClose();
            } else {
                if (showToast) showToast('Updated successfully.');
                onClose();
            }
        } else {
            setError(res.error || 'Action failed');
        }
    };

    const sessions = db.getSavedSessions(); // This uses safeGetItem now

    return (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="relative w-full max-w-md bg-white dark:bg-card-dark rounded-2xl shadow-2xl border border-border-thin dark:border-border-dark overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                
                {/* Header with Tabs */}
                <div className="bg-white dark:bg-card-dark border-b border-border-thin dark:border-border-dark flex flex-col">
                    <div className="p-6 flex justify-between items-center pb-2">
                        <h2 className="text-xl font-bold text-text-main dark:text-white flex items-center gap-2">
                            {mode === 'login' && <Lock size={20} className="text-forest-green dark:text-accent-herb"/>}
                            {mode === 'register' && <UserPlus size={20} className="text-forest-green dark:text-accent-herb"/>}
                            {mode === 'admin' && <ShieldAlert size={20} className="text-red-500"/>}
                            {mode === 'switch' && <Users size={20} className="text-blue-500"/>}
                            
                            {mode === 'login' && 'Login'}
                            {mode === 'register' && 'New Family'}
                            {mode === 'admin' && 'Family Management'}
                            {mode === 'switch' && 'Family Accounts'}
                        </h2>
                        <button onClick={onClose} aria-label="Close modal"><X size={20} className="text-text-secondary hover:text-text-main dark:hover:text-white"/></button>
                    </div>

                    {(mode === 'switch') && (
                        <div className="flex px-6 gap-6">
                            <button 
                                onClick={() => setMode('switch')}
                                className={`pb-3 text-sm font-bold transition-all border-b-2 border-forest-green dark:border-accent-herb text-forest-green dark:text-accent-herb`}
                            >
                                Families
                            </button>
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto custom-scrollbar bg-bg-subtle dark:bg-bg-dark">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg flex items-center gap-2 border border-red-100 dark:border-red-900/30">
                            <ShieldAlert size={16} /> {error}
                        </div>
                    )}

                    {mode === 'switch' && (
                        <div className="space-y-3">
                            <p className="text-sm text-text-secondary mb-2">Select a saved family session:</p>
                            {sessions.map(s => (
                                <React.Fragment key={s.id}>
                                    <div 
                                        className={`w-full rounded-xl border flex items-stretch group transition-all mb-2 overflow-hidden ${s.id === db.getCurrentFamilyId() ? 'border-forest-green dark:border-accent-herb bg-white dark:bg-card-dark shadow-sm' : 'border-border-thin dark:border-border-dark bg-white dark:bg-card-dark hover:border-forest-green/50 dark:hover:border-accent-herb/50'}`}
                                    >
                                        <button 
                                            onClick={() => db.switchFamily(s.id)}
                                            className="flex-1 p-4 flex flex-col items-start text-left"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-text-main dark:text-white">{s.name}</span>
                                                {s.id === db.getCurrentFamilyId() && <CheckCircle size={14} className="text-forest-green dark:text-accent-herb"/>}
                                            </div>
                                            {s.id === db.getCurrentFamilyId() && (
                                                <span className="text-[10px] text-forest-green dark:text-accent-herb font-bold uppercase tracking-wider mt-0.5">Active Session</span>
                                            )}
                                        </button>
                                        
                                        <div className="flex items-stretch">
                                            {s.id === db.getCurrentFamilyId() && (
                                                <>
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (activeDrawer === 'share') {
                                                                setActiveDrawer(null);
                                                            } else {
                                                                setActiveDrawer('share');
                                                                setConfirmLeaveFamily(null);
                                                            }
                                                        }}
                                                        className={`px-3 flex items-center justify-center transition-colors ${activeDrawer === 'share' ? 'text-forest-green dark:text-accent-herb' : 'text-text-secondary hover:text-forest-green dark:hover:text-accent-herb'}`}
                                                        title="Share Links"
                                                    >
                                                        <Share2 size={18} />
                                                    </button>
                                                    <div className="flex items-center">
                                                        <div className="w-px h-6 bg-border-thin dark:bg-border-dark opacity-30"></div>
                                                    </div>
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (activeDrawer === 'password') {
                                                                setActiveDrawer(null);
                                                            } else {
                                                                setActiveDrawer('password');
                                                                setConfirmLeaveFamily(null);
                                                            }
                                                        }}
                                                        className={`px-3 flex items-center justify-center transition-colors ${activeDrawer === 'password' ? 'text-forest-green dark:text-accent-herb' : 'text-text-secondary hover:text-forest-green dark:hover:text-accent-herb'}`}
                                                        title="View Password"
                                                    >
                                                        {activeDrawer === 'password' ? <EyeOff size={18} /> : <Eye size={18} />}
                                                    </button>
                                                    <div className="flex items-center">
                                                        <div className="w-px h-6 bg-border-thin dark:bg-border-dark opacity-30"></div>
                                                    </div>
                                                </>
                                            )}
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setConfirmLeaveFamily({ id: s.id, name: s.name });
                                                    setActiveDrawer(null);
                                                }}
                                                className="px-5 text-red-500/80 hover:text-white transition-all bg-red-500/10 dark:bg-red-500/5 hover:bg-red-500 flex items-center justify-center"
                                                title="Leave Family"
                                            >
                                                <LogOut size={20} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Inline Detail Drawers */}
                                    {showPasswordInline && s.id === db.getCurrentFamilyId() && s.id !== 'private' && (
                                        <motion.div 
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="p-4 bg-white dark:bg-card-dark border border-border-thin dark:border-border-dark rounded-xl space-y-3 shadow-sm mb-3 overflow-hidden"
                                        >
                                            <div className="flex justify-between items-center">
                                                <h4 className="text-xs font-bold text-text-secondary uppercase">Access Password</h4>
                                                <button onClick={() => setActiveDrawer(null)} className="text-text-secondary hover:text-text-main dark:hover:text-white"><X size={14} /></button>
                                            </div>
                                            <div className="flex items-center gap-3 bg-bg-subtle dark:bg-white/5 p-3 rounded-lg border border-border-thin dark:border-border-dark">
                                                <div className="font-mono text-base font-bold text-text-main dark:text-white tracking-wider flex-1 text-center">
                                                    {db.getCurrentFamilyPassword() || 'Not stored securely'}
                                                </div>
                                                <button 
                                                    onClick={() => copyToClipboard(db.getCurrentFamilyPassword() || '')}
                                                    className="text-[10px] font-bold px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-text-main dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                            {!db.getCurrentFamilyPassword() && (
                                                <p className="text-[10px] text-text-secondary leading-tight">Password not stored on this device. Log out & back in to save it.</p>
                                            )}
                                        </motion.div>
                                    )}

                                    {quickShareFamily?.id === s.id && (
                                        <motion.div 
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="p-4 bg-forest-green/5 dark:bg-accent-herb/5 border border-forest-green/20 dark:border-accent-herb/20 rounded-xl space-y-4 mb-3 overflow-hidden"
                                        >
                                            <div className="flex justify-between items-center">
                                                <h4 className="text-sm font-bold text-text-main dark:text-white">Share "{quickShareFamily.name}"</h4>
                                                <button onClick={() => setActiveDrawer(null)} className="text-text-secondary hover:text-text-main dark:hover:text-white"><X size={16} /></button>
                                            </div>
                                            <div className="grid grid-cols-1 gap-2">
                                                {db.isCurrentFamilyAdmin() && (
                                                    <div className="flex flex-col gap-1">
                                                        <button 
                                                            onClick={() => handleGenerateLink('permanent')}
                                                            className="w-full p-3 rounded-lg border border-border-thin dark:border-border-dark hover:border-forest-green dark:hover:border-accent-herb hover:bg-white dark:hover:bg-white/5 transition-all text-left"
                                                        >
                                                            <div className="font-bold text-xs text-text-main dark:text-white">Permanent Link</div>
                                                            <div className="text-[10px] text-text-secondary">Requires family password to join.</div>
                                                        </button>
                                                        {generatedLinks.permanent && (
                                                            <div className="flex gap-2">
                                                                <input readOnly value={generatedLinks.permanent} className="text-xs flex-1 p-2 rounded bg-white dark:bg-card-dark border border-border-thin dark:border-border-dark" />
                                                                <button type="button" onClick={() => copyToClipboard(generatedLinks.permanent!)} className="text-xs px-2 bg-gray-200 dark:bg-gray-700 rounded text-text-main dark:text-white">Copy</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                <div className="flex flex-col gap-1">
                                                    <button 
                                                        onClick={() => handleGenerateLink('temporary')}
                                                        className="w-full p-3 rounded-lg border border-border-thin dark:border-border-dark hover:border-forest-green dark:hover:border-accent-herb hover:bg-white dark:hover:bg-white/5 transition-all text-left"
                                                    >
                                                        <div className="font-bold text-xs text-text-main dark:text-white">Temporary VIP Link</div>
                                                        <div className="text-[10px] text-text-secondary">Skips password. Expires in 24h.</div>
                                                    </button>
                                                    {generatedLinks.temp && (
                                                        <div className="flex gap-2">
                                                            <input readOnly value={generatedLinks.temp} className="text-xs flex-1 p-2 rounded bg-white dark:bg-card-dark border border-border-thin dark:border-border-dark" />
                                                            <button type="button" onClick={() => copyToClipboard(generatedLinks.temp!)} className="text-xs px-2 bg-gray-200 dark:bg-gray-700 rounded text-text-main dark:text-white">Copy</button>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <button 
                                                        onClick={() => handleGenerateLink('view')}
                                                        className="w-full p-3 rounded-lg border border-border-thin dark:border-border-dark hover:border-forest-green dark:hover:border-accent-herb hover:bg-white dark:hover:bg-white/5 transition-all text-left"
                                                    >
                                                        <div className="font-bold text-xs text-text-main dark:text-white">Read-Only Link</div>
                                                        <div className="text-[10px] text-text-secondary">Public view of family recipes.</div>
                                                    </button>
                                                    {generatedLinks.view && (
                                                        <div className="flex gap-2">
                                                            <input readOnly value={generatedLinks.view} className="text-xs flex-1 p-2 rounded bg-white dark:bg-card-dark border border-border-thin dark:border-border-dark" />
                                                            <button type="button" onClick={() => copyToClipboard(generatedLinks.view!)} className="text-xs px-2 bg-gray-200 dark:bg-gray-700 rounded text-text-main dark:text-white">Copy</button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </React.Fragment>
                            ))}
                            
                            {confirmLeaveFamily && (
                                <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl space-y-4 animate-in slide-in-from-top-2 duration-200">
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full text-red-600 dark:text-red-400">
                                            <ShieldAlert size={20} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-red-950 dark:text-red-200">Leave "{confirmLeaveFamily.name}"?</h4>
                                            <p className="text-xs text-red-800/70 dark:text-red-400/70 mt-1">
                                                You will need the password to join this family again.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => {
                                                db.logout(confirmLeaveFamily.id);
                                                setConfirmLeaveFamily(null);
                                                setRefreshTrigger(prev => prev + 1);
                                            }}
                                            className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold transition-colors"
                                        >
                                            Leave
                                        </button>
                                        <button 
                                            onClick={() => setConfirmLeaveFamily(null)}
                                            className="flex-1 py-2 bg-white dark:bg-card-dark border border-border-thin dark:border-border-dark text-text-main dark:text-white rounded-lg text-xs font-bold hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                            
                            <div className="pt-4 border-t border-border-thin dark:border-border-dark flex flex-col gap-2">
                                <button onClick={() => setMode('login')} className="w-full py-3 rounded-xl border border-dashed border-border-thin dark:border-border-dark text-text-secondary hover:text-forest-green dark:hover:text-accent-herb hover:border-forest-green/50 dark:hover:border-accent-herb/50 transition-colors flex items-center justify-center gap-2 font-medium hover:bg-white dark:hover:bg-white/5">
                                    <Plus size={18} /> Join Family
                                </button>
                                <button onClick={() => setMode('register')} className="w-full py-3 rounded-xl border border-dashed border-border-thin dark:border-border-dark text-text-secondary hover:text-forest-green dark:hover:text-accent-herb hover:border-forest-green/50 dark:hover:border-accent-herb/50 transition-colors flex items-center justify-center gap-2 font-medium hover:bg-white dark:hover:bg-white/5">
                                    <UserPlus size={18} /> Create New Family
                                </button>
                                <button onClick={() => db.logout()} className="w-full py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex items-center justify-center gap-2 font-bold mt-2 border border-red-100 dark:border-red-900/30">
                                    <LogOut size={18} /> Log Out All
                                </button>
                            </div>
                        </div>
                    )}

                    {(mode === 'login' || mode === 'register') && (
                        <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-text-secondary uppercase mb-1">Family Name</label>
                                <input required type="text" value={familyName} onChange={e => setFamilyName(e.target.value)} className="w-full p-3 rounded-xl bg-bg-subtle dark:bg-white/5 border border-border-thin dark:border-border-dark focus:ring-2 focus:ring-forest-green dark:focus:ring-accent-herb outline-none text-text-main dark:text-white placeholder:text-gray-400 transition-all" placeholder="The Smiths" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-text-secondary uppercase mb-1">Access Password</label>
                                <div className="relative">
                                    <input required type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 pr-10 rounded-xl bg-bg-subtle dark:bg-white/5 border border-border-thin dark:border-border-dark focus:ring-2 focus:ring-forest-green dark:focus:ring-accent-herb outline-none text-text-main dark:text-white placeholder:text-gray-400 transition-all" placeholder="Shared family password" />
                                    <button type="button" tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-main dark:hover:text-white transition-colors" onClick={() => setShowPassword(!showPassword)}>
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>
                            
                            {mode === 'register' && (
                                <div>
                                    <label className="block text-xs font-bold text-text-secondary uppercase mb-1">Admin Password</label>
                                    <div className="relative">
                                        <input required type={showAdminPassword ? 'text' : 'password'} value={adminPassword} onChange={e => setAdminPassword(e.target.value)} className="w-full p-3 pr-10 rounded-xl bg-bg-subtle dark:bg-white/5 border border-border-thin dark:border-border-dark focus:ring-2 focus:ring-forest-green dark:focus:ring-accent-herb outline-none text-text-main dark:text-white placeholder:text-gray-400 transition-all" placeholder="For managing settings" />
                                        <button type="button" tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-main dark:hover:text-white transition-colors" onClick={() => setShowAdminPassword(!showAdminPassword)}>
                                            {showAdminPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-text-secondary mt-1">Keep this safe! Needed for renaming or deleting the family.</p>
                                </div>
                            )}

                            {/* Turnstile Container */}
                            <div id="turnstile-container" className="my-2 min-h-[65px]"></div>

                            <button type="submit" disabled={loading} className="w-full py-3 bg-forest-green dark:bg-accent-herb hover:bg-gray-800 dark:hover:bg-herb-hover text-white dark:text-black rounded-xl font-bold shadow-lg shadow-forest-green/20 dark:shadow-accent-herb/20 transition-transform hover:scale-[1.02] flex items-center justify-center gap-2">
                                {loading && <Loader size={18} className="animate-spin" />}
                                {mode === 'login' ? 'Enter Kitchen' : 'Create Family'}
                            </button>

                            <div className="text-center pt-2">
                                {mode === 'login' ? (
                                    <button type="button" onClick={() => setMode('register')} className="text-sm text-text-secondary hover:text-forest-green dark:hover:text-accent-herb hover:underline transition-colors">Need a new family account?</button>
                                ) : (
                                    <button type="button" onClick={() => setMode('login')} className="text-sm text-text-secondary hover:text-forest-green dark:hover:text-accent-herb hover:underline transition-colors">Already have an account?</button>
                                )}
                            </div>
                        </form>
                    )}

                    {mode === 'admin' && (
                        <div className="p-4 text-center text-text-secondary">
                            Admin settings have been moved to the active family session item.
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};

export default AuthModal;
