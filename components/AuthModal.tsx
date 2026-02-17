
import React, { useState, useEffect } from 'react';
import { Lock, Loader, UserPlus, Users, X, ShieldAlert, LogOut, CheckCircle, Plus } from 'lucide-react';
import * as db from '../services/db';

interface AuthModalProps {
    onClose: () => void;
    onSuccess: () => void;
    initialView?: 'login' | 'register' | 'switch';
}

const AuthModal: React.FC<AuthModalProps> = ({ onClose, onSuccess, initialView = 'login' }) => {
    const [mode, setMode] = useState<'login' | 'register' | 'admin' | 'switch'>(initialView);
    const [familyName, setFamilyName] = useState('');
    const [password, setPassword] = useState('');
    const [adminPassword, setAdminPassword] = useState('');
    
    // Admin Actions State
    const [adminAction, setAdminAction] = useState<'update'|'delete'|'rename'>('update');
    const [newFamilyPassword, setNewFamilyPassword] = useState('');
    const [newAdminPassword, setNewAdminPassword] = useState('');
    const [newFamilyName, setNewFamilyName] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    
    // Turnstile
    const [turnstileToken, setTurnstileToken] = useState('');

    useEffect(() => {
        // Initialize Turnstile if available
        if ((window as any).turnstile) {
            try {
                (window as any).turnstile.render('#turnstile-container', {
                    sitekey: '0x4AAAAAAAzyj7W1jX7W1jX7', // Demo key, replace with env/config if real
                    callback: (token: string) => setTurnstileToken(token),
                });
            } catch(e) {}
        }
    }, [mode]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        const res = await db.authenticate(familyName, password); // db.authenticate handles token storage safely
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
        setLoading(true);
        setError('');
        const res = await db.registerFamily(familyName, password, adminPassword);
        setLoading(false);
        if (res.success) {
            onSuccess();
            onClose();
        } else {
            setError(res.error || 'Registration failed');
        }
    };

    const handleAdminSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
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
                alert('Family deleted.');
                db.logout(); // Use safe logout
                onClose();
            } else if (adminAction === 'rename') {
                alert('Family renamed.');
                // Update local storage name safely
                db.safeSetItem('current_family_name', newFamilyName);
                onSuccess(); // Trigger refresh
                onClose();
            } else {
                alert('Updated successfully.');
                onClose();
            }
        } else {
            setError(res.error || 'Action failed');
        }
    };

    const sessions = db.getSavedSessions(); // This uses safeGetItem now

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="relative w-full max-w-md bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl border border-border-light dark:border-border-dark overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="p-6 bg-background-light dark:bg-background-dark border-b border-border-light dark:border-border-dark flex justify-between items-center">
                    <h2 className="text-xl font-bold text-text-main dark:text-white flex items-center gap-2">
                        {mode === 'login' && <Lock size={20} className="text-primary"/>}
                        {mode === 'register' && <UserPlus size={20} className="text-primary"/>}
                        {mode === 'admin' && <ShieldAlert size={20} className="text-red-500"/>}
                        {mode === 'switch' && <Users size={20} className="text-blue-500"/>}
                        
                        {mode === 'login' && 'Login'}
                        {mode === 'register' && 'New Family'}
                        {mode === 'admin' && 'Admin Settings'}
                        {mode === 'switch' && 'Switch Account'}
                    </h2>
                    <button onClick={onClose}><X size={20} className="text-text-muted"/></button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto custom-scrollbar">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg flex items-center gap-2">
                            <ShieldAlert size={16} /> {error}
                        </div>
                    )}

                    {mode === 'switch' && (
                        <div className="space-y-3">
                            <p className="text-sm text-text-muted mb-2">Select a saved family session:</p>
                            {sessions.map(s => (
                                <button 
                                    key={s.id} 
                                    onClick={() => db.switchFamily(s.id)}
                                    className={`w-full p-4 rounded-xl border flex items-center justify-between group transition-all ${s.id === db.getCurrentFamilyId() ? 'border-primary bg-primary/5' : 'border-border-light dark:border-border-dark hover:border-primary/50'}`}
                                >
                                    <span className="font-bold text-text-main dark:text-white">{s.name}</span>
                                    {s.id === db.getCurrentFamilyId() && <CheckCircle size={16} className="text-primary"/>}
                                </button>
                            ))}
                            
                            <div className="pt-4 border-t border-border-light dark:border-border-dark flex flex-col gap-2">
                                <button onClick={() => setMode('login')} className="w-full py-3 rounded-xl border border-dashed border-border-light dark:border-border-dark text-text-muted hover:text-primary hover:border-primary/50 transition-colors flex items-center justify-center gap-2 font-medium">
                                    <Plus size={18} /> Add Existing Account
                                </button>
                                <button onClick={() => setMode('register')} className="w-full py-3 rounded-xl border border-dashed border-border-light dark:border-border-dark text-text-muted hover:text-primary hover:border-primary/50 transition-colors flex items-center justify-center gap-2 font-medium">
                                    <UserPlus size={18} /> Create New Family
                                </button>
                                <button onClick={() => db.logout()} className="w-full py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex items-center justify-center gap-2 font-bold mt-2">
                                    <LogOut size={18} /> Log Out All
                                </button>
                            </div>
                        </div>
                    )}

                    {(mode === 'login' || mode === 'register') && (
                        <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-text-muted uppercase mb-1">Family Name</label>
                                <input required type="text" value={familyName} onChange={e => setFamilyName(e.target.value)} className="w-full p-3 rounded-lg bg-background-light dark:bg-black/20 border border-border-light dark:border-border-dark focus:ring-2 focus:ring-primary outline-none dark:text-white" placeholder="The Smiths" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-text-muted uppercase mb-1">Access Password</label>
                                <input required type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 rounded-lg bg-background-light dark:bg-black/20 border border-border-light dark:border-border-dark focus:ring-2 focus:ring-primary outline-none dark:text-white" placeholder="Shared family password" />
                            </div>
                            
                            {mode === 'register' && (
                                <div>
                                    <label className="block text-xs font-bold text-text-muted uppercase mb-1">Admin Password</label>
                                    <input required type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} className="w-full p-3 rounded-lg bg-background-light dark:bg-black/20 border border-border-light dark:border-border-dark focus:ring-2 focus:ring-primary outline-none dark:text-white" placeholder="For managing settings" />
                                    <p className="text-[10px] text-text-muted mt-1">Keep this safe! Needed for renaming or deleting the family.</p>
                                </div>
                            )}

                            {/* Turnstile Container */}
                            <div id="turnstile-container" className="my-2 min-h-[65px]"></div>

                            <button type="submit" disabled={loading} className="w-full py-3 bg-primary hover:bg-green-600 text-white rounded-xl font-bold shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2">
                                {loading && <Loader size={18} className="animate-spin" />}
                                {mode === 'login' ? 'Enter Kitchen' : 'Create Family'}
                            </button>

                            <div className="text-center pt-2">
                                {mode === 'login' ? (
                                    <button type="button" onClick={() => setMode('register')} className="text-sm text-text-muted hover:underline">Need a new family account?</button>
                                ) : (
                                    <button type="button" onClick={() => setMode('login')} className="text-sm text-text-muted hover:underline">Already have an account?</button>
                                )}
                            </div>
                        </form>
                    )}

                    {mode === 'admin' && (
                        <form onSubmit={handleAdminSubmit} className="space-y-4">
                            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg border border-yellow-100 dark:border-yellow-900/30">
                                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                                    Current Family: <strong>{db.getCurrentFamilyName()}</strong>
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-text-muted uppercase mb-1">Action</label>
                                <select value={adminAction} onChange={e => setAdminAction(e.target.value as any)} className="w-full p-3 rounded-lg bg-background-light dark:bg-black/20 border border-border-light dark:border-border-dark focus:ring-2 focus:ring-primary outline-none dark:text-white cursor-pointer">
                                    <option value="update">Update Passwords</option>
                                    <option value="rename">Rename Family</option>
                                    <option value="delete">Delete Family Data</option>
                                </select>
                            </div>

                            {adminAction === 'update' && (
                                <div className="space-y-3 p-3 border border-border-light dark:border-border-dark rounded-xl">
                                    <h4 className="text-sm font-bold dark:text-white">New Credentials (Optional)</h4>
                                    <input type="password" value={newFamilyPassword} onChange={e => setNewFamilyPassword(e.target.value)} className="w-full p-2 text-sm rounded bg-background-light dark:bg-black/20 border border-border-light dark:border-border-dark dark:text-white" placeholder="New Access Password" />
                                    <input type="password" value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)} className="w-full p-2 text-sm rounded bg-background-light dark:bg-black/20 border border-border-light dark:border-border-dark dark:text-white" placeholder="New Admin Password" />
                                </div>
                            )}

                            {adminAction === 'rename' && (
                                <div>
                                    <label className="block text-xs font-bold text-text-muted uppercase mb-1">New Family Name</label>
                                    <input required type="text" value={newFamilyName} onChange={e => setNewFamilyName(e.target.value)} className="w-full p-3 rounded-lg bg-background-light dark:bg-black/20 border border-border-light dark:border-border-dark focus:ring-2 focus:ring-primary outline-none dark:text-white" placeholder="New Name" />
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-text-muted uppercase mb-1">Current Admin Password</label>
                                <input required type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} className="w-full p-3 rounded-lg bg-background-light dark:bg-black/20 border border-border-light dark:border-border-dark focus:ring-2 focus:ring-red-500 outline-none dark:text-white" placeholder="Required to verify" />
                            </div>

                            <button type="submit" disabled={loading} className={`w-full py-3 text-white rounded-xl font-bold shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2 ${adminAction === 'delete' ? 'bg-red-500 hover:bg-red-600' : 'bg-primary hover:bg-green-600'}`}>
                                {loading && <Loader size={18} className="animate-spin" />}
                                {adminAction === 'delete' ? 'Permanently Delete' : 'Save Changes'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AuthModal;
