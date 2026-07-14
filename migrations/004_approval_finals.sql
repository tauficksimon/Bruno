-- B4 (infrastructure-plan): capture the human's final version separately so
-- Bruno's original draft is preserved — the edit diff is the Phase C learning signal.
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS final_subject text;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS final_body text;
