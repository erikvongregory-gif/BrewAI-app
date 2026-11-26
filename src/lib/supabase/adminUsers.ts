import { cache } from "react";
import { createAdminClient } from "./admin";

/**
 * Auth-Nutzer per Admin-API, pro Server-Render dedupliziert (Layout-Gate, Workspace-Prüfung und Page lesen
 * denselben Inhaber). `cache()` gilt nur für den laufenden Request; in Route Handlern läuft jeder Aufruf.
 */
export const getAuthUserById = cache((userId: string) => createAdminClient().auth.admin.getUserById(userId));
