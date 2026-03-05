import React, { useState, useRef, useEffect } from 'react';
import { ArrowUpDown, Check } from 'lucide-react';

interface SortOption {
  label: string;
  value: string;
}

interface SortMenuProps {
  options: SortOption[];
  currentSort: string;
  onSortChange: (value: any) => void;
}

const SortMenu: React.FC<SortMenuProps> = ({ options, currentSort, onSortChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (value: string) => {
    onSortChange(value);
    setIsOpen(false);
  };

  const currentLabel = options.find(o => o.value === currentSort)?.label || 'Sort';

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-center size-10 transition-colors ${
            isOpen 
                ? 'text-forest-green dark:text-accent-herb' 
                : 'text-text-secondary hover:text-text-main dark:hover:text-white'
        }`}
        title={`Sort by: ${currentLabel}`}
      >
        <ArrowUpDown size={20} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-card-dark rounded-xl shadow-xl border border-border-thin dark:border-border-dark z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="py-1">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={`w-full text-left px-4 py-2.5 text-sm font-medium flex items-center justify-between transition-colors ${
                  currentSort === option.value
                    ? 'bg-forest-green/5 dark:bg-accent-herb/10 text-forest-green dark:text-accent-herb'
                    : 'text-text-main dark:text-gray-300 hover:bg-bg-subtle dark:hover:bg-white/5'
                }`}
              >
                {option.label}
                {currentSort === option.value && <Check size={14} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SortMenu;
