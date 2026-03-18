import { createClient } from '@supabase/supabase-js';
import { appConfig } from './config';

export function getBrowserSupabaseClient() {
  if (!appConfig.supabaseUrl || !appConfig.supabaseAnonKey) return null;
  return createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey);
}
