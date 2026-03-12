UPDATE project_statuses
SET color_hex = '#17B439'
WHERE status_key = 'done';

UPDATE project_statuses
SET color_hex = '#0375FD'
WHERE status_key = 'in_progress';

UPDATE project_statuses
SET color_hex = '#E99C0C'
WHERE status_key = 'rework_needed';
