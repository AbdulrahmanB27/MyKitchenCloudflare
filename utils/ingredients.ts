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
  let norm = s.trim().toLowerCase();
  
  // Basic singularization
  if (norm.endsWith('ies')) {
      norm = norm.slice(0, -3) + 'y';
  } else if (norm.endsWith('es')) {
      // Avoid singularizing 'cheese', 'sauce', etc.
      if (!['cheese', 'sauce', 'juice', 'puree', 'paste'].some(w => norm.endsWith(w))) {
          norm = norm.slice(0, -2);
      }
  } else if (norm.endsWith('s')) {
      // Avoid singularizing 'couscous', 'hummus', 'molasses', 'bass', 'grass', 'less'
      if (!['ss', 'us', 'as', 'is'].some(suffix => norm.endsWith(suffix))) {
          norm = norm.slice(0, -1);
      }
  }
  
  return norm;
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
