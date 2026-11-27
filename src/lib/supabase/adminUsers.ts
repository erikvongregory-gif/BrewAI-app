import { cache } from "react";
import { createAdminClient } from "./admin";

/**
 * Auth-Nutzer per Admin-API, pro Server-Render dedupliziert (Layout-Gate, Workspace-Prüfung und Page lesen
 * denselben Inhaber). `cache()` gilt nur für den laufenden Request; in Route Handlern läuft jeder Aufruf.
 */
// @__PURE__ hält den Modul-Aufruf tree-shakebar: Client-Code, der nur Konstanten aus owner.ts importiert, zieht sonst supabase-js ins Bundle.
export const getAuthUserById = /* @__PURE__ */ cache((userId: string) => createAdminClient().auth.admin.getUserById(userId));
