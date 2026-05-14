/**
 * Generates unique ~100-word consumer statements per account.
 * Uses a pool of opening/middle/closing fragments seeded by
 * account-specific data for uniqueness.
 */

const OPENINGS = {
  'charge-off': [
    "I dispute the charge-off status reported on this account.",
    "This account is being reported as a charge-off, which I believe is inaccurate.",
    "I am formally disputing the charge-off designation on this tradeline.",
    "The charge-off status shown on this account does not reflect the actual history.",
    "I want it noted that I dispute the accuracy of this charge-off reporting.",
  ],
  'collection': [
    "I dispute this collection account and its validity.",
    "This collection is being reported inaccurately on my credit file.",
    "I do not acknowledge this collection as a valid debt.",
    "I am formally disputing this collection tradeline.",
    "This collection account contains information I believe to be inaccurate.",
  ],
  'late': [
    "I dispute the late payment notation on this account.",
    "The late payment history shown on this account is inaccurate.",
    "I am disputing the reported delinquency on this tradeline.",
    "The payment history reported on this account does not match my records.",
    "I want to formally dispute the late payment entries shown here.",
  ],
  'duplicate': [
    "This account appears to be a duplicate of another tradeline on my report.",
    "I believe this is a duplicate entry that should be removed.",
    "This tradeline is being reported twice, inflating my negative accounts.",
    "I am disputing this as a duplicate account that violates accurate reporting.",
    "This appears to be a re-aged or duplicate version of an existing account.",
  ],
  'identity': [
    "This account was opened fraudulently and without my authorization.",
    "I am a victim of identity theft and did not open this account.",
    "This tradeline is the result of identity theft and is not mine.",
    "I have never opened or authorized this account.",
    "This fraudulent account must be removed from my credit file immediately.",
  ],
  'bankruptcy': [
    "The bankruptcy-related reporting on this account is inaccurate.",
    "I dispute how this account is being reported in connection with my bankruptcy.",
    "The status shown on this account does not accurately reflect the bankruptcy disposition.",
    "This account's bankruptcy notation contains errors that must be corrected.",
    "I am disputing the reporting of this account as included in bankruptcy.",
  ],
  'balance': [
    "The balance reported on this account is incorrect.",
    "I dispute the balance and payment information shown on this tradeline.",
    "The reported balance does not match my records or the creditor's own records.",
    "I am formally disputing the balance figures reported on this account.",
    "The financial figures reported on this account contain errors.",
  ],
  'outdated': [
    "This information has exceeded the maximum reporting period allowed by law.",
    "This item should have been removed from my report per § 1681c.",
    "I dispute this outdated information that should no longer be reported.",
    "This tradeline has passed the allowable reporting period.",
    "I am requesting removal of this obsolete item.",
  ],
  'inquiry': [
    "I did not authorize this inquiry into my credit file.",
    "This inquiry was made without my knowledge or consent.",
    "I dispute this unauthorized access to my consumer report.",
    "I am requesting removal of this inquiry that I did not authorize.",
    "This hard inquiry was pulled without my permissible purpose authorization.",
  ],
  'unknown': [
    "I do not recognize this account and believe it is being reported in error.",
    "This account does not belong to me and should be removed.",
    "I have no knowledge of this tradeline and dispute its accuracy.",
    "I am formally disputing this unknown account on my credit file.",
    "This tradeline is unfamiliar to me and I request its verification.",
  ],
  'custom': [
    "I am disputing the accuracy of the information reported on this account.",
    "I believe this account contains reporting errors that must be corrected.",
    "I am formally requesting investigation of this tradeline.",
    "The information reported on this account is inaccurate and incomplete.",
    "I dispute the current reporting of this account and request correction.",
  ],
};

const MIDDLES = [
  "The information being reported is causing material harm to my creditworthiness and is preventing me from obtaining fair terms on credit products.",
  "I have attempted to resolve this matter directly with the creditor, but the inaccurate information continues to appear on my report.",
  "I believe the current reporting fails to meet the standard of maximum possible accuracy required by the Fair Credit Reporting Act.",
  "The continued reporting of this inaccurate information has resulted in credit denials and increased interest rates on my existing accounts.",
  "Despite prior disputes, this information remains on my file without adequate reinvestigation by the reporting agency.",
  "The presence of this inaccurate information has caused me financial hardship and emotional distress.",
  "I have documentation that contradicts the information currently being reported on this tradeline.",
  "The furnisher of this information has failed to conduct a reasonable investigation as required by law.",
  "This reporting error has persisted for an unreasonable period and has caused ongoing damage to my credit profile.",
  "I request that any creditor reviewing my file be aware that I actively dispute this information.",
  "The inaccuracies in this reporting are not minor — they fundamentally misrepresent my credit history.",
  "I have taken responsible steps to manage my finances, and this erroneous reporting undermines those efforts.",
];

const CLOSINGS = [
  "I request that this statement remain attached to this tradeline as a permanent part of my consumer file under FCRA § 1681i(c).",
  "Future creditors should be aware that I have disputed this information and consider it inaccurate.",
  "I want any entity that pulls my credit report to see that I actively contest the accuracy of this entry.",
  "This statement should be included in any future consumer report that contains this tradeline.",
  "I exercise my right under § 1681i(b) to have this statement permanently attached to my file.",
  "I request that this consumer statement accompany this tradeline in all future disclosures.",
  "Any prospective creditor or employer reviewing my file should know that I dispute this information.",
  "This statement is my formal record of disputing this tradeline under the Fair Credit Reporting Act.",
];


function hashSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}


/**
 * Generate a unique ~100-word consumer statement for an account.
 * @param {Object} account — account data
 * @param {string} extraSeed — additional randomization seed
 * @returns {string} — the consumer statement
 */
export function generateConsumerStatement(account, extraSeed = '') {
  const seed = hashSeed(
    `${account.creditor}|${account.accountNumber}|${account.disputeType}|${extraSeed}`
  );

  const type = account.disputeType || 'custom';
  const openings = OPENINGS[type] || OPENINGS['custom'];
  const opening = openings[seed % openings.length];
  const middle = MIDDLES[(seed >> 3) % MIDDLES.length];
  const closing = CLOSINGS[(seed >> 6) % CLOSINGS.length];

  // Add account-specific detail
  let detail = '';
  if (account.creditor) {
    detail = ` The account with ${account.creditor}${account.accountNumber ? ` (account ending ${account.accountNumber.slice(-4)})` : ''} is specifically at issue.`;
  }

  return `${opening}${detail} ${middle} ${closing}`;
}


/**
 * Regenerate with a new random seed.
 */
export function regenerateStatement(account) {
  return generateConsumerStatement(account, Date.now().toString());
}
