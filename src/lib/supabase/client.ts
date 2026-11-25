"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

/**
 * Kein document.cookie. Die Session liegt im HttpOnly-Cookie, das nur der Server setzt.
 * Dieser Client hält Tokens höchstens im Speicher des aktuellen Aufrufs.
 */
export function createClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    throw new Error(
      "Supabase ist nicht konfiguriert. Lege NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local an.",
    );
  }
  const jar = new Map<string, string>();
  return createBrowserClient(url, key, {
    cookies: {
      getAll() {
        return [...jar.entries()].map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
}
