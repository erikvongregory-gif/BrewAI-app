"use client";

import { DashboardTabLink } from "@/components/dashboard-shell/dashboard-tab-nav";

import { Folder } from "@/components/ui/folder";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AssetsFolderButtonProps = {
  className?: string;
  href?: string;
};

/** Header-Button: animierter Folder → Mediathek / Assets. */
export function AssetsFolderButton({
  className,
  href = "/dashboard/media",
}: AssetsFolderButtonProps) {
  return (
    <Button
      asChild
      size="icon"
      variant="outline"
      className={cn("overflow-visible", className)}
      aria-label="Mediathek / Assets öffnen"
    >
      <DashboardTabLink href={href} title="Mediathek" className="group">
        <Folder size="sm" showHint={false} />
        <span className="sr-only">Mediathek</span>
      </DashboardTabLink>
    </Button>
  );
}
