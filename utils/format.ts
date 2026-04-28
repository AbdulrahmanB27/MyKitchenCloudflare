
export const formatFraction = (amount: number): string => {
  if (amount === 0 || amount === undefined || amount === null) return '';
  
  const tolerance = 0.02; // Tolerance for floating point math
  const whole = Math.floor(amount);
  const decimal = amount - whole;
  
  // Close enough to whole number?
  if (Math.abs(decimal) < tolerance) return whole.toString();
  if (Math.abs(decimal - 1) < tolerance) return (whole + 1).toString();

  // Common fractions mapping
  const fractions = [
      { val: 1/8, txt: "1/8" },
      { val: 1/4, txt: "1/4" },
      { val: 1/3, txt: "1/3" },
      { val: 3/8, txt: "3/8" },
      { val: 1/2, txt: "1/2" },
      { val: 5/8, txt: "5/8" },
      { val: 2/3, txt: "2/3" },
      { val: 3/4, txt: "3/4" },
      { val: 7/8, txt: "7/8" }
  ];

  for (const frac of fractions) {
      if (Math.abs(decimal - frac.val) < tolerance) {
          return whole > 0 ? `${whole} ${frac.txt}` : frac.txt;
      }
  }

  // Round to 2 decimals if not a clean fraction
  return parseFloat(amount.toFixed(2)).toString();
};

export const normalizeIngredient = (input: string): string => {
  if (!input) return '';
  let name = input.toLowerCase().trim();
  
  // Remove punctuation
  name = name.replace(/[.,()\[\]{}!@#$%^&*;:<>?"']/g, "");
  // Normalize internal whitespace
  name = name.replace(/\s+/g, " ");

  if (name.length <= 2) return name; 

  const exceptions = new Set([
      "hummus", "couscous", "molasses", "news", "series", "species", "asparagus", 
      "lens", "chaos", "bias", "canvas", "status", "campus", "virus", "chorizo", "oats", "grits",
      "salt", "pepper", "water", "sugar", "flour", "milk", "butter", "oil", "rice"
  ]);
  if (exceptions.has(name)) return name;

  // Simple pluralization logic
  if (name.endsWith('ies') || name.endsWith('ves') || name.endsWith('oes')) {
    return name;
  }
  
  if (name.endsWith('s') && !['ss', 'us', 'is', 'as'].some(suffix => name.endsWith(suffix))) {
    return name;
  }

  if (name.endsWith('y')) {
    const vowels = ['a', 'e', 'i', 'o', 'u'];
    if (name.length > 1 && !vowels.includes(name[name.length - 2])) {
      return name.slice(0, -1) + 'ies';
    }
    return name + 's';
  }

  if (name.endsWith('f')) {
    return name.slice(0, -1) + 'ves';
  }

  if (name.endsWith('fe')) {
    return name.slice(0, -2) + 'ves';
  }

  if (['x', 'z', 'ch', 'sh'].some(suffix => name.endsWith(suffix))) {
    return name + 'es';
  }

  return name + 's';
};
