-- =====================================================================
-- Migration: Add language preference to user_settings
-- Purpose: Store user's language choice for localized push notifications
-- Created: 2025-12-31
-- =====================================================================

-- Add language column with default 'en'
alter table public.user_settings 
  add column if not exists language text not null default 'en'
  check (language in ('en', 'pl'));

-- Add index for potential analytics queries
create index if not exists user_settings_language_idx 
  on public.user_settings(language);

-- Add comment for documentation
comment on column public.user_settings.language is 
  'User''s preferred language for UI and push notifications. Used to send localized reminder messages.';

