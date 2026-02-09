

import { Recipe } from './types';

export const config = {
  pinnedTags: ["Dinner", "Healthy", "Quick"],
  sampleRecipes: [
    {
      "id": "lib-1",
      "name": "Spaghetti Carbonara",
      "description": "A classic Roman pasta dish made with eggs, hard cheese, cured pork, and black pepper. No cream!",
      "category": "Entrees",
      "tags": ["Italian", "Pasta", "Quick", "Comfort Food"],
      "prepTime": 10,
      "cookTime": 15,
      "servings": 4,
      "image": "https://images.unsplash.com/photo-1612874742237-6526221588e3?auto=format&fit=crop&w=800&q=80",
      "ingredients": [
        { "id": "1", "amount": 400, "unit": "g", "item": "Spaghetti" },
        { "id": "2", "amount": 150, "unit": "g", "item": "Guanciale", "notes": "or Pancetta, cubed", "substitution": "Bacon" },
        { "id": "3", "amount": 4, "unit": "large", "item": "Eggs" },
        { "id": "4", "amount": 100, "unit": "g", "item": "Pecorino Romano", "notes": "grated", "substitution": "Parmesan" },
        { "id": "5", "amount": 1, "unit": "tbsp", "item": "Black Pepper", "notes": "freshly cracked" }
      ],
      "instructions": [
        { "id": "1", "text": "Boil water for pasta. Salt heavily.", "tip": "Use the pasta water! The starch is crucial for the emulsion." },
        { "id": "2", "title": "Crisp the Pork", "text": "Cook guanciale in a skillet over medium heat until crispy (approx 5-8 mins). Remove from heat but keep fat.", "timer": 8 },
        { "id": "3", "title": "Prepare Sauce Base", "text": "Whisk eggs and cheese in a bowl until a paste forms. Add plenty of pepper." },
        { "id": "4", "text": "Cook pasta until al dente. Reserve 1 cup of pasta water." },
        { "id": "5", "text": "Add hot pasta to the guanciale pan (heat OFF). Toss to coat in fat.", "tip": "Do not add eggs while the pan is on high heat, or you will make scrambled eggs." },
        { "id": "6", "title": "Emulsify", "text": "Pour egg mixture over pasta while tossing vigorously to emulsify. Add pasta water as needed for creaminess." }
      ],
      "components": [],
      "video": {
        "url": "https://www.youtube.com/embed/3AAdKl1UYZs",
        "note": "Watch the tossing technique at 3:00"
      },
      "storageNotes": "Best eaten fresh. Reheat gently with a splash of water, do not microwave.",
      "nutrition": { "calories": 650, "protein": 25, "carbs": 70, "fat": 30 },
      "favorite": false,
      "reviews": [],
      "archived": false,
      "createdAt": 1700000000000,
      "updatedAt": 1700000000000
    },
    {
      "id": "lib-2",
      "name": "Meal Prep Chicken Burrito Bowls",
      "description": "Healthy, customizable lunch bowls that keep well in the fridge.",
      "category": "Entrees",
      "tags": ["Meal Prep", "Lunch", "High Protein", "Gluten Free"],
      "prepTime": 20,
      "cookTime": 25,
      "servings": 5,
      "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80",
      "ingredients": [
        { "id": "1", "amount": 1.5, "unit": "lbs", "item": "Chicken Breast" },
        { "id": "2", "amount": 2, "unit": "cups", "item": "Rice", "notes": "uncooked", "substitution": "Quinoa or Cauliflower Rice" },
        { "id": "3", "amount": 1, "unit": "can", "item": "Black Beans", "notes": "drained" },
        { "id": "4", "amount": 1, "unit": "can", "item": "Corn", "notes": "drained" },
        { "id": "5", "amount": 1, "unit": "head", "item": "Romaine Lettuce", "notes": "chopped" }
      ],
      "instructions": [
        { "id": "1", "text": "Cook rice according to package instructions." },
        { "id": "2", "text": "Marinate chicken with the spice blend." },
        { "id": "3", "title": "Cook Chicken", "text": "Grill or pan-fry chicken until 165°F internal temp.", "timer": 12 },
        { "id": "4", "text": "Assemble bowls: Rice base, topped with chicken, beans, and corn.", "tip": "Wait for rice to cool before packing to avoid condensation." },
        { "id": "5", "text": "Keep lettuce separate until eating." }
      ],
      "components": [
        {
          "label": "Spice Blend",
          "ingredients": [
             { "id": "s1", "amount": 1, "unit": "tbsp", "item": "Chili Powder" },
             { "id": "s2", "amount": 1, "unit": "tsp", "item": "Cumin" },
             { "id": "s3", "amount": 1, "unit": "tsp", "item": "Garlic Powder" },
             { "id": "s4", "amount": 1, "unit": "tsp", "item": "Salt" }
          ],
          "instructions": [{ "id": "s1", "text": "Mix all spices together in a small jar." }]
        },
        {
          "label": "Cilantro Lime Dressing",
          "ingredients": [
             { "id": "d1", "amount": 1, "unit": "bunch", "item": "Cilantro" },
             { "id": "d2", "amount": 0.25, "unit": "cup", "item": "Olive Oil" },
             { "id": "d3", "amount": 2, "unit": "", "item": "Limes", "notes": "juiced" },
             { "id": "d4", "amount": 1, "unit": "clove", "item": "Garlic" }
          ],
          "instructions": [{ "id": "d1", "text": "Blend all ingredients until smooth." }]
        }
      ],
      "storageNotes": "Keeps in fridge for 4-5 days. Freezes well (without lettuce).",
      "favorite": true,
      "reviews": [
          { "id": "r1", "rating": 10, "date": 1700000000000 }
      ],
      "archived": false,
      "createdAt": 1700000000000,
      "updatedAt": 1700000000000
    }
  ] as any[]
};
