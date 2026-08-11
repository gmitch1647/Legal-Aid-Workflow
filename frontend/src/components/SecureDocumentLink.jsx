import React, { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { getDocumentAccessUrl } from '../lib/api';

/**
 * Opens a case document through a newly issued, authorization-scoped link.
 * Storage URLs expire by design, so the URL is intentionally requested only
 * after the user clicks the document.
 */
export default function SecureDocumentLink({
  caseId,
  document,
  className = '',
  children,
  onError,
}) {
  const [opening, setOpening] = useState(false);

  const handleOpen = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (opening || !caseId || !document?.id) return;

    setOpening(true);
    try {
      const result = await getDocumentAccessUrl(caseId, document.id);
      if (!result?.url) throw new Error('A secure document link could not be created.');
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      const message = err?.message || 'Could not open the document. Please try again.';
      if (onError) onError(message);
      else window.alert(message);
    } finally {
      setOpening(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleOpen}
      disabled={opening}
      className={`${className} disabled:cursor-wait disabled:opacity-70`}
      title={opening ? 'Preparing secure document link…' : 'Open document'}
    >
      {children}
      {opening ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary-600" /> : <ExternalLink className="h-4 w-4 shrink-0 text-slate-300" />}
    </button>
  );
}
