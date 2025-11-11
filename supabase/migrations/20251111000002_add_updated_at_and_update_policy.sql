-- Add updated_at column to glucose_readings table
ALTER TABLE glucose_readings 
ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create trigger to automatically update updated_at on row update
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_glucose_readings_updated_at
    BEFORE UPDATE ON glucose_readings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add UPDATE policy for RLS
CREATE POLICY "Users can update own readings"
  ON glucose_readings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

