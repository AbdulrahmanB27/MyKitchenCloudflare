export const COMMON_SEASONINGS = new Set([
  'salt', 'pepper', 'black pepper', 'kosher salt', 'sea salt', 'white pepper',
  'water', 'ice', 'boiling water', 'cold water',
  'oil', 'olive oil', 'vegetable oil', 'canola oil', 'coconut oil', 'cooking spray', 'sesame oil', 'avocado oil',
  'butter', 'unsalted butter', 'salted butter', 'margarine', 'ghee',
  'sugar', 'brown sugar', 'granulated sugar', 'honey', 'maple syrup', 'agave',
  'flour', 'all-purpose flour', 'cornstarch', 'baking powder', 'baking soda',
  'garlic powder', 'onion powder', 'paprika', 'smoked paprika', 'cumin', 'chili powder', 'cayenne', 'red pepper flakes',
  'oregano', 'dried oregano', 'basil', 'dried basil', 'thyme', 'dried thyme', 'rosemary', 'dried rosemary', 'parsley', 'dried parsley',
  'cinnamon', 'ground cinnamon', 'nutmeg', 'ginger', 'ground ginger', 'vanilla', 'vanilla extract',
  'soy sauce', 'vinegar', 'white vinegar', 'apple cider vinegar', 'balsamic vinegar', 'rice vinegar',
  'ketchup', 'mustard', 'dijon mustard', 'mayonnaise', 'hot sauce', 'sriracha', 'lemon juice', 'lime juice'
]);

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

export const normalize = (s: string) => {
  if (!s) return '';
  let norm = s.trim().toLowerCase();
  
  // Remove descriptors that interfere with grouping
  const noise = ['large', 'small', 'medium', 'fresh', 'dried', 'frozen', 'clove', 'cloves', 'head', 'heads', 'bunch', 'bunches', 'piece', 'pieces'];
  let words = norm.split(/\s+/).filter(w => !noise.includes(w));
  
  if (words.length === 0) words = norm.split(/\s+/);

  const lastWord = words[words.length - 1];
  if (SINGULAR_TO_PLURAL[lastWord]) {
    words[words.length - 1] = SINGULAR_TO_PLURAL[lastWord];
  }
  
  return words.join(' ');
};

export const isSeasoning = (name: string) => {
  const norm = normalize(name).replace(/[^a-z\s]/g, '').trim();
  if (COMMON_SEASONINGS.has(norm)) return true;
  return Array.from(COMMON_SEASONINGS).some(s => {
    const sNorm = normalize(s);
    return norm === sNorm;
  });
};

export const checkIngredientMatch = (recipeIngName: string, userSet: Set<string>) => {
  const norm = normalize(recipeIngName);
  
  if (userSet.has(norm)) return true;

  for (const userItem of userSet) {
      if (norm.includes(userItem) || userItem.includes(norm)) return true;
  }
  return false;
};
