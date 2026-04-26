
import React, { useState } from 'react';
import { Download, X, Settings, Star, FileText } from 'lucide-react';

export interface ExportOptions {
  includeReviews: boolean;
  includeSettings: boolean;
}

interface ExportModalProps {
  onClose: () => void;
  onExport: (options: ExportOptions) => void;
  totalRecipes: number;
}

const ExportModal: React.FC<ExportModalProps> = ({ onClose, onExport, totalRecipes }) => {
  const [options, setOptions] = useState<ExportOptions>({
    includeReviews: true,
    includeSettings: true,
  });

  const handleToggle = (key: keyof ExportOptions) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background-dark/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-sm bg-white dark:bg-card-dark rounded-2xl shadow-xl border border-border-thin dark:border-border-dark flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        <div className="p-5 border-b border-border-thin dark:border-border-dark flex justify-between items-center bg-bg-subtle dark:bg-bg-dark">
          <h3 className="font-bold text-lg text-text-main dark:text-white flex items-center gap-2">
            <Download size={20} className="text-forest-green dark:text-accent-herb" />
            Export Data
          </h3>
          <button onClick={onClose} className="text-text-secondary hover:text-text-main dark:hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-forest-green/5 dark:bg-accent-herb/10 border border-forest-green/10 dark:border-accent-herb/20 rounded-xl p-4 flex items-center gap-3">
             <div className="p-2 bg-white dark:bg-white/10 rounded-lg">
                 <FileText size={20} className="text-forest-green dark:text-accent-herb" />
             </div>
             <div>
                 <p className="text-sm font-bold text-text-main dark:text-white">{totalRecipes} Recipes</p>
                 <p className="text-xs text-text-secondary">Base recipe data is always included.</p>
             </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 rounded-xl border border-border-thin dark:border-border-dark hover:bg-bg-subtle dark:hover:bg-white/5 cursor-pointer transition-colors group">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg transition-colors ${options.includeReviews ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-bg-subtle text-gray-400 dark:bg-white/10'}`}>
                        <Star size={18} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-text-main dark:text-white">Include Reviews</span>
                        <span className="text-xs text-text-secondary">Personal ratings and dates</span>
                    </div>
                </div>
                <input 
                    type="checkbox" 
                    checked={options.includeReviews} 
                    onChange={() => handleToggle('includeReviews')}
                    className="h-5 w-5 rounded border-border-thin dark:border-border-dark text-forest-green dark:text-accent-herb focus:ring-forest-green dark:focus:ring-accent-herb"
                />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl border border-border-thin dark:border-border-dark hover:bg-bg-subtle dark:hover:bg-white/5 cursor-pointer transition-colors group">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg transition-colors ${options.includeSettings ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-bg-subtle text-gray-400 dark:bg-white/10'}`}>
                        <Settings size={18} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-text-main dark:text-white">Include Settings</span>
                        <span className="text-xs text-text-secondary">Theme preferences</span>
                    </div>
                </div>
                <input 
                    type="checkbox" 
                    checked={options.includeSettings} 
                    onChange={() => handleToggle('includeSettings')}
                    className="h-5 w-5 rounded border-border-thin dark:border-border-dark text-forest-green dark:text-accent-herb focus:ring-forest-green dark:focus:ring-accent-herb"
                />
            </label>
          </div>
        </div>

        <div className="p-5 border-t border-border-thin dark:border-border-dark bg-bg-subtle dark:bg-bg-dark flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-main dark:hover:text-white transition-colors">
                Cancel
            </button>
            <button 
                onClick={() => onExport(options)} 
                className="px-5 py-2 bg-forest-green dark:bg-accent-herb hover:bg-black dark:hover:bg-herb-hover text-white dark:text-black text-sm font-bold rounded-lg shadow-lg shadow-black/10 transition-all flex items-center gap-2"
            >
                <Download size={16} />
                Download JSON
            </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
