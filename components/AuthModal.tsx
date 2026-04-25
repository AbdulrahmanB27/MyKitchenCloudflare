
import React, { useState, useEffect } from 'react';
import { Lock, Loader, UserPlus, Users, X, ShieldAlert, LogOut, CheckCircle, Plus, Eye, EyeOff, Link as LinkIcon, Settings, Share2 } from 'lucide-react';
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
    const [mode, setMode] = useState<'login' | 'register' | 'admin' | 'switch'>(initialView);
    const [familyName, setFamilyName] = useState(initialFamilyName);
    const [password, setPassword] = useState('');
    const [adminPassword, setAdminPassword] = useState('');
    
    // Admin Actions State
    const [adminAction, setAdminAction] = useState<'update'|'delete'|'rename'|'view_password'|'links'>('update');
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
    
    // Turnstile
    const [turnstileToken, setTurnstileToken] = useState('');
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [confirmLeaveFamily, setConfirmLeaveFamily] = useState<{ id: string, name: string } | null>(null);
    const [quickShareFamily, setQuickShareFamily] = useState<{ id: string, name: string } | null>(null);

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
            setGeneratedLinks(prev => ({ ...prev, [type]: link }));
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

                    {(mode === 'switch' || mode === 'admin') && (
                        <div className="flex px-6 gap-6">
                            <button 
                                onClick={() => setMode('switch')}
                                className={`pb-3 text-sm font-bold transition-all border-b-2 ${mode === 'switch' ? 'border-forest-green dark:border-accent-herb text-forest-green dark:text-accent-herb' : 'border-transparent text-text-secondary hover:text-text-main dark:hover:text-white'}`}
                            >
                                Families
                            </button>
                            {db.getCurrentFamilyId() !== 'private' && (
                                <button 
                                    onClick={() => { setMode('admin'); setAdminAction('update'); }}
                                    className={`pb-3 text-sm font-bold transition-all border-b-2 ${mode === 'admin' ? 'border-forest-green dark:border-accent-herb text-forest-green dark:text-accent-herb' : 'border-transparent text-text-secondary hover:text-text-main dark:hover:text-white'}`}
                                >
                                    Settings & Sharing
                                </button>
                            )}
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
                                <div 
                                    key={s.id} 
                                    className={`w-full rounded-xl border flex items-center group transition-all ${s.id === db.getCurrentFamilyId() ? 'border-forest-green dark:border-accent-herb bg-white dark:bg-card-dark shadow-sm' : 'border-border-thin dark:border-border-dark bg-white dark:bg-card-dark hover:border-forest-green/50 dark:hover:border-accent-herb/50'}`}
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
                                    
                                    <div className="flex items-center">
                                        <div className="w-px h-8 bg-border-thin dark:bg-border-dark mr-2 opacity-30 group-hover:opacity-100 transition-opacity"></div>
                                        <div className="flex items-center pr-2 gap-1">
                                            {s.id === db.getCurrentFamilyId() && (
                                                <>
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setQuickShareFamily({ id: s.id, name: s.name });
                                                        }}
                                                        className="p-2 text-text-secondary hover:text-forest-green dark:hover:text-accent-herb transition-colors"
                                                        title="Share Links"
                                                    >
                                                        <Share2 size={18} />
                                                    </button>
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setMode('admin');
                                                            setAdminAction('view_password');
                                                        }}
                                                        className="p-2 text-text-secondary hover:text-forest-green dark:hover:text-accent-herb transition-colors"
                                                        title="View Password"
                                                    >
                                                        <Eye size={18} />
                                                    </button>
                                                </>
                                            )}
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setConfirmLeaveFamily({ id: s.id, name: s.name });
                                                }}
                                                className="p-2 text-text-secondary hover:text-red-500 transition-colors"
                                                title="Leave Family"
                                            >
                                                <LogOut size={18} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {quickShareFamily && (
                                <div className="p-4 bg-forest-green/5 dark:bg-accent-herb/5 border border-forest-green/20 dark:border-accent-herb/20 rounded-xl space-y-4 animate-in slide-in-from-top-2 duration-200">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-sm font-bold text-text-main dark:text-white">Share "{quickShareFamily.name}"</h4>
                                        <button onClick={() => setQuickShareFamily(null)} className="text-text-secondary hover:text-text-main dark:hover:text-white"><X size={16} /></button>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        <button 
                                            onClick={() => {
                                                handleGenerateLink('permanent');
                                                setMode('admin');
                                                setAdminAction('links');
                                                setQuickShareFamily(null);
                                            }}
                                            className="w-full p-3 rounded-lg border border-border-thin dark:border-border-dark hover:border-forest-green dark:hover:border-accent-herb hover:bg-white dark:hover:bg-white/5 transition-all text-left"
                                        >
                                            <div className="font-bold text-xs text-text-main dark:text-white">Permanent Link</div>
                                            <div className="text-[10px] text-text-secondary">Requires family password to join.</div>
                                        </button>
                                        <button 
                                            onClick={() => {
                                                handleGenerateLink('temporary');
                                                setMode('admin');
                                                setAdminAction('links');
                                                setQuickShareFamily(null);
                                            }}
                                            className="w-full p-3 rounded-lg border border-border-thin dark:border-border-dark hover:border-forest-green dark:hover:border-accent-herb hover:bg-white dark:hover:bg-white/5 transition-all text-left"
                                        >
                                            <div className="font-bold text-xs text-text-main dark:text-white">Temporary VIP Link</div>
                                            <div className="text-[10px] text-text-secondary">Skips password. Expires in 24h.</div>
                                        </button>
                                        <button 
                                            onClick={() => {
                                                handleGenerateLink('view');
                                                setMode('admin');
                                                setAdminAction('links');
                                                setQuickShareFamily(null);
                                            }}
                                            className="w-full p-3 rounded-lg border border-border-thin dark:border-border-dark hover:border-forest-green dark:hover:border-accent-herb hover:bg-white dark:hover:bg-white/5 transition-all text-left"
                                        >
                                            <div className="font-bold text-xs text-text-main dark:text-white">Read-Only Link</div>
                                            <div className="text-[10px] text-text-secondary">Public view of family recipes.</div>
                                        </button>
                                    </div>
                                </div>
                            )}
                            
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
                        <form onSubmit={handleAdminSubmit} className="space-y-4">
                            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-xl border border-yellow-100 dark:border-yellow-900/30">
                                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                                    Current Family: <strong>{db.getCurrentFamilyName()}</strong>
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-text-secondary uppercase mb-1">Action</label>
                                <select value={adminAction} onChange={e => setAdminAction(e.target.value as any)} className="w-full p-3 rounded-xl bg-bg-subtle dark:bg-white/5 border border-border-thin dark:border-border-dark focus:ring-2 focus:ring-forest-green dark:focus:ring-accent-herb outline-none text-text-main dark:text-white font-sans cursor-pointer transition-all">
                                    <option value="update" className="bg-white dark:bg-card-dark text-text-main dark:text-gray-300">Update Passwords</option>
                                    <option value="rename" className="bg-white dark:bg-card-dark text-text-main dark:text-gray-300">Rename Family</option>
                                    <option value="delete" className="bg-white dark:bg-card-dark text-text-main dark:text-gray-300">Delete Family Data</option>
                                    {db.getCurrentFamilyPassword() && <option value="view_password" className="bg-white dark:bg-card-dark text-text-main dark:text-gray-300">View Access Password</option>}
                                    <option value="links" className="bg-white dark:bg-card-dark text-text-main dark:text-gray-300">Generate Invites & Links</option>
                                </select>
                            </div>

                            {adminAction === 'links' && (
                                <div className="space-y-4">
                                    <p className="text-xs text-text-secondary">Generate special links to share your family access with others.</p>
                                    
                                    {/* Permanent Link */}
                                    <div className="p-3 border border-border-thin dark:border-border-dark rounded-xl bg-bg-subtle dark:bg-white/5 flex flex-col gap-2">
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <h4 className="text-sm font-bold text-text-main dark:text-white">Permanent Join Link</h4>
                                                <p className="text-xs text-text-secondary">Standard link that lets users join permanently after entering the password.</p>
                                            </div>
                                            <button type="button" onClick={() => handleGenerateLink('permanent')} className="text-xs font-bold px-3 py-1.5 bg-forest-green dark:bg-accent-herb text-white dark:text-black rounded-lg">Generate</button>
                                        </div>
                                        {generatedLinks.permanent && (
                                            <div className="flex gap-2">
                                                <input readOnly value={generatedLinks.permanent} className="text-xs flex-1 p-2 rounded bg-white dark:bg-card-dark border border-border-thin dark:border-border-dark" />
                                                <button type="button" onClick={() => copyToClipboard(generatedLinks.permanent!)} className="text-xs px-2 bg-gray-200 dark:bg-gray-700 rounded text-text-main dark:text-white">Copy</button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Temporary Link */}
                                    <div className="p-3 border border-border-thin dark:border-border-dark rounded-xl bg-bg-subtle dark:bg-white/5 flex flex-col gap-2">
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <h4 className="text-sm font-bold text-text-main dark:text-white">Temporary VIP Join Link</h4>
                                                <p className="text-xs text-text-secondary">Allows a permanent join without a password. The link itself expires in 24 hours.</p>
                                            </div>
                                            <button type="button" onClick={() => handleGenerateLink('temporary')} className="text-xs font-bold px-3 py-1.5 bg-forest-green dark:bg-accent-herb text-white dark:text-black rounded-lg">Generate</button>
                                        </div>
                                        {generatedLinks.temp && (
                                            <div className="flex gap-2">
                                                <input readOnly value={generatedLinks.temp} className="text-xs flex-1 p-2 rounded bg-white dark:bg-card-dark border border-border-thin dark:border-border-dark" />
                                                <button type="button" onClick={() => copyToClipboard(generatedLinks.temp!)} className="text-xs px-2 bg-gray-200 dark:bg-gray-700 rounded text-text-main dark:text-white">Copy</button>
                                            </div>
                                        )}
                                    </div>

                                    {/* View Link */}
                                    <div className="p-3 border border-border-thin dark:border-border-dark rounded-xl bg-bg-subtle dark:bg-white/5 flex flex-col gap-2">
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <h4 className="text-sm font-bold text-text-main dark:text-white">View-Only Link</h4>
                                                <p className="text-xs text-text-secondary">Public read-only view of all family recipes.</p>
                                            </div>
                                            <button type="button" onClick={() => handleGenerateLink('view')} className="text-xs font-bold px-3 py-1.5 bg-forest-green dark:bg-accent-herb text-white dark:text-black rounded-lg">Generate</button>
                                        </div>
                                        {generatedLinks.view && (
                                            <div className="flex gap-2">
                                                <input readOnly value={generatedLinks.view} className="text-xs flex-1 p-2 rounded bg-white dark:bg-card-dark border border-border-thin dark:border-border-dark" />
                                                <button type="button" onClick={() => copyToClipboard(generatedLinks.view!)} className="text-xs px-2 bg-gray-200 dark:bg-gray-700 rounded text-text-main dark:text-white">Copy</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {adminAction === 'update' && (
                                <div className="space-y-3 p-3 border border-border-thin dark:border-border-dark rounded-xl bg-white dark:bg-card-dark">
                                    <h4 className="text-sm font-bold text-text-main dark:text-white">New Credentials (Optional)</h4>
                                    <div className="relative">
                                        <input type={showNewFamilyPassword ? 'text' : 'password'} value={newFamilyPassword} onChange={e => setNewFamilyPassword(e.target.value)} className="w-full p-2 pr-10 text-sm rounded-lg bg-bg-subtle dark:bg-white/5 border border-border-thin dark:border-border-dark text-text-main dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-forest-green dark:focus:border-accent-herb" placeholder="New Access Password" />
                                        <button type="button" tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-main dark:hover:text-white transition-colors" onClick={() => setShowNewFamilyPassword(!showNewFamilyPassword)}>
                                            {showNewFamilyPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                    <div className="relative">
                                        <input type={showNewAdminPassword ? 'text' : 'password'} value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)} className="w-full p-2 pr-10 text-sm rounded-lg bg-bg-subtle dark:bg-white/5 border border-border-thin dark:border-border-dark text-text-main dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-forest-green dark:focus:border-accent-herb" placeholder="New Admin Password" />
                                        <button type="button" tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-main dark:hover:text-white transition-colors" onClick={() => setShowNewAdminPassword(!showNewAdminPassword)}>
                                            {showNewAdminPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {adminAction === 'rename' && (
                                <div>
                                    <label className="block text-xs font-bold text-text-secondary uppercase mb-1">New Family Name</label>
                                    <input required type="text" value={newFamilyName} onChange={e => setNewFamilyName(e.target.value)} className="w-full p-3 rounded-xl bg-bg-subtle dark:bg-white/5 border border-border-thin dark:border-border-dark focus:ring-2 focus:ring-forest-green dark:focus:ring-accent-herb outline-none text-text-main dark:text-white placeholder:text-gray-400 transition-all" placeholder="New Name" />
                                </div>
                            )}

                            {adminAction === 'view_password' && (
                                <div className="p-4 border border-border-thin dark:border-border-dark rounded-xl bg-white dark:bg-card-dark text-center">
                                    <h4 className="text-sm font-bold text-text-secondary uppercase mb-2">Current Access Password</h4>
                                    <div className="flex justify-center items-center gap-3">
                                        <div className="font-mono text-lg font-bold text-text-main dark:text-white bg-bg-subtle dark:bg-white/5 py-2 px-4 rounded-lg tracking-wider">
                                            {showPassword ? (db.getCurrentFamilyPassword() || 'Not stored securely locally') : '••••••••'}
                                        </div>
                                        <button type="button" className="p-2 border border-border-thin dark:border-border-dark rounded-lg text-text-secondary hover:text-text-main dark:hover:text-white hover:bg-bg-subtle dark:hover:bg-white/5 transition-colors" onClick={() => setShowPassword(!showPassword)}>
                                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                        </button>
                                    </div>
                                    {!db.getCurrentFamilyPassword() && (
                                        <p className="text-xs text-text-secondary mt-3">You must fully log out and log back in to store this password on this device for local viewing.</p>
                                    )}
                                </div>
                            )}

                            {adminAction !== 'view_password' && adminAction !== 'links' && (
                                <>
                                    <div>
                                        <label className="block text-xs font-bold text-text-secondary uppercase mb-1">Current Admin Password</label>
                                        <div className="relative">
                                            <input required type={showAdminPassword ? 'text' : 'password'} value={adminPassword} onChange={e => setAdminPassword(e.target.value)} className="w-full p-3 pr-10 rounded-xl bg-bg-subtle dark:bg-white/5 border border-border-thin dark:border-border-dark focus:ring-2 focus:ring-red-500 outline-none text-text-main dark:text-white placeholder:text-gray-400 transition-all" placeholder="Required to verify" />
                                            <button type="button" tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-main dark:hover:text-white transition-colors" onClick={() => setShowAdminPassword(!showAdminPassword)}>
                                                {showAdminPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                    </div>

                                    <button type="submit" disabled={loading} className={`w-full py-3 text-white dark:text-black rounded-xl font-bold shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2 ${adminAction === 'delete' ? 'bg-red-500 hover:bg-red-600 text-white dark:text-white shadow-red-500/20' : 'bg-forest-green dark:bg-accent-herb hover:bg-gray-800 dark:hover:bg-herb-hover shadow-forest-green/20 dark:shadow-accent-herb/20'}`}>
                                        {loading && <Loader size={18} className="animate-spin" />}
                                        {adminAction === 'delete' ? 'Permanently Delete' : 'Save Changes'}
                                    </button>
                                </>
                            )}
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AuthModal;
