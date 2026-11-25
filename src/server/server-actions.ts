"use server";

import { cookies } from "next/headers";

import {
  getPreferencePersistence,
  PREFERENCE_REGISTRY,
  type PreferenceKey,
  type PreferenceValueMap,
  parsePreference,
} from "@/lib/preferences/preferences-config";

const MAX_PREFERENCE_COOKIE_AGE = 60 * 60 * 24 * 365;

/**
 * Server Actions sind öffentlich aufrufbare POST-Endpunkte. Ohne Einschränkung könnte
 * Client-JavaScript darüber HttpOnly-Cookies (Supabase-Session, 2FA-Cookies) lesen oder
 * überschreiben. Deshalb nur die registrierten Darstellungs-Einstellungen.
 */
function isPreferenceCookieKey(key: unknown): key is PreferenceKey {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(PREFERENCE_REGISTRY, key);
}

export async function getValueFromCookie(key: string): Promise<string | undefined> {
  if (!isPreferenceCookieKey(key)) return undefined;
  const cookieStore = await cookies();
  return cookieStore.get(key)?.value;
}

export async function setValueToCookie(
  key: string,
  value: string,
  options: { path?: string; maxAge?: number } = {},
): Promise<void> {
  if (!isPreferenceCookieKey(key)) {
    throw new Error("Unbekannte Einstellung.");
  }
  const cookieStore = await cookies();
  const requestedAge = Number(options?.maxAge);
  cookieStore.set(key, parsePreference(key, typeof value === "string" ? value.trim() : undefined), {
    path: "/",
    sameSite: "lax",
    maxAge:
      Number.isFinite(requestedAge) && requestedAge > 0
        ? Math.min(requestedAge, MAX_PREFERENCE_COOKIE_AGE)
        : 60 * 60 * 24 * 7, // default: 7 days
  });
}

export async function getPreference<K extends PreferenceKey>(key: K): Promise<PreferenceValueMap[K]> {
  const definition = PREFERENCE_REGISTRY[key];
  const persistence = getPreferencePersistence(key);

  if (persistence !== "client-cookie" && persistence !== "server-cookie") {
    return definition.defaultValue as PreferenceValueMap[K];
  }

  const cookieStore = await cookies();
  return parsePreference(key, cookieStore.get(key)?.value.trim());
}
