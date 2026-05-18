-- ============================================================
-- Adey ERP – Daily Tasks & Checklist Revamp
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Clean up old tables
DROP TABLE IF EXISTS daily_task_completions CASCADE;
DROP TABLE IF EXISTS daily_tasks CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;

-- 1. Master task definitions (created by root user)
CREATE TABLE daily_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID[] DEFAULT '{}',       -- Array of specific staff IDs
  assigned_department TEXT,              -- OR assign to whole department (e.g. 'Kitchen', 'Shop', 'Store')
  priority TEXT DEFAULT 'normal',        -- 'low', 'normal', 'high', 'urgent'
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Per-staff, per-day completion log
-- Each staff member independently completes the task for that day
CREATE TABLE daily_task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES daily_tasks(id) ON DELETE CASCADE,
  completed_by UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  completed_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,                             -- max 50 chars, enforced on client
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, completed_by, completed_date)  -- one completion per staff per task per day
);

CREATE INDEX IF NOT EXISTS idx_daily_tasks_active ON daily_tasks(is_active);
CREATE INDEX IF NOT EXISTS idx_completions_date ON daily_task_completions(completed_date);
CREATE INDEX IF NOT EXISTS idx_completions_staff ON daily_task_completions(completed_by);

-- Enable RLS
ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON daily_tasks;
CREATE POLICY "Allow all for authenticated users" ON daily_tasks
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE daily_task_completions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON daily_task_completions;
CREATE POLICY "Allow all for authenticated users" ON daily_task_completions
  FOR ALL USING (true) WITH CHECK (true);
