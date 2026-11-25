import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/billing/stripeServer";

/**
 * Every storage folder that holds files under `<folder>/<userId>/…` (see uploadToStorage callers,
 * character-store and brand fonts). Keep in sync when a new upload folder is introduced.
 */
export const USER_STORAGE_FOLDERS = [
  "generated",
  "generated-thumbs",
  "beer-labels",
  "brand-fonts",
  "avatars",
  "character-refs",
  "generation-refs",
  "character-meta",
] as const;

/** Rows that reference the account but are not guaranteed to cascade (workspace + integrations). */
const USER_LINKED_ROWS = [
  ["workspace_invites", "owner_id"],
  ["workspace_members", "owner_id"],
  ["workspace_members", "user_id"],
  ["integration_secrets", "user_id"],
] as const;

type StorageBucket = ReturnType<ReturnType<typeof createAdminClient>["storage"]["from"]>;

async function removeStoragePrefix(bucket: StorageBucket, prefix: string, depth = 0): Promise<void> {
  if (depth > 3) throw new Error("Mediendateien konnten nicht vollständig gelöscht werden.");
  for (let page = 0; page < 1000; page += 1) {
    const listing = await bucket.list(prefix, { limit: 100 });
    if (listing.error) throw new Error("Mediendateien konnten nicht aufgelistet werden.");
    const entries = listing.data ?? [];
    if (!entries.length) return;
    const files = entries.filter((item) => item.id !== null).map((item) => `${prefix}/${item.name}`);
    const folders = entries.filter((item) => item.id === null).map((item) => `${prefix}/${item.name}`);
    for (const folder of folders) await removeStoragePrefix(bucket, folder, depth + 1);
    if (files.length) {
      const removed = await bucket.remove(files);
      if (removed.error) throw new Error("Mediendateien konnten nicht gelöscht werden.");
      if (!removed.data?.length) throw new Error("Mediendateien konnten nicht gelöscht werden.");
    } else if (!folders.length) {
      return;
    }
  }
  throw new Error("Mediendateien konnten nicht vollständig gelöscht werden.");
}

/** Re-entrant: leave Auth and billing intact until all external cleanup succeeds. */
export async function deleteAccount(userId: string) {
  const admin = createAdminClient();
  const billing = await admin.from("billing_subscriptions").select("stripe_subscription_id,stripe_customer_id").eq("user_id",userId).maybeSingle();
  if(billing.error)throw new Error("Abrechnung konnte nicht geprüft werden.");
  const begin = await admin.from("account_deletion_jobs").upsert({user_id:userId},{onConflict:"user_id",ignoreDuplicates:true});
  if(begin.error)throw new Error("Löschauftrag konnte nicht gespeichert werden.");
  try {
    const pending=await admin.from("generation_jobs").select("id").eq("user_id",userId).in("status",["reserved","needs_review"]).limit(1);
    if(pending.error)throw new Error("Aufträge konnten nicht geprüft werden.");
    if(pending.data?.length)throw new Error("Bitte laufende Aufträge abschließen lassen. Der Löschauftrag bleibt gespeichert.");
    if(billing.data?.stripe_customer_id || billing.data?.stripe_subscription_id) {
      const stripe=getStripeClient(); // Missing configuration is an error, never silently skip cancellation.
      if(billing.data.stripe_customer_id) {
        for await(const subscription of stripe.subscriptions.list({customer:billing.data.stripe_customer_id,status:"all",limit:100}))
          if(!["canceled","incomplete_expired"].includes(subscription.status))await stripe.subscriptions.cancel(subscription.id);
      } else if(billing.data.stripe_subscription_id) {
        const subscription=await stripe.subscriptions.retrieve(billing.data.stripe_subscription_id);
        if(!["canceled","incomplete_expired"].includes(subscription.status))await stripe.subscriptions.cancel(subscription.id);
      }
    }
    const bucket=admin.storage.from(process.env.SUPABASE_GENERATED_IMAGES_BUCKET?.trim()||"generated-images");
    for(const folder of USER_STORAGE_FOLDERS) await removeStoragePrefix(bucket,`${folder}/${userId}`);
    const legacy=await bucket.remove([`media-library/${userId}.json`]);
    if(legacy.error)throw new Error("Alter Medienindex konnte nicht gelöscht werden.");
    // Team data also names third parties (invitee e-mails); remove it explicitly instead of relying on FK cascades.
    for(const [table,column] of USER_LINKED_ROWS) {
      const removed=await admin.from(table).delete().eq(column,userId);
      if(removed.error)throw new Error("Team- und Verbindungsdaten konnten nicht gelöscht werden.");
    }
    // Database-owned personal resources cascade; Stripe invoices remain in Stripe for retention.
    const deleted=await admin.auth.admin.deleteUser(userId);
    if(deleted.error)throw new Error("Konto konnte nicht gelöscht werden. Löschung kann fortgesetzt werden.");
  } catch(error) {
    await admin.from("account_deletion_jobs").update({last_error:error instanceof Error?error.message:"Löschung fehlgeschlagen"}).eq("user_id",userId);
    throw error;
  }
}
