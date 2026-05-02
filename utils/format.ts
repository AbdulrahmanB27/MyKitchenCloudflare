
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

const SINGULAR_TO_PLURAL: Record<string, string> = {
  'tomato': 'tomatoes',
  'potato': 'potatoes',
  'onion': 'onions',
  'carrot': 'carrots',
  'apple': 'apples',
  'lemon': 'lemons',
  'lime': 'limes',
  'orange': 'oranges',
  'strawberry': 'strawberries',
  'blueberry': 'blueberries',
  'raspberry': 'raspberries',
  'berry': 'berries',
  'mushroom': 'mushrooms',
  'avocado': 'avocados',
  'olive': 'olives',
  'pepper': 'peppers',
  'jalapeno': 'jalapenos',
  'scallion': 'scallions',
  'shallot': 'shallots',
  'leek': 'leeks',
  'radish': 'radishes',
  'egg': 'eggs',
  'sausage': 'sausages',
  'burger': 'burgers',
  'patty': 'patties',
  'bean': 'beans',
  'lentil': 'lentils',
  'chickpea': 'chickpeas',
  'pea': 'peas',
  'nut': 'nuts',
  'seed': 'seeds',
  'almond': 'almonds',
  'walnut': 'walnuts',
  'pecan': 'pecans',
  'noodle': 'noodles',
  'tortilla': 'tortillas',
  'bun': 'buns',
  'roll': 'rolls',
  'chip': 'chips',
  'cracker': 'crackers',
  'cookie': 'cookies',
  'brownie': 'brownies',
  'muffin': 'muffins',
  'pancake': 'pancakes',
  'waffle': 'waffles',
  'slice': 'slices',
  'piece': 'pieces',
  'clove': 'cloves',
  'sprig': 'sprigs',
  'leaf': 'leaves'
};

export const normalizeIngredient = (input: string): string => {
  if (!input) return '';
  let name = input.toLowerCase().trim();
  
  // Remove punctuation
  name = name.replace(/[.,()\[\]{}!@#$%^&*;:<>?"']/g, "");
  // Normalize internal whitespace
  name = name.replace(/\s+/g, " ");

  if (name.length <= 2) return name; 

  const words = name.split(' ');
  if (words.length > 0) {
    const lastWord = words[words.length - 1];
    if (SINGULAR_TO_PLURAL[lastWord]) {
      words[words.length - 1] = SINGULAR_TO_PLURAL[lastWord];
    }
    name = words.join(' ');
  }

  return name;
};
