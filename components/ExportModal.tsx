
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-sm bg-surface-light dark:bg-surface-dark rounded-2xl shadow-xl border border-border-light dark:border-border-dark flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        <div className="p-5 border-b border-border-light dark:border-border-dark flex justify-between items-center bg-gray-50/50 dark:bg-white/5">
          <h3 className="font-bold text-lg text-text-main dark:text-white flex items-center gap-2">
            <Download size={20} className="text-primary" />
            Export Data
          </h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-main dark:hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center gap-3">
             <div className="p-2 bg-white dark:bg-black/20 rounded-lg">
                 <FileText size={20} className="text-primary" />
             </div>
             <div>
                 <p className="text-sm font-bold text-text-main dark:text-white">{totalRecipes} Recipes</p>
                 <p className="text-xs text-text-muted">Base recipe data is always included.</p>
             </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 rounded-xl border border-border-light dark:border-border-dark hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer transition-colors group">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg transition-colors ${options.includeReviews ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800'}`}>
                        <Star size={18} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-text-main dark:text-white">Include Reviews</span>
                        <span className="text-xs text-text-muted">Personal ratings and dates</span>
                    </div>
                </div>
                <input 
                    type="checkbox" 
                    checked={options.includeReviews} 
                    onChange={() => handleToggle('includeReviews')}
                    className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl border border-border-light dark:border-border-dark hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer transition-colors group">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg transition-colors ${options.includeSettings ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800'}`}>
                        <Settings size={18} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-text-main dark:text-white">Include Settings</span>
                        <span className="text-xs text-text-muted">Theme preferences</span>
                    </div>
                </div>
                <input 
                    type="checkbox" 
                    checked={options.includeSettings} 
                    onChange={() => handleToggle('includeSettings')}
                    className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                />
            </label>
          </div>
        </div>

        <div className="p-5 border-t border-border-light dark:border-border-dark bg-gray-50/50 dark:bg-white/5 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-main dark:hover:text-white transition-colors">
                Cancel
            </button>
            <button 
                onClick={() => onExport(options)} 
                className="px-5 py-2 bg-primary hover:bg-green-600 text-white text-sm font-bold rounded-lg shadow-lg shadow-primary/20 transition-all flex items-center gap-2"
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
