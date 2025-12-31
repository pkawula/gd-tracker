/**
 * Shared database utilities for Edge Functions
 * Provides type-safe Supabase client initialization
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface Database {
  public: {
    Tables: {
      glucose_readings: {
        Row: {
          id: string;
          user_id: string;
          measured_at: string;
          measurement_type: 'fasting' | '1hr_after_meal';
          value: number;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      user_settings: {
        Row: {
          user_id: string;
          push_notifications_enabled: boolean;
          language: 'en' | 'pl';
          created_at: string;
          updated_at: string;
        };
      };
      notification_schedules: {
        Row: {
          id: string;
          user_id: string;
          measurement_type: 'fasting' | '1hr_after_meal';
          scheduled_at: string;
          status: 'scheduled' | 'sent' | 'cancelled' | 'failed';
          onesignal_notification_id: string | null;
          decision_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          measurement_type: 'fasting' | '1hr_after_meal';
          scheduled_at: string;
          status?: 'scheduled' | 'sent' | 'cancelled' | 'failed';
          onesignal_notification_id?: string | null;
          decision_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: 'scheduled' | 'sent' | 'cancelled' | 'failed';
          onesignal_notification_id?: string | null;
          decision_reason?: string | null;
          updated_at?: string;
        };
      };
      notification_schedule_runs: {
        Row: {
          id: string;
          run_week_start_date: string;
          started_at: string;
          finished_at: string | null;
          status: 'running' | 'completed' | 'failed';
          error: string | null;
          users_processed: number | null;
          schedules_created: number | null;
        };
        Insert: {
          id?: string;
          run_week_start_date: string;
          started_at?: string;
          finished_at?: string | null;
          status?: 'running' | 'completed' | 'failed';
          error?: string | null;
          users_processed?: number | null;
          schedules_created?: number | null;
        };
        Update: {
          finished_at?: string | null;
          status?: 'running' | 'completed' | 'failed';
          error?: string | null;
          users_processed?: number | null;
          schedules_created?: number | null;
        };
      };
    };
  };
}

/**
 * Create a Supabase client with service role privileges
 * Required for Edge Functions to bypass RLS and write to notification tables
 */
export function createServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Decode base64 string safely
 */
function tryDecodeBase64(str: string): string {
  try {
    const decoded = atob(str);
    // Verify decoded string is valid (printable ASCII or valid UTF-8)
    if (decoded && decoded.length > 0) {
      return decoded;
    }
  } catch {
    // Not valid base64 or decoding failed
  }
  return str;
}

/**
 * Validate that request includes correct authorization secret
 * Prevents unauthorized access to Edge Functions from pg_cron
 * 
 * Note: Automatically handles base64-encoded secrets in environment variables
 */
export function validateCronSecret(request: Request): boolean {
  const rawSecret = Deno.env.get('CRON_EDGE_FUNCTION_SECRET');
  
  if (!rawSecret) {
    throw new Error('CRON_EDGE_FUNCTION_SECRET not configured');
  }

  // Decode if the secret is base64 encoded
  // Supabase may store secrets encoded in some environments
  const expectedSecret = tryDecodeBase64(rawSecret);

  // Check custom header first (used by pg_cron)
  const cronHeader = request.headers.get('x-cron-secret');
  if (cronHeader) {
    return cronHeader === expectedSecret;
  }

  // Fallback to Authorization header for manual testing
  const authHeader = request.headers.get('authorization');
  const providedSecret = authHeader?.replace('Bearer ', '');

  return providedSecret === expectedSecret;
}

