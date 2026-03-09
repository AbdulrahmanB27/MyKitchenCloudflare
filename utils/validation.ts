
import DOMPurify from 'dompurify';

/**
 * Sanitizes a string to prevent XSS.
 */
export const sanitize = (text: string): string => {
  if (!text) return '';
  return DOMPurify.sanitize(text.trim());
};

/**
 * Validates that a string is not empty.
 */
export const isNotEmpty = (text: string | undefined): boolean => {
  return !!text && text.trim().length > 0;
};

/**
 * Validates a URL.
 */
export const isValidUrl = (url: string | undefined): boolean => {
  if (!url) return true; // Optional field
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validates a number is within a range.
 */
export const isValidNumber = (val: number | undefined, min: number = 0, max: number = Infinity): boolean => {
  if (val === undefined) return true;
  return val >= min && val <= max;
};
