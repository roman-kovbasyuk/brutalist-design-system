UPDATE generation_jobs
SET budget_day = (created_at AT TIME ZONE 'UTC')::date
WHERE budget_day IS DISTINCT FROM (created_at AT TIME ZONE 'UTC')::date;
