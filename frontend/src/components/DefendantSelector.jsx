import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  X,
  Plus,
  Building2,
  User,
  MapPin,
  ChevronDown,
} from 'lucide-react';

const ENTITY_TYPES = [
  { value: 'corporation', label: 'Corporation' },
  { value: 'llc', label: 'LLC' },
  { value: 'individual', label: 'Individual' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'government', label: 'Government Entity' },
  { value: 'other', label: 'Other' },
];

function DefendantCard({ defendant, onRemove }) {
  const EntityIcon = defendant.entity_type === 'individual' ? User : Building2;

  return (
    <div className="flex items-start justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-600">
          <EntityIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">{defendant.name}</p>
          {defendant.address && (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{defendant.address}</span>
            </div>
          )}
          {defendant.entity_type && (
            <span className="mt-1 inline-block rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
              {defendant.entity_type}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRemove(defendant)}
        className="ml-2 shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
        aria-label={`Remove ${defendant.name}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ManualEntryForm({ onAdd, onCancel }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [entityType, setEntityType] = useState('corporation');
  const nameRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({
      id: `manual_${Date.now()}`,
      name: name.trim(),
      address: address.trim(),
      entity_type: entityType,
      _isManual: true,
    });
    setName('');
    setAddress('');
    setEntityType('corporation');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4"
    >
      <p className="mb-3 text-sm font-medium text-slate-700">Add New Defendant</p>

      <div className="space-y-3">
        <div>
          <label htmlFor="def-name" className="mb-1 block text-xs font-medium text-slate-600">
            Name *
          </label>
          <input
            ref={nameRef}
            id="def-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Defendant name"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div>
          <label htmlFor="def-address" className="mb-1 block text-xs font-medium text-slate-600">
            Address
          </label>
          <input
            id="def-address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, City, State ZIP"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div>
          <label htmlFor="def-type" className="mb-1 block text-xs font-medium text-slate-600">
            Entity Type
          </label>
          <div className="relative">
            <select
              id="def-type"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-8 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {ENTITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={!name.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Defendant
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function DefendantSelector({ selectedDefendants = [], onUpdate, defendants = [] }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const selectedIds = new Set(selectedDefendants.map((d) => d.id));

  const filteredDefendants = defendants.filter((d) => {
    if (selectedIds.has(d.id)) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.name?.toLowerCase().includes(q) ||
      d.address?.toLowerCase().includes(q) ||
      d.entity_type?.toLowerCase().includes(q)
    );
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (defendant) => {
      onUpdate([...selectedDefendants, defendant]);
      setSearchQuery('');
      setIsDropdownOpen(false);
    },
    [selectedDefendants, onUpdate]
  );

  const handleRemove = useCallback(
    (defendant) => {
      onUpdate(selectedDefendants.filter((d) => d.id !== defendant.id));
    },
    [selectedDefendants, onUpdate]
  );

  const handleManualAdd = useCallback(
    (defendant) => {
      onUpdate([...selectedDefendants, defendant]);
      setShowManualForm(false);
    },
    [selectedDefendants, onUpdate]
  );

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-700">Defendants</label>

      {/* Searchable dropdown */}
      <div ref={dropdownRef} className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => setIsDropdownOpen(true)}
            placeholder="Search defendants..."
            className="w-full rounded-md border border-slate-300 py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        {/* Dropdown results */}
        {isDropdownOpen && (
          <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {filteredDefendants.length === 0 ? (
              <div className="px-4 py-3 text-center text-sm text-slate-400">
                {searchQuery.trim()
                  ? 'No defendants match your search.'
                  : 'No more defendants available.'}
              </div>
            ) : (
              filteredDefendants.map((d) => {
                const EntityIcon = d.entity_type === 'individual' ? User : Building2;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => handleSelect(d)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-primary-50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <EntityIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{d.name}</p>
                      {d.address && (
                        <p className="truncate text-xs text-slate-400">{d.address}</p>
                      )}
                    </div>
                    {d.entity_type && (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                        {d.entity_type}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Selected defendants */}
      {selectedDefendants.length > 0 && (
        <div className="space-y-2">
          {selectedDefendants.map((d) => (
            <DefendantCard key={d.id} defendant={d} onRemove={handleRemove} />
          ))}
        </div>
      )}

      {/* Manual entry */}
      {showManualForm ? (
        <ManualEntryForm onAdd={handleManualAdd} onCancel={() => setShowManualForm(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setShowManualForm(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-600"
        >
          <Plus className="h-4 w-4" />
          Add defendant not in list
        </button>
      )}

      {/* Count indicator */}
      {selectedDefendants.length > 0 && (
        <p className="text-xs text-slate-400">
          {selectedDefendants.length} defendant{selectedDefendants.length !== 1 ? 's' : ''} selected
        </p>
      )}
    </div>
  );
}
