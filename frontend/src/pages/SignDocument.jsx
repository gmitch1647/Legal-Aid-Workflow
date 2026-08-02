import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import SignaturePad from 'signature_pad';
import { CheckCircle2, Loader2, AlertCircle, FileText, Eraser, Type } from 'lucide-react';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export default function SignDocument() {
  const { token } = useParams();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signed, setSigned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [sigMode, setSigMode] = useState('draw');
  const isReviewOnly = Boolean(session?.review_only);

  const canvasRef = useRef(null);
  const sigPadRef = useRef(null);
  const pdfCanvasRef = useRef(null);

  useEffect(() => {
    loadSession();
  }, [token]);

  async function loadSession() {
    setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/signing/${token}`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || 'Session not found');
      }
      const data = await resp.json();
      setSession(data);
      setTypedName(data.signer_name || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const initSignaturePad = useCallback((node) => {
    if (node && !sigPadRef.current) {
      canvasRef.current = node;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      node.width = node.offsetWidth * ratio;
      node.height = node.offsetHeight * ratio;
      node.getContext('2d').scale(ratio, ratio);
      sigPadRef.current = new SignaturePad(node, {
        backgroundColor: 'rgb(255, 255, 255)',
        penColor: 'rgb(0, 0, 0)',
      });
    }
  }, []);

  function clearSignature() {
    sigPadRef.current?.clear();
  }

  // Render PDF preview
  useEffect(() => {
    if (!session || !pdfCanvasRef.current) return;
    let cancelled = false;

    const pdfUrl = `${API_URL}/signing/${token}/pdf`;

    async function renderPdf() {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.mjs',
          import.meta.url
        ).toString();

        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
        const container = pdfCanvasRef.current;
        if (cancelled || !container) return;
        container.innerHTML = '';

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.2 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = '100%';
          canvas.style.maxWidth = `${viewport.width}px`;
          canvas.style.marginBottom = '8px';
          canvas.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12)';
          canvas.style.borderRadius = '4px';
          container.appendChild(canvas);

          const ctx = canvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
      } catch (err) {
        console.error('PDF render failed:', err);
      }
    }

    renderPdf();
    return () => { cancelled = true; };
  }, [session, token]);

  async function handleSubmit() {
    let signatureData;

    if (sigMode === 'draw') {
      if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
        setError('Please draw your signature above.');
        return;
      }
      signatureData = sigPadRef.current.toDataURL('image/png');
    } else {
      if (!typedName.trim()) {
        setError('Please type your name.');
        return;
      }
      // Generate a signature image from typed name
      const canvas = document.createElement('canvas');
      canvas.width = 500;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 500, 100);
      ctx.fillStyle = 'black';
      ctx.font = 'italic 36px "Times New Roman", serif';
      ctx.fillText(typedName.trim(), 20, 60);
      signatureData = canvas.toDataURL('image/png');
    }

    setSubmitting(true);
    setError('');
    try {
      const resp = await fetch(`${API_URL}/signing/${token}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature: signatureData,
          typed_name: typedName.trim(),
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || 'Signing failed');
      }
      setSigned(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (signed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Document Signed</h1>
          <p className="text-slate-500 mb-6">
            Your signature has been recorded. A copy of the signed document has been sent to your attorney.
          </p>
          <p className="text-xs text-slate-400">You may close this window.</p>
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">Unable to Load Document</h1>
          <p className="text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">LegalFlow</div>
              <div className="text-xs text-slate-500">{isReviewOnly ? 'Secure Document Review' : 'Secure Document Signing'}</div>
            </div>
          </div>
          <div className="text-xs text-slate-400">
            {isReviewOnly ? 'Viewing as:' : 'Signing as:'} <span className="font-medium text-slate-700">{session?.signer_name}</span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Document info */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h1 className="text-lg font-bold text-slate-900">{session?.title}</h1>
          {session?.attorney_name && (
            <p className="text-sm text-slate-500 mt-1">From: {session.attorney_name}</p>
          )}
          {session?.message && (
            <p className="text-sm text-slate-600 mt-3 bg-blue-50 rounded-lg p-3 border border-blue-100">
              {session.message}
            </p>
          )}
        </div>

        {/* PDF Preview */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Document Preview</h2>
          <div ref={pdfCanvasRef} className="overflow-auto max-h-[60vh] bg-slate-50 rounded-lg p-3 flex flex-col items-center" />
        </div>

        {isReviewOnly ? (
          <div className="bg-blue-50 rounded-xl shadow-sm border border-blue-200 p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
              <div>
                <h2 className="text-sm font-bold text-blue-950">Your credit disclosure is ready for review</h2>
                <p className="mt-2 text-sm leading-6 text-blue-900">This is your credit disclosure. Please review it carefully and make sure everything is reporting properly. If you notice anything that appears incorrect or have questions, please contact your attorney.</p>
                <p className="mt-2 text-xs leading-5 text-blue-800">No signature or response is required for this document.</p>
              </div>
            </div>
          </div>
        ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Your Signature</h2>

          {/* Mode toggle */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-4">
            <button onClick={() => setSigMode('draw')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition ${
                sigMode === 'draw' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}>
              <Eraser className="w-4 h-4" /> Draw
            </button>
            <button onClick={() => setSigMode('type')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition ${
                sigMode === 'type' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}>
              <Type className="w-4 h-4" /> Type
            </button>
          </div>

          {sigMode === 'draw' ? (
            <>
              <div className="border-2 border-slate-200 rounded-lg overflow-hidden bg-white" style={{ touchAction: 'none' }}>
                <canvas
                  ref={initSignaturePad}
                  className="w-full"
                  style={{ height: '150px' }}
                />
              </div>
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-slate-400">Draw your signature above using your mouse or finger</p>
                <button onClick={clearSignature} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                  Clear
                </button>
              </div>
            </>
          ) : (
            <div>
              <input
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Type your full legal name"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {typedName && (
                <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-xs text-slate-400 mb-1">Preview:</p>
                  <p className="text-3xl italic" style={{ fontFamily: '"Times New Roman", serif' }}>{typedName}</p>
                </div>
              )}
            </div>
          )}

          {/* Printed name */}
          <div className="mt-4">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Printed Name</label>
            <input
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 inline mr-1" /> {error}
            </div>
          )}

          {/* Legal notice + submit */}
          <div className="mt-6">
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              By clicking "Sign Document" below, I agree that my electronic signature is the legal
              equivalent of my manual/handwritten signature, and I consent to be legally bound by this
              document. This signature is valid under the federal ESIGN Act (15 U.S.C. &sect; 7001) and
              applicable state law.
            </p>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Signing...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" /> Sign Document</>
              )}
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
