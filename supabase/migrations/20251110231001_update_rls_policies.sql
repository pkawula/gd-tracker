DROP POLICY "Users can view own readings" ON public.glucose_readings;
DROP POLICY "Users can insert own readings" ON public.glucose_readings;

CREATE POLICY "Users can view own readings"
  ON glucose_readings FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own readings"
  ON glucose_readings FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);
