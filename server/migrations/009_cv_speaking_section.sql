-- CV Studio: speaking engagements get their own section ("Resource Speakership and Invited Talks").
-- Existing CVs receive it hidden and empty, right after Professional Development, so nothing already in them moves,
-- disappears or is duplicated; new talks can be added to it from the CV editor.
INSERT INTO cv_sections (cv_profile_id, section_key, heading, sort_order, visible, is_custom, settings_json)
SELECT p.id, 'speaking', 'Resource Speakership and Invited Talks',
       COALESCE((SELECT d.sort_order FROM cv_sections d WHERE d.cv_profile_id = p.id AND d.section_key = 'development'), 999),
       0, 0, '{"sort":"auto","page_break_before":false}'
FROM cv_profiles p
WHERE NOT EXISTS (SELECT 1 FROM cv_sections s WHERE s.cv_profile_id = p.id AND s.section_key = 'speaking');
