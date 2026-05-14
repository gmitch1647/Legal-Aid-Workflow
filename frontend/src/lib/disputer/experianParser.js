/**
 * Experian credit report parser.
 */

const EX_FIELDS = {
  'Status:': 'payStatus',
  'Date of Status:': 'dateUpdated',
  'Date Opened:': 'dateOpened',
  'Date Reported:': 'dateUpdated',
  'Date of Last Payment:': 'lastPaymentMade',
  'Type:': 'accountType',
  'Terms:': 'terms',
  'Monthly Payment:': 'paymentAmount',
  'Responsibility:': 'responsibility',
  'Credit Limit/Original Amount:': 'creditLimit',
  'Credit Limit:': 'creditLimit',
  'High Balance:': 'highBalance',
  'Recent Balance:': 'balance',
  'Balance:': 'balance',
  'Recent Payment:': 'lastPayment',
  'Account Number:': 'accountNumber',
  'Original Creditor:': 'originalCreditor',
  'Past Due Amount:': 'pastDue',
  'Remarks:': 'remarks',
  'Date Closed:': 'dateClosed',
};

const ACCOUNT_PATTERN = /^([A-Z][A-Za-z\s&'.,-]+(?:LLC|INC|CORP|CO|BANK|NA|FSB|N\.A\.)?)\s*$/;

export function parseExperian(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const accounts = [];
  let currentAccount = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip known headers
    if (line.match(/^(EXPERIAN|Personal Information|Credit Summary|Inquiries|Public Records|Consumer Statement)/i)) {
      continue;
    }

    // Detect account start — Experian shows "Account Name" then "Account #" on next labeled line
    if (line.match(/^Account\s*#?\s*:/i) || (line.match(ACCOUNT_PATTERN) && i + 1 < lines.length && lines[i+1].match(/Account\s*#|Status:/i))) {
      if (currentAccount) accounts.push(currentAccount);

      currentAccount = {
        id: `ex-${accounts.length + 1}-${Date.now()}`,
        bureau: 'experian',
        creditor: line.replace(/Account\s*#?\s*:?\s*/i, '').trim() || 'Unknown',
        accountNumber: '',
        category: 'adverse-account',
        balance: '', pastDue: '', highBalance: '', creditLimit: '',
        dateOpened: '', dateClosed: '', dateUpdated: '', lastPaymentMade: '',
        payStatus: '', originalCreditor: '', remarks: '', loanType: '',
        disputeType: 'charge-off',
        paymentHistory: [],
        negativeFindings: [],
        customFindings: [],
        includeConsumerStatement: false,
      };
      continue;
    }

    if (currentAccount) {
      let matched = false;
      for (const [label, fieldName] of Object.entries(EX_FIELDS)) {
        if (line.startsWith(label)) {
          let value = line.substring(label.length).trim();
          if (['balance', 'pastDue', 'highBalance', 'creditLimit'].includes(fieldName)) {
            value = value.replace(/[$,]/g, '');
          }
          currentAccount[fieldName] = value;
          matched = true;

          if (fieldName === 'payStatus') {
            const lower = value.toLowerCase();
            if (lower.includes('collection')) { currentAccount.category = 'collection'; currentAccount.disputeType = 'collection'; }
            else if (lower.includes('charge')) currentAccount.disputeType = 'charge-off';
            else if (lower.includes('bankruptcy')) { currentAccount.category = 'public-record'; currentAccount.disputeType = 'bankruptcy'; }
            else if (lower.includes('late') || lower.includes('delinquent')) currentAccount.disputeType = 'late';
          }

          if (fieldName === 'accountNumber' && !currentAccount.creditor.match(/[a-z]/i)) {
            // If creditor wasn't set properly, try previous line
            if (i > 0 && !lines[i-1].includes(':')) currentAccount.creditor = lines[i-1];
          }
          break;
        }
      }

      // Creditor name line (no colon, all/mostly uppercase, before account fields)
      if (!matched && !line.includes(':') && line.match(/^[A-Z][A-Z\s&'.,-]{3,}$/) && !currentAccount.creditor.match(/[a-z]/)) {
        currentAccount.creditor = line;
      }
    }
  }

  if (currentAccount) accounts.push(currentAccount);
  return accounts;
}
