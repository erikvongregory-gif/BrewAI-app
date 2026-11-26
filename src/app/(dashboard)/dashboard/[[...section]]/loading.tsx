// Je Segment statt in (dashboard): Eine Suspense-Grenze über dem Abschnitts-Layout würde den 404-Status
// von /dashboard/<unbekannt> verschlucken (Streaming startet mit 200).
export { ContentSkeleton as default } from "@/components/dashboard-shell/content-skeleton";
