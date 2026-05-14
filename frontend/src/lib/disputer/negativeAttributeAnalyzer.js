/**
 * Analyzes parsed account data to detect specific negative attributes.
 * Produces structured findings that drive dispute letter content.
 */

export function analyzeAccount(account) {
  const findings = [];

  const balance = parseFloat(account.balance) || 0;
  const pastDue = parseFloat(account.pastDue) || 0;
  const creditLimit = parseFloat(account.creditLimit) || 0;
  const highBalance = parseFloat(account.highBalance) || 0;
  const status = (account.payStatus || '').toLowerCase();
  const history = account.paymentHistory || [];

  // ── Pay Status findings ────────────────────────────────────────────
  if (status.includes('charge') || status.includes('c/o')) {
    findings.push({
      type: 'payment-history',
      description: `Pay Status: ${account.payStatus}`,
      severity: 'high',
    });
  }
  if (status.includes('collection')) {
    findings.push({
      type: 'payment-history',
      description: `Pay Status: ${account.payStatus} — account sold to collection`,
      severity: 'high',
    });
  }
  if (status.includes('bankruptcy')) {
    findings.push({
      type: 'payment-history',
      description: `Pay Status: Account Included in Bankruptcy`,
      severity: 'high',
    });
  }

  // ── Balance findings ───────────────────────────────────────────────
  if (balance > 0 && pastDue > 0) {
    findings.push({
      type: 'balance-inflation',
      description: `Balance $${balance.toLocaleString()} / Past Due $${pastDue.toLocaleString()}`,
      severity: 'high',
    });
  }

  // Over-limit reporting
  if (creditLimit > 0 && balance > creditLimit) {
    const excess = balance - creditLimit;
    findings.push({
      type: 'over-limit',
      description: `Balance $${balance.toLocaleString()} exceeds Credit Limit $${creditLimit.toLocaleString()} by $${excess.toLocaleString()} — over-limit reporting`,
      severity: 'high',
    });
  }

  if (creditLimit > 0 && highBalance > creditLimit) {
    findings.push({
      type: 'over-limit',
      description: `High Balance $${highBalance.toLocaleString()} exceeds Credit Limit $${creditLimit.toLocaleString()} — historical over-limit`,
      severity: 'medium',
    });
  }

  // ── Date findings ──────────────────────────────────────────────────
  if (account.dateClosed && account.lastPaymentMade) {
    const closed = parseDate(account.dateClosed);
    const lastPay = parseDate(account.lastPaymentMade);
    if (closed && lastPay && lastPay > closed) {
      findings.push({
        type: 'date-mismatch',
        description: `Last payment ${account.lastPaymentMade} is AFTER account closed ${account.dateClosed} — active payment on closed/charged-off account`,
        severity: 'high',
      });
    }
  }

  if (account.lastPaymentMade) {
    const lastPay = parseDate(account.lastPaymentMade);
    if (lastPay) {
      const monthsAgo = monthsDiff(lastPay, new Date());
      if (monthsAgo > 0) {
        findings.push({
          type: 'payment-history',
          description: `Last Payment: ${account.lastPaymentMade} — ${monthsAgo} months ago`,
          severity: monthsAgo > 24 ? 'medium' : 'low',
        });
      }
    }
  }

  if (account.dateClosed) {
    findings.push({
      type: 'date-mismatch',
      description: `Date Closed: ${account.dateClosed}`,
      severity: 'low',
    });
  }

  // ── Payment history findings ───────────────────────────────────────
  if (history.length > 0) {
    const lateRatings = history.filter(h =>
      ['30', '60', '90', '120', 'C/O', 'COL', 'VS', 'RPO', 'FC'].includes(h.rating)
    );

    if (lateRatings.length > 0) {
      const ratingList = lateRatings.map(h => `${h.rating} (${h.month} ${h.year})`);
      findings.push({
        type: 'payment-history',
        description: `Payment history: ${ratingList.join(', ')}`,
        severity: 'high',
      });
    }

    // Consecutive C/O months (Metro 2 re-aging concern)
    let consecutiveCO = 0;
    let maxConsecutiveCO = 0;
    for (const entry of history) {
      if (entry.rating === 'C/O') {
        consecutiveCO++;
        maxConsecutiveCO = Math.max(maxConsecutiveCO, consecutiveCO);
      } else {
        consecutiveCO = 0;
      }
    }
    if (maxConsecutiveCO > 12) {
      findings.push({
        type: 'metro2-violation',
        description: `${maxConsecutiveCO} consecutive months of C/O reporting — Metro 2 re-aging concern`,
        severity: 'high',
      });
    }

    // Non-monotonic late progression (60 → 30 without payment)
    for (let i = 1; i < history.length; i++) {
      const prev = ratingToNum(history[i - 1].rating);
      const curr = ratingToNum(history[i].rating);
      if (prev > curr && prev > 0 && curr > 0) {
        const prevPaid = history[i]?.amountPaid;
        if (!prevPaid || prevPaid === 0) {
          findings.push({
            type: 'metro2-violation',
            description: `Payment history shows ${history[i-1].rating} → ${history[i].rating} in ${history[i].month} ${history[i].year}: drop without intervening payment is internally inconsistent`,
            severity: 'high',
          });
          break; // Only report first instance
        }
      }
    }

    // Static balance with $0 payment
    let staticCount = 0;
    for (let i = 1; i < history.length; i++) {
      if (
        history[i].balance === history[i - 1].balance &&
        history[i].balance > 0 &&
        (history[i].amountPaid === 0 || history[i].amountPaid === null)
      ) {
        staticCount++;
      }
    }
    if (staticCount > 6) {
      findings.push({
        type: 'static-balance',
        description: `${staticCount} consecutive months of identical static balance with $0 payment received`,
        severity: 'medium',
      });
    }
  }

  // ── Remarks findings ───────────────────────────────────────────────
  const remarks = (account.remarks || '').toLowerCase();
  if (remarks.includes('aid') || remarks.includes('account information disputed')) {
    findings.push({
      type: 'prior-dispute',
      description: `Already flagged "Account information disputed by consumer (FCRA)" — prior § 1681i reinvestigation was inadequate, supports Method of Verification follow-up`,
      severity: 'medium',
    });
  }

  // ── Original creditor findings ─────────────────────────────────────
  if (account.originalCreditor) {
    const oc = account.originalCreditor;
    if (oc.match(/[A-Z]{2,}$/)) {
      findings.push({
        type: 'chain-of-assignment',
        description: `Original Creditor field "${oc}" contains trailing codes — potential data corruption in chain of assignment`,
        severity: 'medium',
      });
    }
  }

  // ── Obsolete information ───────────────────────────────────────────
  if (account.scheduledRemoval) {
    const removal = parseDate(account.scheduledRemoval);
    if (removal && removal < new Date()) {
      findings.push({
        type: 'date-mismatch',
        description: `Scheduled removal date ${account.scheduledRemoval} has PASSED — item should have been removed per § 1681c`,
        severity: 'high',
      });
    }
  }

  return findings;
}


function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  // Try MM/YYYY format
  const match = dateStr.match(/(\d{1,2})\/?(\d{4})/);
  if (match) return new Date(parseInt(match[2]), parseInt(match[1]) - 1);
  return null;
}


function monthsDiff(d1, d2) {
  return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
}


function ratingToNum(rating) {
  const map = { '30': 30, '60': 60, '90': 90, '120': 120, 'C/O': 150, 'COL': 150 };
  return map[rating] || 0;
}
