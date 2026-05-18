-- ============================================================
-- Adey ERP – Tasks, Checklists & Weekly Reviews Migration
-- Run this in the Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. DAILY TASKS / CHECKLISTS
-- ============================================================

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES staff(id) ON DELETE SET NULL,
  assigned_by TEXT,                           -- name of assigner (root user)
  due_date DATE DEFAULT CURRENT_DATE,
  priority TEXT DEFAULT 'normal',            -- 'low', 'normal', 'high', 'urgent'
  status TEXT DEFAULT 'pending',             -- 'pending', 'in_progress', 'completed', 'cancelled'
  completed_at TIMESTAMPTZ,
  completion_notes TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_pattern TEXT,                   -- 'daily', 'weekly', 'monthly'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

-- Enable RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON tasks
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 2. WEEKLY REVIEWS
-- ============================================================

CREATE TABLE IF NOT EXISTS weekly_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,                       -- e.g. "Weekly Team Performance Review"
  description TEXT,
  questions JSONB NOT NULL DEFAULT '[]',     -- Array of { id, question, type: 'paragraph'|'short' }
  fill_day TEXT DEFAULT 'MONDAY',            -- Day of the week to fill
  is_active BOOLEAN DEFAULT TRUE,
  assigned_department TEXT,                  -- NULL = all, or specific department
  created_by TEXT,
  notify_days_before INT DEFAULT 3,          -- Notify X days before due
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weekly_review_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES weekly_reviews(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  staff_name TEXT,
  week_start DATE NOT NULL,                  -- Monday of the week this response is for
  answers JSONB NOT NULL DEFAULT '{}',       -- { question_id: "answer text" }
  status TEXT DEFAULT 'draft',               -- 'draft', 'submitted'
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(review_id, staff_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_reviews_active ON weekly_reviews(is_active);
CREATE INDEX IF NOT EXISTS idx_weekly_review_responses_review ON weekly_review_responses(review_id);
CREATE INDEX IF NOT EXISTS idx_weekly_review_responses_staff ON weekly_review_responses(staff_id);
CREATE INDEX IF NOT EXISTS idx_weekly_review_responses_week ON weekly_review_responses(week_start);

-- Enable RLS
ALTER TABLE weekly_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON weekly_reviews;
CREATE POLICY "Allow all for authenticated users" ON weekly_reviews
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE weekly_review_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON weekly_review_responses;
CREATE POLICY "Allow all for authenticated users" ON weekly_review_responses
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 3. TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at 
  BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_weekly_reviews_updated_at ON weekly_reviews;
CREATE TRIGGER trg_weekly_reviews_updated_at 
  BEFORE UPDATE ON weekly_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_weekly_review_responses_updated_at ON weekly_review_responses;
CREATE TRIGGER trg_weekly_review_responses_updated_at 
  BEFORE UPDATE ON weekly_review_responses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
