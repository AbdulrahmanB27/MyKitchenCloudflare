import React, { useState, useEffect } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import * as db from '../services/db';

interface DeleteConfirmationModalProps {
  itemName: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedFamilyIds: string[]) => void;
}

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({ itemName, isOpen, onClose, onConfirm }) => {
  const [availableSessions, setAvailableSessions] = useState<{ id: string, name: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const currentFamilyId = db.getCurrentFamilyId();

  useEffect(() => {
    if (isOpen) {
        const sessions = db.getSavedSessions();
        setAvailableSessions(sessions);
        
        // Default selection: Current Context
        if (currentFamilyId) {
            setSelectedIds(new Set([currentFamilyId]));
        } else {
            setSelectedIds(new Set(['private']));
        }
    }
  }, [isOpen, currentFamilyId]);

  if (!isOpen) return null;

  const toggleId = (id: string) => {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedIds(next);
  };

  const toggleAll = () => {
      const allIds = availableSessions.map(s => s.id);
      if (!currentFamilyId) allIds.push('private');

      // Check if all available (valid) IDs are selected
      const allValidIds = availableSessions.length > 0 ? availableSessions.map(s => s.id) : ['private'];
      const isAllSelected = allValidIds.every(id => selectedIds.has(id));

      if (isAllSelected) {
          // Deselect all -> Select only current
          if (currentFamilyId) setSelectedIds(new Set([currentFamilyId]));
          else setSelectedIds(new Set(['private']));
      } else {
          // Select all
          setSelectedIds(new Set(allValidIds));
      }
  };

  const handleConfirm = () => {
      onConfirm(Array.from(selectedIds));
  };

  const isMultiFamily = availableSessions.length > 1;
  const allValidIds = availableSessions.length > 0 ? availableSessions.map(s => s.id) : ['private'];
  const isAllSelected = allValidIds.every(id => selectedIds.has(id));

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface-light dark:bg-surface-dark rounded-2xl shadow-xl w-full max-w-md border border-border-light dark:border-border-dark overflow-hidden flex flex-col">
        <div className="p-6">
            <div className="flex items-start gap-4 mb-4">
                <div className="p-3 bg-red-100 dark:bg-red-900/20 rounded-full text-red-600 dark:text-red-400 shrink-0">
                    <AlertTriangle size={24} />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-text-main dark:text-white">Delete Item?</h3>
                    <p className="text-sm text-text-muted mt-1">
                        Are you sure you want to delete <span className="font-bold text-text-main dark:text-white">"{itemName}"</span>? This action cannot be undone.
                    </p>
                </div>
            </div>

            {isMultiFamily && (
                <div className="mt-6 space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase text-text-muted">Delete from:</p>
                        <button 
                            onClick={toggleAll}
                            className="text-xs font-bold text-primary hover:underline"
                        >
                            {isAllSelected ? "Select Only Current" : "Select All Families"}
                        </button>
                    </div>
                    
                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                        {availableSessions.map(session => {
                            const isSelected = selectedIds.has(session.id);
                            const isCurrent = session.id === currentFamilyId;
                            return (
                                <button 
                                    key={session.id}
                                    onClick={() => toggleId(session.id)}
                                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                                        isSelected 
                                            ? 'border-red-500/30 bg-red-50 dark:bg-red-900/10' 
                                            : 'border-border-light dark:border-border-dark hover:bg-gray-50 dark:hover:bg-white/5'
                                    }`}
                                >
                                    <div className="flex flex-col items-start">
                                        <span className={`text-sm font-bold ${isSelected ? 'text-red-700 dark:text-red-300' : 'text-text-main dark:text-white'}`}>
                                            {session.name}
                                        </span>
                                        {isCurrent && <span className="text-[10px] text-text-muted uppercase font-bold">Current Family</span>}
                                    </div>
                                    
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                        isSelected 
                                            ? 'bg-red-500 border-red-500' 
                                            : 'border-gray-300 dark:border-gray-600'
                                    }`}>
                                        {isSelected && <Check size={14} className="text-white" />}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
        
        <div className="p-4 bg-gray-50 dark:bg-white/5 border-t border-border-light dark:border-border-dark flex justify-end gap-3">
            <button 
                onClick={onClose} 
                className="px-4 py-2 text-sm font-bold text-text-muted hover:text-text-main dark:hover:text-white transition-colors"
            >
                Cancel
            </button>
            <button 
                onClick={handleConfirm} 
                disabled={selectedIds.size === 0}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
                <span>Delete</span>
                {selectedIds.size > 1 && <span className="bg-black/20 px-1.5 py-0.5 rounded text-xs">{selectedIds.size}</span>}
            </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmationModal;
