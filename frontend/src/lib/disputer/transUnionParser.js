/**
 * TransUnion credit report parser.
 * Handles the labeled-field format used in TU online disclosures.
 */

// Field labels that TransUnion uses
const TU_FIELDS = {
  'Address': 'address',
  'Phone': 'phone',
  'Date Opened': 'dateOpened',
  'Date Open': 'dateOpened',
  'Responsibility': 'responsibility',
  'Account Type': 'accountType',
  'Loan Type': 'loanType',
  'Balance': 'balance',
  'Date Updated': 'dateUpdated',
  'Last Payment Made': 'lastPaymentMade',
  'Last Payment': 'lastPaymentMade',
  'Pay Status': 'payStatus',
  'Date Closed': 'dateClosed',
  'High Balance': 'highBalance',
  'High Balance (Hist.)': 'highBalance',
  'Credit Limit': 'creditLimit',
  'Credit Limit (Hist.)': 'creditLimit',
  'Original Creditor': 'originalCreditor',
  'Past Due': 'pastDue',
  'Estimated month and year this item will be removed': 'scheduledRemoval',
  'Remarks': 'remarks',
  'Terms': 'terms',
  'Payment Amount': 'paymentAmount',
  'Date of Last Activity': 'dateLastActivity',
};

// Account number patterns (masked)
const ACCOUNT_NUMBER_PATTERN = /[A-Z0-9]{4,}[\*]{2,}|[0-9]{4,}[\*]{2,}|#?\s*[A-Z0-9*]{6,}/;

// Pay status markers that indicate negative items
const NEGATIVE_STATUSES = [
  'charge-off', 'charge off', 'charged off',
  'collection', 'collections',
  'included in bankruptcy', 'account included in bankruptcy',
  'repossession', 'foreclosure',
  'settled', 'paid charge-off',
  'voluntary surrender',
];

/**
 * Parse a TransUnion credit report text into structured accounts.
 * @param {string} text — raw text from PDF extraction
 * @returns {Array<Object>} — parsed accounts
 */
