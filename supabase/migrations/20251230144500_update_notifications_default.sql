-- Update default value for push_notifications_enabled to false (opt-in approach)
ALTER TABLE user_settings 
  ALTER COLUMN push_notifications_enabled SET DEFAULT false;

