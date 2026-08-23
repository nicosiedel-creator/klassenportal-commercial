-- Read-path indexes for the participant portal. These do not change data semantics;
-- they only avoid full tenant/course scans on the overview request.
CREATE INDEX IF NOT EXISTS idx_homework_portal_due
ON homework(tenant_id,course_id,due_at);

CREATE INDEX IF NOT EXISTS idx_appointments_portal_time
ON appointments(tenant_id,course_id,starts_at);

CREATE INDEX IF NOT EXISTS idx_announcements_portal_visible_time
ON announcements(tenant_id,course_id,visible,published_at DESC);

CREATE INDEX IF NOT EXISTS idx_links_portal_title
ON links(tenant_id,course_id,title);

CREATE INDEX IF NOT EXISTS idx_lessons_portal_end_start
ON lessons(tenant_id,course_id,ends_at,starts_at);

CREATE INDEX IF NOT EXISTS idx_notifications_portal_user_course_time
ON notifications(tenant_id,user_id,course_id,created_at DESC);
