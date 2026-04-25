
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, HelpCircle, X } from 'lucide-react';

interface CustomModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  type: 'alert' | 'confirm';
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const CustomModal: React.FC<CustomModalProps> = ({ 
  isOpen, 
  title, 
  message, 
  type, 
  confirmText = 'OK', 
  cancelText = 'Cancel', 
  onConfirm, 
  onCancel 
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-background-dark/80 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white dark:bg-card-dark rounded-2xl shadow-xl w-full max-w-sm border border-border-thin dark:border-border-dark overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-full shrink-0 ${type === 'alert' ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'bg-forest-green/10 dark:bg-accent-herb/10 text-forest-green dark:text-accent-herb'}`}>
                  {type === 'alert' ? <AlertCircle size={24} /> : <HelpCircle size={24} />}
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <h3 className="text-lg font-bold text-text-main dark:text-white">{title}</h3>
                    <button onClick={onCancel} className="text-text-secondary hover:text-text-main dark:hover:text-white transition-colors">
                      <X size={20} />
                    </button>
                  </div>
                  <p className="text-sm text-text-secondary mt-2 leading-relaxed">
                    {message}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-bg-subtle dark:bg-white/5 border-t border-border-thin dark:border-border-dark flex justify-end gap-3">
              {type === 'confirm' && (
                <button 
                  onClick={onCancel} 
                  className="px-4 py-2 text-sm font-bold text-text-secondary hover:text-text-main dark:hover:text-white transition-colors"
                >
                  {cancelText}
                </button>
              )}
              <button 
                onClick={onConfirm} 
                className={`px-6 py-2 rounded-lg text-sm font-bold shadow-sm transition-all ${
                  type === 'confirm' 
                    ? 'bg-forest-green hover:bg-forest-green/90 text-white dark:bg-active-green dark:text-accent-herb' 
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default CustomModal;
