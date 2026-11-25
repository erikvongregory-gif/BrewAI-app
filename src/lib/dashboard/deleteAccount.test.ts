import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  files: new Map<string, string[]>(),
  pendingJobs: [] as Row[],
  billing: null as Row | null,
  calls: [] as string[],
  deleteUserError: null as { message: string } | null,
}));

function query(table: string) {
  const filters: string[] = [];
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push(`${column}=${String(value)}`);
      return builder;
    },
    in: () => builder,
    limit: async () => ({ data: table === "generation_jobs" ? state.pendingJobs : [], error: null }),
    maybeSingle: async () => ({ data: table === "billing_subscriptions" ? state.billing : null, error: null }),
    upsert: async () => {
      state.calls.push(`upsert:${table}`);
      return { error: null };
    },
    update: () => ({
      eq: async () => {
        state.calls.push(`update:${table}`);
        return { error: null };
      },
    }),
    delete: () => ({
      eq: async (column: string, value: unknown) => {
        state.calls.push(`delete:${table}:${column}=${String(value)}`);
        return { error: null };
      },
    }),
  };
  void filters;
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => query(table),
    storage: {
      from: () => ({
        list: async (prefix: string) => ({
          data: (state.files.get(prefix) ?? []).map((name) => ({ id: `id-${name}`, name })),
          error: null,
        }),
        remove: async (paths: string[]) => {
          state.calls.push(`remove:${paths.join(",")}`);
          for (const path of paths) {
            const prefix = path.slice(0, path.lastIndexOf("/"));
            const name = path.slice(path.lastIndexOf("/") + 1);
            state.files.set(prefix, (state.files.get(prefix) ?? []).filter((file) => file !== name));
          }
          return { data: paths.map((name) => ({ name })), error: null };
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          state.calls.push(`deleteUser:${id}`);
          return { error: state.deleteUserError };
        },
      },
    },
  }),
}));

vi.mock("@/lib/billing/stripeServer", () => ({
  getStripeClient: () => {
    throw new Error("Stripe darf in diesem Test nicht aufgerufen werden.");
  },
}));

import { USER_STORAGE_FOLDERS, deleteAccount } from "./deleteAccount";

beforeEach(() => {
  state.files = new Map();
  state.pendingJobs = [];
  state.billing = null;
  state.calls = [];
  state.deleteUserError = null;
});

describe("deleteAccount", () => {
  it("covers every upload folder used by the app", () => {
    expect([...USER_STORAGE_FOLDERS].sort()).toEqual(
      ["avatars", "beer-labels", "brand-fonts", "character-meta", "character-refs", "generated", "generated-thumbs", "generation-refs"].sort(),
    );
  });

  it("removes media, thumbnails, avatars, reference photos and team rows before deleting the auth user", async () => {
    state.files.set("generated/u1", ["a.png"]);
    state.files.set("generated-thumbs/u1", ["a.webp"]);
    state.files.set("avatars/u1", ["me.png"]);
    state.files.set("character-refs/u1", ["face.jpg"]);
    state.files.set("generation-refs/u1", ["upload.jpg"]);
    state.files.set("character-meta/u1", ["characters.json"]);

    await deleteAccount("u1");

    for (const prefix of ["generated/u1", "generated-thumbs/u1", "avatars/u1", "character-refs/u1", "generation-refs/u1", "character-meta/u1"]) {
      expect(state.files.get(prefix)).toEqual([]);
    }
    expect(state.calls).toContain("delete:workspace_invites:owner_id=u1");
    expect(state.calls).toContain("delete:workspace_members:owner_id=u1");
    expect(state.calls).toContain("delete:workspace_members:user_id=u1");
    expect(state.calls).toContain("delete:integration_secrets:user_id=u1");
    expect(state.calls.at(-1)).toBe("deleteUser:u1");
  });

  it("keeps the account when jobs are still running and records the reason", async () => {
    state.pendingJobs = [{ id: "job-1" }];
    state.files.set("generated/u1", ["a.png"]);
    await expect(deleteAccount("u1")).rejects.toThrow("laufende Aufträge");
    expect(state.files.get("generated/u1")).toEqual(["a.png"]);
    expect(state.calls).not.toContain("deleteUser:u1");
    expect(state.calls).toContain("update:account_deletion_jobs");
  });

  it("reports a failed auth deletion so the job can be resumed", async () => {
    state.deleteUserError = { message: "boom" };
    await expect(deleteAccount("u1")).rejects.toThrow("Löschung kann fortgesetzt werden");
    expect(state.calls).toContain("update:account_deletion_jobs");
  });
});
