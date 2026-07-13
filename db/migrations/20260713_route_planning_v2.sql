-- Route planning v2: scheduler parity columns on sites.
-- date_locked: only explicitly locked sites keep their scheduled_start during
--   schedule generation (previously any site with a date was treated as locked).
-- estimated_hours: per-site onsite hours for day-packing (null = 8.0 default).
-- nights_required: multi-night stops span consecutive work days.
-- display_order: user-defined ordering; seeds nearest-neighbor route order.

ALTER TABLE sites ADD COLUMN IF NOT EXISTS date_locked boolean NOT NULL DEFAULT false;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS estimated_hours numeric(5,1);
ALTER TABLE sites ADD COLUMN IF NOT EXISTS nights_required int NOT NULL DEFAULT 1;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS display_order int;
