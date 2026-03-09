
import React from 'react';

interface CheckboxProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
    size?: 'sm' | 'md';
    className?: string;
}

const Checkbox: React.FC<CheckboxProps> = ({ checked, onChange, label, size = 'md', className = '' }) => {
    const boxSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
    const innerSize = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';
    const roundedClass = size === 'sm' ? 'rounded' : 'rounded-[6px]';
    const innerRoundedClass = size === 'sm' ? 'rounded-[2px]' : 'rounded-sm';

    return (
        <div 
            onClick={(e) => { e.stopPropagation(); onChange(!checked); }} 
            className={`flex items-center gap-3 cursor-pointer select-none group ${className}`}
        >
            <div className={`
                ${boxSize} ${roundedClass} border-[2px] flex items-center justify-center transition-colors shrink-0
                bg-bg-white dark:bg-card-dark
                ${checked 
                    ? 'border-forest-green dark:border-accent-herb' 
                    : 'border-gray-400 dark:border-border-sage group-hover:border-forest-green dark:group-hover:border-accent-herb'
                }
            `}>
                <div className={`
                    ${innerSize} bg-forest-green dark:bg-accent-herb ${innerRoundedClass} transition-all duration-200
                    ${checked ? 'opacity-100 scale-100' : 'opacity-0 scale-0 group-hover:opacity-40 group-hover:scale-75'}
                `}></div>
            </div>
            {label && <span className="font-medium text-sm text-text-secondary dark:text-text-secondary-dark group-hover:text-forest-green dark:group-hover:text-white transition-colors">{label}</span>}
        </div>
    );
};

export default Checkbox;
