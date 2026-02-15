
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
  
  // Remove punctuation (keeping hyphens for things like "semi-sweet", but removing others)
  // Remove . , ( ) [ ] { } ! ? * " '
  name = name.replace(/[.,()\[\]{}!@#$%^&*;:<>?"']/g, "");
  // Normalize internal whitespace
  name = name.replace(/\s+/g, " ");

  // Safety check for short words or specific exceptions
  if (name.length <= 2) return name; 

  const exceptions = new Set([
      "hummus", "couscous", "molasses", "news", "series", "species", "asparagus", 
      "lens", "chaos", "bias", "canvas", "status", "campus", "virus", "chorizo", "oats", "grits"
  ]);
  if (exceptions.has(name)) return name;

  // Standard Pluralization rules
  if (name.endsWith('ies') && !name.endsWith('eies')) {
      // berry -> berries
      return name.slice(0, -3) + 'y';
  }
  
  if (name.endsWith('oes')) {
      // potato -> potatoes
      return name.slice(0, -2);
  }

  // Generic 's' removal
  // Exclude 'ss' (glass), 'us' (fungus), 'is' (axis)
  if (name.endsWith('s') && !name.endsWith('ss') && !name.endsWith('us') && !name.endsWith('is')) {
      return name.slice(0, -1);
  }

  return name;
};
