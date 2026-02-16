
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
    const [adminAction, setAdminAction] = useState<'update'|'delete'>('update');
    const [newFamilyPassword, setNewFamilyPassword] = useState('');
    const [newAdminPassword, setNewAdminPassword] = useState('');

    const [savedSessions, setSavedSessions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        setSavedSessions(db.getSavedSessions());
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        let result;
        if (mode === 'register') {
            result = await db.registerFamily(familyName, password, adminPassword);
        } else if (mode === 'login') {
            result = await db.authenticate(familyName, password);
        } else if (mode === 'admin') {
            if (adminAction === 'delete') {
                if (!confirm("Are you absolutely sure? This will delete all recipes, plans, and data for this family forever.")) {
                    setLoading(false);
                    return;
                }
                result = await db.adminAction('delete_family', { adminPassword });
                if (result.success) {
                    db.logout(); // Force logout
                    return; 
                }
            } else {
                result = await db.adminAction('update_passwords', { adminPassword, newFamilyPassword, newAdminPassword });
            }
        }

        setLoading(false);

        if (result && result.success) {
            if (mode === 'admin') {
                alert(adminAction === 'delete' ? 'Family deleted.' : 'Passwords updated.');
                onClose();
            } else {
                onSuccess();
                db.retrySync();
                onClose();
            }
        } else {
            setError(result?.error || 'Operation failed.');
        }
    };

    const handleSwitch = (id: string) => {
        db.switchFamily(id);
    };

    const handleLogoutSession = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if(confirm("Forget this family on this device?")) {
            db.logout(id);
            setSavedSessions(db.getSavedSessions());
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative w-full max-w-sm bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl border border-border-light dark:border-border-dark overflow-hidden animate-in zoom-in-95 duration-200">
                
                {/* Header with Close */}
                <div className="bg-primary/10 p-6 flex flex-col items-center justify-center text-center border-b border-border-light dark:border-border-dark relative">
                    <button onClick={onClose} className="absolute top-4 right-4 text-text-muted hover:text-text-main dark:hover:text-white"><X size={20}/></button>
                    
                    <div className="p-3 bg-white dark:bg-surface-dark rounded-full shadow-sm mb-3">
                        {mode === 'login' ? <Lock className="text-primary" size={24} /> : 
                         mode === 'register' ? <UserPlus className="text-primary" size={24} /> : 
                         mode === 'switch' ? <Users className="text-primary" size={24} /> :
                         <ShieldAlert className="text-red-500" size={24} />}
                    </div>
                    
                    <h3 className="text-lg font-bold text-text-main dark:text-white">
                        {mode === 'login' ? 'Family Login' : mode === 'register' ? 'Create Family' : mode === 'switch' ? 'Switch Family' : 'Admin Controls'}
                    </h3>
                    
                    {mode !== 'admin' && mode !== 'switch' && (
                        <div className="flex gap-4 mt-4 text-sm font-bold">
                            <button onClick={() => setMode('login')} className={`pb-1 border-b-2 transition-colors ${mode === 'login' ? 'border-primary text-primary' : 'border-transparent text-text-muted opacity-50'}`}>Login</button>
                            <button onClick={() => setMode('register')} className={`pb-1 border-b-2 transition-colors ${mode === 'register' ? 'border-primary text-primary' : 'border-transparent text-text-muted opacity-50'}`}>New Family</button>
                        </div>
                    )}
                </div>

                {mode === 'switch' ? (
                    <div className="p-6 space-y-4">
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {savedSessions.length === 0 && <p className="text-sm text-text-muted text-center py-4">No families saved yet.</p>}
                            {savedSessions.map(session => (
                                <button key={session.id} onClick={() => handleSwitch(session.id)} className="w-full flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors border border-border-light dark:border-border-dark group">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-white dark:bg-white/10 p-2 rounded-full">
                                            <Users size={16} className="text-primary" />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold text-sm text-text-main dark:text-white">{session.name}</p>
                                            {session.name === db.getCurrentFamilyName() && <p className="text-[10px] text-primary font-bold">Active</p>}
                                        </div>
                                    </div>
                                    {session.name === db.getCurrentFamilyName() ? (
                                        <CheckCircle size={20} className="text-primary" />
                                    ) : (
                                        <div onClick={(e) => handleLogoutSession(e, session.id)} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-text-muted hover:text-red-500 rounded-full transition-colors" title="Forget">
                                            <LogOut size={16} />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setMode('login')} className="w-full py-3 rounded-xl border-2 border-dashed border-border-light dark:border-border-dark text-text-muted hover:text-primary hover:border-primary/50 transition-colors font-bold flex items-center justify-center gap-2">
                            <Plus size={18} /> Add Family
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        {mode === 'admin' ? (
                            <>
                                <div className="flex gap-2 bg-gray-100 dark:bg-white/5 p-1 rounded-lg mb-4">
                                    <button type="button" onClick={() => setAdminAction('update')} className={`flex-1 py-1 text-xs font-bold rounded ${adminAction === 'update' ? 'bg-white dark:bg-gray-700 shadow text-primary' : 'text-text-muted'}`}>Update Passwords</button>
                                    <button type="button" onClick={() => setAdminAction('delete')} className={`flex-1 py-1 text-xs font-bold rounded ${adminAction === 'delete' ? 'bg-red-500 text-white shadow' : 'text-text-muted'}`}>Delete Family</button>
                                </div>

                                <input 
                                    type="password" 
                                    required
                                    value={adminPassword}
                                    onChange={(e) => setAdminPassword(e.target.value)}
                                    placeholder="Current Admin Password"
                                    className="input-field"
                                />

                                {adminAction === 'update' && (
                                    <>
                                        <input type="password" value={newFamilyPassword} onChange={(e) => setNewFamilyPassword(e.target.value)} placeholder="New Family Password (Optional)" className="input-field" />
                                        <input type="password" value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} placeholder="New Admin Password (Optional)" className="input-field" />
                                    </>
                                )}
                                
                                {adminAction === 'delete' && (
                                    <p className="text-xs text-red-500 font-bold bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-900">
                                        Warning: This action cannot be undone.
                                    </p>
                                )}
                            </>
                        ) : (
                            <>
                                <div>
                                    <label className="block text-xs font-bold text-text-muted mb-1">Family Name</label>
                                    <input 
                                        type="text" 
                                        required
                                        autoFocus
                                        value={familyName}
                                        onChange={(e) => setFamilyName(e.target.value)}
                                        placeholder="e.g. The Smiths"
                                        className="input-field"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-text-muted mb-1">Family Password</label>
                                    <input 
                                        type="password" 
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Shared Access Password"
                                        className="input-field"
                                    />
                                </div>
                                {mode === 'register' && (
                                    <div>
                                        <label className="block text-xs font-bold text-text-muted mb-1">Admin Password</label>
                                        <input 
                                            type="password" 
                                            required
                                            value={adminPassword}
                                            onChange={(e) => setAdminPassword(e.target.value)}
                                            placeholder="For Admin Tasks Only"
                                            className="input-field"
                                        />
                                        <p className="text-[10px] text-text-muted mt-1">Used to delete family or change passwords later.</p>
                                    </div>
                                )}
                            </>
                        )}

                        {error && <p className="text-red-500 text-xs text-center font-bold px-4 bg-red-50 dark:bg-red-900/10 py-2 rounded">{error}</p>}

                        <button 
                            type="submit" 
                            disabled={loading}
                            className={`w-full py-3 rounded-xl font-bold text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${mode === 'admin' && adminAction === 'delete' ? 'bg-red-500 hover:bg-red-600' : 'bg-primary hover:bg-green-600'}`}
                        >
                            {loading ? <Loader className="animate-spin" size={18} /> : (mode === 'login' ? 'Login' : mode === 'register' ? 'Create Family' : adminAction === 'delete' ? 'Delete Forever' : 'Update')}
                        </button>
                        
                        {mode === 'login' && (
                            <div className="text-center pt-2">
                                <button type="button" onClick={() => setMode('admin')} className="text-xs text-text-muted hover:text-primary underline">Family Admin?</button>
                            </div>
                        )}
                        {(mode === 'admin' || mode === 'login' || mode === 'register') && savedSessions.length > 0 && (
                            <div className="text-center pt-2">
                                <button type="button" onClick={() => setMode('switch')} className="text-xs text-text-muted hover:text-primary underline">Back to Switcher</button>
                            </div>
                        )}
                    </form>
                )}
            </div>
            <style>{`
                .input-field {
                    width: 100%; padding: 0.75rem 1rem; border-radius: 0.75rem;
                    background-color: #f8fcf9; border: 1px solid #e7f3eb;
                    color: #0e1b12; outline: none; transition: all;
                }
                .input-field:focus { box-shadow: 0 0 0 2px #17cf54; }
                .dark .input-field {
                    background-color: #1a2c20; border-color: #2a4030; color: white;
                }
            `}</style>
        </div>
    );
};

export default AuthModal;
