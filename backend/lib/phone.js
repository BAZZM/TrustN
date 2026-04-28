const { parsePhoneNumberWithError } = require('libphonenumber-js');

const MAX_PHONE_LENGTH = 20;

/**
 * Normalize to E.164; return null if invalid.
 */
function normalizeE164(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const trimmed = phone.replace(/\s/g, '').trim();
  if (!trimmed || trimmed.length > MAX_PHONE_LENGTH) return null;
  try {
    const parsed = parsePhoneNumberWithError(trimmed);
    return parsed ? parsed.format('E.164') : null;
  } catch {
    return null;
  }
}

/**
 * Validate E.164 length (e.g. >= 8 digits). DB layer also enforces.
 */
function isValidLength(e164) {
  const digits = (e164 || '').replace(/\D/g, '');
  return digits.length >= 8;
}

module.exports = { normalizeE164, isValidLength };
