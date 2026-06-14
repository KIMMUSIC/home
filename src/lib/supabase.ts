import { createBrowserClient } from "@supabase/ssr";

export function getSupabaseBrowserConfigStatus() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = publishableKey || anonKey;

  return {
    ready: Boolean(url && key),
    url,
    key,
    keyName: publishableKey ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" : "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  };
}

export function createSupabaseBrowserClient() {
  const config = getSupabaseBrowserConfigStatus();

  if (!config.url || !config.key) return null;
  return createBrowserClient(config.url, config.key);
}
