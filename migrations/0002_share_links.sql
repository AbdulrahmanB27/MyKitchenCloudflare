-- Migration number: 0002 	 2024-05-22T00:00:00.000Z
CREATE TABLE IF NOT EXISTS recipe_share_links (
    token TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    recipe_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_share_links_family_recipe ON recipe_share_links(family_id, recipe_id);
