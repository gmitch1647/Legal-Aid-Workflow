/**
 * Equifax credit report parser.
 */

const EQ_FIELDS = {
  'Date Opened:': 'dateOpened',
  'Date Reported:': 'dateUpdated',
  'Date of Last Payment:': 'lastPaymentMade',
  'Date Closed:': 'dateClosed',
  'Balance:': 'balance',
  'Balance Owed:': 'balance',
  'High Credit:': 'highBalance',
  'Credit Limit:': 'creditLimit',
  'Past Due:': 'pastDue',
  'Past Due Amount:': 'pastDue',
  'Terms:': 'terms',
  'Monthly Payment:': 'paymentAmount',
  'Account Number:': 'accountNumber',
  'Original Creditor:': 'originalCreditor',
  'Condition:': 'payStatus',
  'Pay Status:': 'payStatus',
  'Account Status:': 'payStatus',
  'Remarks:': 'remarks',
  'Type:': 'accountType',
  'Responsibility:': 'responsibility',
};

export function parseEquifax(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const accounts = [];
  let currentAccount = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.match(/^(EQUIFAX|Personal Information|Credit Summary|Inquiries|Public Records|Consumer Statement)/i)) {
      continue;
    }

    // Equifax often shows creditor name then account details
    const hasAccountNum = line.match(/[0-9]{4,}[\*X]{2,}|Account\s*#/i);
    if (hasAccountNum && !Object.keys(EQ_FIELDS).some(k => line.startsWith(k))) {
      if (currentAccount) accounts.push(currentAccount);

      const parts = line.split(/\s{2,}|(?=[0-9]{4,}[\*X])/);
      currentAccount = {
        id: `eq-${accounts.length + 1}-${Date.now()}`,
        bureau: 'equifax',
        creditor: parts[0]?.trim() || 'Unknown',
        accountNumber: (parts[1] || '').trim(),
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
      for (const [label, fieldName] of Object.entries(EQ_FIELDS)) {
        if (line.startsWith(label)) {
          let value = line.substring(label.length).trim();
          if (['balance', 'pastDue', 'highBalance', 'creditLimit'].includes(fieldName)) {
            value = value.replace(/[$,]/g, '');
          }
          currentAccount[fieldName] = value;

          if (fieldName === 'payStatus') {
            const lower = value.toLowerCase();
            if (lower.includes('collection')) { currentAccount.category = 'collection'; currentAccount.disputeType = 'collection'; }
            else if (lower.includes('charge')) currentAccount.disputeType = 'charge-off';
            else if (lower.includes('bankruptcy')) { currentAccount.category = 'public-record'; currentAccount.disputeType = 'bankruptcy'; }
            else if (lower.includes('delinquent') || lower.includes('late')) currentAccount.disputeType = 'late';
          }
          break;
        }
      }
    }
  }

  if (currentAccount) accounts.push(currentAccount);
  return accounts;
}
