
DROP TABLE IF EXISTS recipes;
CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  name TEXT,
  category TEXT,
  is_favorite INTEGER DEFAULT 0,
  is_archived INTEGER DEFAULT 0,
  share_to_family INTEGER DEFAULT 1,
  tenant_id TEXT DEFAULT 'global',
  data TEXT,
  updated_at INTEGER,
  created_at INTEGER
);

DROP TABLE IF EXISTS shopping_list;
CREATE TABLE shopping_list (
  id TEXT PRIMARY KEY,
  data TEXT,
  updated_at INTEGER
);

DROP TABLE IF EXISTS meal_plans;
CREATE TABLE meal_plans (
  id TEXT PRIMARY KEY,
  date TEXT,
  slot TEXT,
  recipe_id TEXT,
  data TEXT,
  updated_at INTEGER
);

DROP TABLE IF EXISTS settings;
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
