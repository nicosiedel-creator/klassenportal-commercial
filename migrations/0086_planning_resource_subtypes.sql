PRAGMA foreign_keys = ON;

ALTER TABLE planning_resources ADD COLUMN resource_subtype TEXT CHECK(resource_subtype IS NULL OR resource_subtype IN (
  'teaching_room','computer_room','exam_room','meeting_room','workshop','lab','event_space','office','storage','outdoor','equipment','vehicle','online_room','other'
));

CREATE INDEX IF NOT EXISTS idx_planning_resources_subtype
  ON planning_resources(tenant_id,status,resource_type,resource_subtype,name);
