-- Table: glucose_readings
CREATE TABLE glucose_readings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  glucose_value INTEGER NOT NULL,
  measurement_type TEXT NOT NULL CHECK (measurement_type IN ('fasting', '1hr_after_meal')),
  measured_at TIMESTAMPTZ NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX idx_glucose_readings_user_measured
  ON glucose_readings(user_id, measured_at DESC);

-- Row Level Security
ALTER TABLE glucose_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own readings"
  ON glucose_readings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own readings"
  ON glucose_readings FOR INSERT
  WITH CHECK (auth.uid() = user_id);
