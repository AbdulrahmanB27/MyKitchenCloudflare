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

export const normalize = (s: string) => {
  if (!s) return '';
  let norm = s.trim().toLowerCase();
  
  // Remove descriptors that interfere with grouping
  const noise = ['large', 'small', 'medium', 'fresh', 'dried', 'frozen', 'clove', 'cloves', 'head', 'heads', 'bunch', 'bunches', 'piece', 'pieces'];
  const words = norm.split(/\s+/).filter(w => !noise.includes(w));
  norm = words.join(' ');

  if (!norm) return '';

  const exceptions = new Set([
     "hummus", "couscous", "molasses", "asparagus", "chorizo", "salt", "pepper", "water", "sugar", "flour", "milk", "butter", "oil", "rice"
  ]);

  if (exceptions.has(norm)) return norm;

  // Simple pluralization logic
  if (norm.endsWith('ies') || norm.endsWith('ves') || norm.endsWith('oes')) {
    // Likely already plural
  } else if (norm.endsWith('s') && !['ss', 'us', 'is', 'as'].some(suffix => norm.endsWith(suffix))) {
    // Likely already plural
  } else if (norm.endsWith('y')) {
    // berry -> berries
    const vowels = ['a', 'e', 'i', 'o', 'u'];
    if (norm.length > 1 && !vowels.includes(norm[norm.length - 2])) {
      norm = norm.slice(0, -1) + 'ies';
    } else {
      norm = norm + 's';
    }
  } else if (norm.endsWith('f')) {
    // leaf -> leaves
    norm = norm.slice(0, -1) + 'ves';
  } else if (norm.endsWith('fe')) {
    // knife -> knives
    norm = norm.slice(0, -2) + 'ves';
  } else if (['x', 'z', 'ch', 'sh'].some(suffix => norm.endsWith(suffix))) {
    norm = norm + 'es';
  } else {
    norm = norm + 's';
  }
  
  return norm.trim();
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
