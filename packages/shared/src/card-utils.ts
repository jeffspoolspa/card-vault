import type { CardBrand } from './types';

/** Luhn algorithm — validates a credit card number */
export function luhnCheck(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length === 0) return false;

  let sum = 0;
  let alternate = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }

  return sum % 10 === 0;
}

/** Detect card brand from first digit(s) */
export function detectCardBrand(cardNumber: string): CardBrand {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 1) return null;

  const d1 = parseInt(digits[0], 10);
  const d2 = digits.length >= 2 ? parseInt(digits.slice(0, 2), 10) : -1;
  const d4 = digits.length >= 4 ? parseInt(digits.slice(0, 4), 10) : -1;

  if (d1 === 4) return 'Visa';
  if ((d2 >= 51 && d2 <= 55) || (d4 >= 2221 && d4 <= 2720)) return 'Mastercard';
  if (d2 === 34 || d2 === 37) return 'American Express';
  if (d4 === 6011 || d2 === 65) return 'Discover';

  return null;
}

/** Extract last four digits */
export function getLastFour(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, '');
  return digits.slice(-4);
}

/** Validate card number length (13-19 digits) */
export function isValidCardLength(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  return digits.length >= 13 && digits.length <= 19;
}

/** Validate expiration is in the future. Expects MM/YY or MMYY. */
export function isExpirationValid(exp: string): boolean {
  const cleaned = exp.replace(/\D/g, '');
  if (cleaned.length !== 4) return false;

  const month = parseInt(cleaned.slice(0, 2), 10);
  const year = parseInt(cleaned.slice(2, 4), 10) + 2000;

  if (month < 1 || month > 12) return false;

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  if (year > currentYear) return true;
  if (year === currentYear && month >= currentMonth) return true;
  return false;
}

/** Format card number with spaces for display (4-digit groups) */
export function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 19);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

/** Format expiration as MM/YY */
export function formatExpiration(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 3) {
    return digits.slice(0, 2) + '/' + digits.slice(2);
  }
  return digits;
}

/** Strip all non-digits from a card number */
export function stripCardNumber(value: string): string {
  return value.replace(/\D/g, '');
}

/** Full card validation — returns first error or null if valid */
export function validateCard(cardNumber: string, expiration: string): string | null {
  const digits = stripCardNumber(cardNumber);

  if (!isValidCardLength(digits)) {
    return 'Card number must be 13-19 digits';
  }
  if (!luhnCheck(digits)) {
    return 'Invalid card number';
  }
  if (!isExpirationValid(expiration)) {
    return 'Expiration must be a valid future date (MM/YY)';
  }

  return null;
}
