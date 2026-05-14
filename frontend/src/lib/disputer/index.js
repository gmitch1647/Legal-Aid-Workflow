/**
 * Credit Report Disputer — main entry point.
 * Ties together PDF extraction, bureau detection, parsing,
 * negative attribute analysis, and consumer statement generation.
 */

export { extractTextFromPDF } from './pdfExtractor';
export { detectBureau } from './bureauDetector';
export { parseTransUnion } from './transUnionParser';
export { parseExperian } from './experianParser';
export { parseEquifax } from './equifaxParser';
export { analyzeAccount } from './negativeAttributeAnalyzer';
export { generateConsumerStatement, regenerateStatement } from './consumerStatementGenerator';

import { extractTextFromPDF } from './pdfExtractor';
import { detectBureau } from './bureauDetector';
import { parseTransUnion } from './transUnionParser';
import { parseExperian } from './experianParser';
import { parseEquifax } from './equifaxParser';
import { analyzeAccount } from './negativeAttributeAnalyzer';

/**
 * Full pipeline: PDF file → parsed accounts with negative findings.
 * @param {File} file — PDF file
 * @param {string} forceBureau — optional bureau override
 * @returns {Promise<{accounts: Array, bureau: string, pages: number, error: string|null}>}
 */
export async function processReport(file, forceBureau = null) {
  // Extract text
  const { text, pages, isScanned } = await extractTextFromPDF(file);

  if (isScanned) {
    return {
      accounts: [],
      bureau: 'unknown',
      pages,
      error: 'This PDF appears to be a scan. Please upload a text-based PDF or paste the report text manually.',
    };
  }

  if (!text || text.length < 50) {
    return {
      accounts: [],
      bureau: 'unknown',
      pages,
      error: 'Could not extract text from this PDF. Try a different file or paste the report text manually.',
    };
  }

  // Detect bureau
  const bureau = forceBureau || detectBureau(text);

  // Parse based on bureau
  let accounts = [];
  switch (bureau) {
    case 'transunion':
      accounts = parseTransUnion(text);
      break;
    case 'experian':
      accounts = parseExperian(text);
      break;
    case 'equifax':
      accounts = parseEquifax(text);
      break;
    default:
      // Try all parsers and use whichever finds the most accounts
      const tuAccounts = parseTransUnion(text);
      const exAccounts = parseExperian(text);
      const eqAccounts = parseEquifax(text);
      if (tuAccounts.length >= exAccounts.length && tuAccounts.length >= eqAccounts.length) {
        accounts = tuAccounts;
      } else if (exAccounts.length >= eqAccounts.length) {
        accounts = exAccounts;
      } else {
        accounts = eqAccounts;
      }
  }

  // Analyze each account for negative attributes
  for (const account of accounts) {
    account.negativeFindings = analyzeAccount(account);
  }

  return {
    accounts,
    bureau,
    pages,
    error: accounts.length === 0
      ? 'No accounts were detected. Try pasting the report text manually or adding accounts by hand.'
      : null,
  };
}

/**
 * Parse raw text (pasted by user) instead of a PDF file.
 * @param {string} text — raw report text
 * @param {string} forceBureau — optional bureau override
 * @returns {{accounts: Array, bureau: string}}
 */
export function processReportText(text, forceBureau = null) {
  const bureau = forceBureau || detectBureau(text);

  let accounts = [];
  switch (bureau) {
    case 'transunion':
      accounts = parseTransUnion(text);
      break;
    case 'experian':
      accounts = parseExperian(text);
      break;
    case 'equifax':
      accounts = parseEquifax(text);
      break;
    default:
      const tu = parseTransUnion(text);
      const ex = parseExperian(text);
      const eq = parseEquifax(text);
      accounts = [tu, ex, eq].sort((a, b) => b.length - a.length)[0];
  }

  for (const account of accounts) {
    account.negativeFindings = analyzeAccount(account);
  }

  return { accounts, bureau };
}
