
import React, { useState, useEffect, useRef } from 'react';
import { Lock, Loader, X } from 'lucide-react';
import * as db from '../services/db';

interface AuthModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

declare global {
    interface Window {
        turnstile: any;
    }
}

const AuthModal: React.FC<AuthModalProps> = ({ onClose, onSuccess }) => {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const turnstileRef = useRef<HTMLDivElement>(null);
    const [turnstileToken, setTurnstileToken] = useState('');

    useEffect(() => {
        // Initialize Turnstile
        if (window.turnstile && turnstileRef.current) {
            window.turnstile.render(turnstileRef.current, {
                sitekey: '0x4AAAAAAAARrB6c2q-jW-wW', // Use dummy test key for dev, replace with env var in prod
                callback: (token: string) => setTurnstileToken(token),
            });
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        // Allow bypass if token missing in dev, but strictly enforce in prod
        // For this demo, we assume the backend checks it.
        
        const success = await db.authenticate(password, turnstileToken);
        setLoading(false);

        if (success) {
            onSuccess();
            onClose();
        } else {
            setError('Incorrect password or verification failed.');
            // Reset turnstile
            if (window.turnstile) window.turnstile.reset();
            setTurnstileToken('');
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative w-full max-w-sm bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl border border-border-light dark:border-border-dark overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="bg-primary/10 p-6 flex flex-col items-center justify-center text-center border-b border-border-light dark:border-border-dark">
                    <div className="p-3 bg-white dark:bg-surface-dark rounded-full shadow-sm mb-3">
                        <Lock className="text-primary" size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-text-main dark:text-white">Family Access Required</h3>
                    <p className="text-xs text-text-muted mt-1 max-w-[240px]">
                        To make changes to shared family recipes, please enter the family password.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <input 
                            type="password" 
                            autoFocus
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Family Password"
                            className="w-full px-4 py-3 rounded-xl bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark focus:ring-2 focus:ring-primary focus:outline-none text-text-main dark:text-white text-center font-bold tracking-widest placeholder:font-normal placeholder:tracking-normal"
                        />
                    </div>

                    <div ref={turnstileRef} className="flex justify-center min-h-[65px]"></div>

                    {error && <p className="text-red-500 text-xs text-center font-bold">{error}</p>}

                    <div className="flex gap-3">
                        <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl font-bold text-text-muted hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            disabled={loading || !password}
                            className="flex-1 py-3 rounded-xl bg-primary text-white font-bold hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader className="animate-spin" size={18} /> : 'Unlock'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AuthModal;
