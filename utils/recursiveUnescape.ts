import { unescapeHTML } from './validation';

export function recursiveUnescape(obj: any): any {
  if (typeof obj === 'string') {
    return unescapeHTML(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(recursiveUnescape);
  }
  if (obj !== null && typeof obj === 'object') {
    const newObj: any = {};
    for (const key of Object.keys(obj)) {
      newObj[key] = recursiveUnescape(obj[key]);
    }
    return newObj;
  }
  return obj;
}