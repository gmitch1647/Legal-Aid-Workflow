import { useEffect, useId, useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Start typing an address',
  className = '',
  disabled = false,
  required = false,
}) {
  const listboxId = useId();
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const phrase = String(value || '').trim();
    if (phrase.length < 3) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return undefined;
    }

    const requestId = ++requestRef.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/address-suggestions?query=${encodeURIComponent(phrase)}`);
        if (!response.ok) throw new Error('Address lookup unavailable');
        const payload = await response.json();
        if (requestRef.current !== requestId) return;
        const rows = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
        setSuggestions(rows);
        setOpen(rows.length > 0);
      } catch {
        if (requestRef.current === requestId) {
          setSuggestions([]);
          setOpen(false);
        }
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [value]);

  function choose(suggestion) {
    onChange(suggestion.line1);
    onSelect?.(suggestion);
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => suggestions.length && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 160)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-autocomplete="list"
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        className={className}
      />
      {loading && <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" aria-label="Searching addresses" />}
      {open && (
        <div id={listboxId} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.display_name}-${index}`}
              type="button"
              role="option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(suggestion)}
              className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <span><span className="block font-medium text-slate-900">{suggestion.line1}</span><span className="block text-xs text-slate-500">{suggestion.city}{suggestion.city && suggestion.state ? ', ' : ''}{suggestion.state} {suggestion.zip_code}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
