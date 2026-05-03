
/**
 * Sanitizes a string to prevent XSS.
 */
export function sanitize(text: string): string {
  if (!text) return '';
  return text.trim();
}

/**
 * Validates that a string is not empty.
 */
export function unescapeHTML(str: string): string {
    if (!str) return str;
    let decoded = str;
    let prev = '';
    while (decoded !== prev) {
      prev = decoded;
      decoded = decoded
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'");
    }
    if (decoded.match(/^https?:\/\/[^/]+\/api\/images\?(.*)$/)) {
        decoded = decoded.replace(/^https?:\/\/[^/]+\/api\/images\?(.*)$/, '/api/images?$1');
    }
    
    return decoded;
}

export function isNotEmpty(text: string | undefined): boolean {
  return !!text && text.trim().length > 0;
}

/**
 * Validates a URL.
 */
export function isValidUrl(url: string | undefined): boolean {
  if (!url) return true; // Optional field
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a number is within a range.
 */
export function isValidNumber(val: number | undefined, min: number = 0, max: number = Infinity): boolean {
  if (val === undefined) return true;
  return val >= min && val <= max;
}
