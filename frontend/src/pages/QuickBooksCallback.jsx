import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { connectQuickBooks } from '../lib/api';

export default function QuickBooksCallback() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState('');
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const realmId = searchParams.get('realmId');

    if (!code || !realmId) {
      setStatus('error');
      setError('Missing authorization code or company ID from QuickBooks.');
      return;
    }

    async function exchange() {
      try {
        const result = await connectQuickBooks(code, realmId);
        setCompanyName(result.company_name || '');
        setStatus('success');
      } catch (err) {
        setStatus('error');
        setError(err.message || 'Failed to connect QuickBooks.');
      }
    }

    exchange();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
        {status === 'processing' && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-green-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-900 mb-2">Connecting QuickBooks...</h1>
            <p className="text-sm text-slate-500">Please wait while we complete the connection.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">QuickBooks Connected</h1>
            {companyName && <p className="text-sm text-slate-700 mb-2">Connected to <strong>{companyName}</strong></p>}
            <p className="text-sm text-slate-500 mb-6">You can now sync commissions to QuickBooks from the Commissions page.</p>
            <a href="/attorney/commissions"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
              Go to Commissions
            </a>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-900 mb-2">Connection Failed</h1>
            <p className="text-sm text-red-600 mb-6">{error}</p>
            <a href="/attorney/commissions"
              className="inline-flex items-center gap-2 px-6 py-3 bg-slate-600 text-white rounded-xl text-sm font-medium hover:bg-slate-700">
              Back to Commissions
            </a>
          </>
        )}
      </div>
    </div>
  );
}
