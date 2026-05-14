/**
 * Detect which credit bureau a report belongs to based on text content.
 */

export function detectBureau(text) {
  const upper = text.toUpperCase();

  // TransUnion markers
  if (
    upper.includes('TRANSUNION') ||
    upper.includes('TRANS UNION') ||
    upper.includes('TRANSUNION CONSUMER SOLUTIONS') ||
    upper.includes('TU FILE') ||
    (upper.includes('PAY STATUS') && upper.includes('ESTIMATED MONTH AND YEAR'))
  ) {
    return 'transunion';
  }

  // Experian markers
  if (
    upper.includes('EXPERIAN') ||
    upper.includes('EXPERIAN INFORMATION SOLUTIONS') ||
    upper.includes('EXPERIAN CREDIT REPORT') ||
    (upper.includes('STATUS:') && upper.includes('DATE OF STATUS:'))
  ) {
    return 'experian';
  }

  // Equifax markers
  if (
    upper.includes('EQUIFAX') ||
    upper.includes('EQUIFAX INFORMATION SERVICES') ||
    upper.includes('EFX') ||
    (upper.includes('DATE REPORTED') && upper.includes('CONDITION'))
  ) {
    return 'equifax';
  }

  // ChexSystems
  if (upper.includes('CHEXSYSTEMS') || upper.includes('CHEX SYSTEMS')) {
    return 'other';
  }

  // LexisNexis
  if (upper.includes('LEXISNEXIS') || upper.includes('LEXIS NEXIS')) {
    return 'other';
  }

  return 'unknown';
}
