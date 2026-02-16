
DROP TABLE IF EXISTS recipes;
CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  family_id TEXT,
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
  family_id TEXT,
  data TEXT,
  updated_at INTEGER
);

DROP TABLE IF EXISTS meal_plans;
CREATE TABLE meal_plans (
  id TEXT PRIMARY KEY,
  family_id TEXT,
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

-- RESTAURANT MODULE TABLES --

DROP TABLE IF EXISTS restaurants;
CREATE TABLE restaurants (
  id TEXT PRIMARY KEY,
  family_id TEXT,
  name TEXT,
  cuisine_tags TEXT,
  stars INTEGER DEFAULT 0,
  price TEXT,
  notes TEXT,
  go_to_order TEXT,
  last_visited_at INTEGER,
  data TEXT,
  updated_at INTEGER,
  created_at INTEGER
);

DROP TABLE IF EXISTS vote_sessions_v2;
CREATE TABLE vote_sessions_v2 (
  id TEXT PRIMARY KEY,
  access_code TEXT,
  data TEXT,
  created_at INTEGER,
  ended_at INTEGER,
  active INTEGER DEFAULT 1
);

DROP TABLE IF EXISTS votes_v2;
CREATE TABLE votes_v2 (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  restaurant_id TEXT,
  device_id TEXT,
  vote_value INTEGER,
  created_at INTEGER
);

-- AUTH TABLES --

DROP TABLE IF EXISTS families;
CREATE TABLE families (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE,
  password_hash TEXT,
  admin_password_hash TEXT,
  salt TEXT,
  created_at INTEGER
);

DROP TABLE IF EXISTS device_tokens;
CREATE TABLE device_tokens (
  token TEXT PRIMARY KEY,
  family_id TEXT,
  created_at INTEGER,
  last_used_at INTEGER
);
