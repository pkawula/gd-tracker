-- Add DELETE policy for glucose_readings
CREATE POLICY "Users can delete own readings"
  ON glucose_readings FOR DELETE
  USING ((select auth.uid()) = user_id);

