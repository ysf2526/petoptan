import React, { useState, useEffect, useRef } from 'react';
import { Search, X, ChevronDown, Check } from 'lucide-react';

export interface SearchableOption {
  id: string;
  label: string;
  sublabel?: string;
  badge?: string;
  badgeColor?: string;
  searchText?: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  labelIcon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Seçim yapmak için arayın...',
  searchPlaceholder = 'Aramak için yazın...',
  emptyMessage = 'Sonuç bulunamadı.',
  labelIcon,
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((opt) => opt.id === value);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter options based on search query
  const filteredOptions = options.filter((opt) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const lbl = opt.label.toLowerCase();
    const sub = (opt.sublabel || '').toLowerCase();
    const extra = (opt.searchText || '').toLowerCase();
    return lbl.includes(q) || sub.includes(q) || extra.includes(q);
  });

  const handleSelect = (optionId: string) => {
    onChange(optionId);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchQuery('');
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Input / Selected Badge Trigger */}
      {selectedOption && !isOpen ? (
        <div
          onClick={() => {
            if (!disabled) {
              setIsOpen(true);
              setTimeout(() => inputRef.current?.focus(), 50);
            }
          }}
          className={`w-full bg-slate-900 border border-brand-500/70 hover:border-brand-400 rounded-xl p-2.5 flex items-center justify-between gap-2 cursor-pointer transition-all ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          <div className="flex items-center gap-2 truncate text-xs sm:text-sm">
            {labelIcon && <span className="text-brand-400 shrink-0">{labelIcon}</span>}
            <span className="font-extrabold text-white truncate">{selectedOption.label}</span>
            {selectedOption.sublabel && (
              <span className="text-xs text-slate-400 truncate hidden sm:inline">
                ({selectedOption.sublabel})
              </span>
            )}
            {selectedOption.badge && (
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                  selectedOption.badgeColor || 'bg-brand-950 text-brand-300 border border-brand-800'
                }`}
              >
                {selectedOption.badge}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
              title="Seçimi Temizle / Değiştir"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <ChevronDown className="w-4 h-4 text-slate-500" />
          </div>
        </div>
      ) : (
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3 text-slate-500 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              disabled={disabled}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!isOpen) setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              placeholder={selectedOption ? selectedOption.label : placeholder}
              className="w-full bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-xl py-2.5 pl-9 pr-8 text-slate-100 text-xs sm:text-sm outline-none placeholder-slate-500 font-semibold"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 p-1 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <ChevronDown className="w-4 h-4 absolute right-3 text-slate-500 pointer-events-none" />
            )}
          </div>
        </div>
      )}

      {/* Floating Dropdown List */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
          {filteredOptions.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400 font-medium">
              {emptyMessage}
            </div>
          ) : (
            <div className="p-1 divide-y divide-slate-800/50">
              {filteredOptions.map((opt) => {
                const isSelected = opt.id === value;
                return (
                  <div
                    key={opt.id}
                    onClick={() => handleSelect(opt.id)}
                    className={`p-2.5 rounded-lg flex items-center justify-between gap-2 cursor-pointer transition-colors text-xs sm:text-sm ${
                      isSelected
                        ? 'bg-brand-600/20 text-brand-300 font-bold border border-brand-500/40'
                        : 'hover:bg-slate-800 text-slate-200'
                    }`}
                  >
                    <div className="truncate flex items-center gap-2">
                      <span className="font-bold text-white truncate block">{opt.label}</span>
                      {opt.sublabel && (
                        <span className="text-slate-400 text-xs truncate">
                          ({opt.sublabel})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {opt.badge && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            opt.badgeColor || 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && <Check className="w-4 h-4 text-brand-400" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
