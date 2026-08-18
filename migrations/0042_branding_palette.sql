ALTER TABLE tenant_settings ADD COLUMN accent_color TEXT NOT NULL DEFAULT '#7c3aed';
ALTER TABLE tenant_settings ADD COLUMN surface_color TEXT NOT NULL DEFAULT '#f3f0ea';
ALTER TABLE tenant_settings ADD COLUMN text_color TEXT NOT NULL DEFAULT '#172033';

UPDATE tenant_settings
SET background_color='#ece8df'
WHERE lower(background_color) IN ('#ffffff','#fefefe','#fafafa','#f9fafb','#f8fafc');