export function parseTransUnion(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const accounts = [];
  let currentAccount = null;
  let inPaymentHistory = false;
  let paymentHistoryLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip section headers
    if (isHeaderLine(line)) {
      if (currentAccount) {
        if (paymentHistoryLines.length > 0) {
          currentAccount.paymentHistory = parsePaymentHistory(paymentHistoryLines);
          paymentHistoryLines = [];
        }
        accounts.push(currentAccount);
        currentAccount = null;
      }
      inPaymentHistory = false;
      continue;
    }

    // Detect new account — line with a masked account number
    const accountMatch = line.match(ACCOUNT_NUMBER_PATTERN);
    if (accountMatch && !isFieldLabel(line) && !inPaymentHistory) {
      // Save previous account
      if (currentAccount) {
        if (paymentHistoryLines.length > 0) {
          currentAccount.paymentHistory = parsePaymentHistory(paymentHistoryLines);
          paymentHistoryLines = [];
        }
        accounts.push(currentAccount);
      }

      // Extract creditor name (everything before the account number)
      const accNumIdx = line.indexOf(accountMatch[0]);
      const creditor = line.substring(0, accNumIdx).trim();
      const accountNumber = accountMatch[0].replace('#', '').trim();

      currentAccount = {
        id: `tu-${accounts.length + 1}-${Date.now()}`,
        bureau: 'transunion',
        creditor: creditor || 'Unknown',
        accountNumber,
        category: 'adverse-account',
        balance: '',
        pastDue: '',
        highBalance: '',
        creditLimit: '',
        dateOpened: '',
        dateClosed: '',
        dateUpdated: '',
        lastPaymentMade: '',
        payStatus: '',
        originalCreditor: '',
        remarks: '',
        scheduledRemoval: '',
        loanType: '',
        disputeType: 'charge-off',
        paymentHistory: [],
        negativeFindings: [],
        customFindings: [],
        includeConsumerStatement: false,
      };
      inPaymentHistory = false;
      continue;
    }

    // If we're inside an account, parse labeled fields
    if (currentAccount) {
      // Check for payment history section
      if (line.includes('Payment History') || line.includes('Payment Info')) {
        inPaymentHistory = true;
        continue;
      }

      if (line.includes('Total Months:') || line.includes('Total months:')) {
        inPaymentHistory = false;
        if (paymentHistoryLines.length > 0) {
          currentAccount.paymentHistory = parsePaymentHistory(paymentHistoryLines);
          paymentHistoryLines = [];
        }
        continue;
      }

      if (inPaymentHistory) {
        paymentHistoryLines.push(line);
        continue;
      }

      // Try to match field labels
      let matched = false;
      for (const [label, fieldName] of Object.entries(TU_FIELDS)) {
        if (line.startsWith(label)) {
          let value = line.substring(label.length).trim();
          // Remove leading colons, dashes
          value = value.replace(/^[:\-–—]\s*/, '').trim();
          // Clean pay status markers
          if (fieldName === 'payStatus') {
            value = value.replace(/^>/, '').replace(/<$/, '').trim();
          }
          // Clean currency
          if (['balance', 'pastDue', 'highBalance', 'creditLimit'].includes(fieldName)) {
            value = value.replace(/[$,]/g, '').trim();
          }
          currentAccount[fieldName] = value;
          matched = true;

          // Categorize based on pay status
          if (fieldName === 'payStatus') {
            const lower = value.toLowerCase();
            if (lower.includes('collection') || lower.includes('col')) {
              currentAccount.category = 'collection';
              currentAccount.disputeType = 'collection';
            } else if (lower.includes('charge') || lower.includes('c/o')) {
              currentAccount.disputeType = 'charge-off';
            } else if (lower.includes('bankruptcy')) {
              currentAccount.disputeType = 'bankruptcy';
              currentAccount.category = 'public-record';
            } else if (lower.includes('late') || lower.includes('past due')) {
              currentAccount.disputeType = 'late';
            }
          }
          break;
        }
      }
    }
  }

  // Don't forget the last account
  if (currentAccount) {
    if (paymentHistoryLines.length > 0) {
      currentAccount.paymentHistory = parsePaymentHistory(paymentHistoryLines);
    }
    accounts.push(currentAccount);
  }

  return accounts;
}


function isHeaderLine(line) {
  const headers = [
    'ACCOUNT INFORMATION', 'CREDIT SUMMARY', 'PERSONAL INFORMATION',
    'INQUIRIES', 'PUBLIC RECORDS', 'CONSUMER STATEMENT',
    'TransUnion Consumer', 'Credit Report', 'Personal Information',
    'Account Summary', 'Potentially Negative',
  ];
  return headers.some(h => line.toUpperCase().startsWith(h.toUpperCase()));
}


function isFieldLabel(line) {
  return Object.keys(TU_FIELDS).some(label => line.startsWith(label));
}


function parsePaymentHistory(lines) {
  const entries = [];
  const ratings = ['OK', '30', '60', '90', '120', 'C/O', 'COL', 'VS', 'RPO', 'FC', 'X', 'N/R'];

  for (const line of lines) {
    // Try to parse "Mon Year" + ratings/values
    const monthMatch = line.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i);
    if (monthMatch) {
      const rest = line.substring(monthMatch[0].length).trim();
      const parts = rest.split(/\s+/);

      const entry = {
        month: monthMatch[1],
        year: parseInt(monthMatch[2]),
        balance: null,
        pastDue: null,
        amountPaid: null,
        remarks: '',
        rating: 'OK',
      };

      // Try to find rating in the parts
      for (const part of parts) {
        const upper = part.toUpperCase().replace(/[$,]/g, '');
        if (ratings.includes(upper)) {
          entry.rating = upper;
        } else if (part.startsWith('$') || /^\d+$/.test(part.replace(/[$,]/g, ''))) {
          const num = parseFloat(part.replace(/[$,]/g, ''));
          if (!isNaN(num)) {
            if (entry.balance === null) entry.balance = num;
            else if (entry.pastDue === null) entry.pastDue = num;
            else entry.amountPaid = num;
          }
        }
      }

      entries.push(entry);
    }
  }

  return entries;
}
