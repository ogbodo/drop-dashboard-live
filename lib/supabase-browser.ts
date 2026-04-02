import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let browserClient: SupabaseClient | null = null;

export const getSupabaseBrowserClient = () => {
  if (browserClient) {
    return browserClient;
  }

  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    return null;
  }

  browserClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });

  return browserClient;
};
