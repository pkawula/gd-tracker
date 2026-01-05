-- Fix mutable search path for security definer function
-- This prevents potential security issues by ensuring the function runs with a fixed search_path
ALTER FUNCTION public.seed_user_meal_windows_for_user(uuid) SET search_path = public;
