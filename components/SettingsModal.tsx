import React from 'react';
import { X, Moon, Sun, Monitor, FlaskConical, Palette } from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsModalProps {
    onClose: () => void;
    settings: AppSettings;
    onUpdateSettings: (settings: AppSettings) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, settings, onUpdateSettings }) => {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-bg-dark rounded-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col shadow-2xl relative">
                
                {/* Header */}
                <div className="p-4 border-b border-border-thin dark:border-border-dark flex justify-between items-center bg-bg-subtle dark:bg-card-dark">
                    <h2 className="text-lg font-bold text-text-main dark:text-white flex items-center gap-2">
                        <Palette size={20} className="text-forest-green dark:text-accent-herb" />
                        Settings
                    </h2>
                    <button onClick={onClose} className="p-2 text-text-secondary hover:text-text-main dark:hover:text-white transition-colors rounded-full hover:bg-black/5 dark:hover:bg-white/10">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">
                    {/* Theme Section */}
                    <div>
                        <h3 className="text-sm font-bold text-text-main dark:text-white uppercase mb-3 flex items-center gap-2">
                            <Palette size={16} /> Theme Appearance
                        </h3>
                        <div className="grid grid-cols-3 gap-3">
                            <button 
                                onClick={() => onUpdateSettings({ ...settings, theme: 'light' })}
                                className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${settings.theme === 'light' ? 'border-forest-green bg-forest-green/5 dark:border-accent-herb dark:bg-accent-herb/10 text-forest-green dark:text-accent-herb' : 'border-border-thin dark:border-border-dark text-text-secondary hover:bg-black/5 dark:hover:bg-white/5'}`}
                            >
                                <Sun size={24} className="mb-2" />
                                <span className="text-xs font-bold">Light</span>
                            </button>
                            <button 
                                onClick={() => onUpdateSettings({ ...settings, theme: 'dark' })}
                                className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${settings.theme === 'dark' ? 'border-forest-green bg-forest-green/5 dark:border-accent-herb dark:bg-accent-herb/10 text-forest-green dark:text-accent-herb' : 'border-border-thin dark:border-border-dark text-text-secondary hover:bg-black/5 dark:hover:bg-white/5'}`}
                            >
                                <Moon size={24} className="mb-2" />
                                <span className="text-xs font-bold">Dark</span>
                            </button>
                            {/* In the future, could add system preference sync */}
                            <button className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-border-thin dark:border-border-dark text-text-secondary/50 cursor-not-allowed" title="Coming Soon">
                                <Monitor size={24} className="mb-2" />
                                <span className="text-xs font-bold">System</span>
                            </button>
                        </div>
                    </div>

                    {/* UI Preferences */}
                    <div>
                        <h3 className="text-sm font-bold text-text-main dark:text-white uppercase mb-3 flex items-center gap-2">
                            <Monitor size={16} /> UI Preferences
                        </h3>
                        <div className="bg-bg-subtle dark:bg-card-dark rounded-xl p-4 border border-border-thin dark:border-border-dark flex items-center justify-between">
                            <div>
                                <h4 className="text-sm font-bold text-text-main dark:text-white mb-1">Compact Mobile View</h4>
                                <p className="text-xs text-text-secondary pr-4">Display two recipes per row on mobile devices for a more compact layout.</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                <input type="checkbox" className="sr-only peer" checked={!!settings.compactMobileView} onChange={(e) => onUpdateSettings({ ...settings, compactMobileView: e.target.checked })} />
                                <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-forest-green dark:peer-checked:bg-accent-herb"></div>
                            </label>
                        </div>
                    </div>

                    {/* Experimental Features Placeholder */}
                    <div>
                        <h3 className="text-sm font-bold text-text-main dark:text-white uppercase mb-3 flex items-center gap-2">
                            <FlaskConical size={16} /> Beta & Future Features
                        </h3>
                        <div className="grid grid-cols-1 gap-3 mb-3">
                            <div className="bg-bg-subtle dark:bg-card-dark rounded-xl p-4 border border-border-thin dark:border-border-dark flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-bold text-text-main dark:text-white mb-1">Recipe Swipe Mode</h4>
                                    <p className="text-xs text-text-secondary pr-4">Play a "Tinder-esque" game to quickly decide what to cook from your recipes.</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                    <input type="checkbox" className="sr-only peer" checked={!!settings.enableRecipeSwipe} onChange={(e) => onUpdateSettings({ ...settings, enableRecipeSwipe: e.target.checked })} />
                                    <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-forest-green dark:peer-checked:bg-accent-herb"></div>
                                </label>
                            </div>
                            <div className="bg-bg-subtle dark:bg-card-dark rounded-xl p-4 border border-border-thin dark:border-border-dark flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-bold text-text-main dark:text-white mb-1">Eat Out (Restaurants)</h4>
                                    <p className="text-xs text-text-secondary pr-4">Track your favorite restaurants, orders, and decide where to eat with friends.</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                    <input type="checkbox" className="sr-only peer" checked={!!settings.enableRestaurants} onChange={(e) => onUpdateSettings({ ...settings, enableRestaurants: e.target.checked })} />
                                    <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-forest-green dark:peer-checked:bg-accent-herb"></div>
                                </label>
                            </div>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-4 border border-blue-200 dark:border-blue-900/30 text-center">
                            <FlaskConical size={24} className="mx-auto mb-2 text-blue-500 dark:text-blue-400" />
                            <p className="text-sm text-blue-800 dark:text-blue-300">More experimental features will be available here soon.</p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border-thin dark:border-border-dark bg-bg-subtle dark:bg-card-dark flex justify-end">
                    <button onClick={onClose} className="px-6 py-2 bg-text-main dark:bg-white text-white dark:text-black font-bold rounded-lg hover:bg-black dark:hover:bg-gray-200 transition-colors">
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
