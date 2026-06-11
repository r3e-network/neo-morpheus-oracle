import { createClient } from '@supabase/supabase-js';
import { publicConfig } from './public-config';

export function getBrowserSupabaseClient() {
  if (!publicConfig.supabaseUrl || !publicConfig.supabaseAnonKey) return null;
  return createClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey);
}
