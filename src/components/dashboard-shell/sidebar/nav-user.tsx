"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleUser, CreditCard, EllipsisVertical, Loader2, LogOut, RotateCcw, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { TokenAvatarRing } from "@/components/dashboard-shell/token-avatar-ring";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { submitSignOut } from "@/lib/auth/submitSignOut";
import { getInitials } from "@/lib/utils";

export function NavUser({
  user,
}: {
  readonly user: {
    readonly name: string;
    readonly email: string;
    readonly avatar: string;
  };
}) {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const [restartingOnboarding, setRestartingOnboarding] = useState(false);

  function logout() {
    submitSignOut();
  }

  async function restartOnboarding() {
    if (restartingOnboarding) return;
    setRestartingOnboarding(true);
    try {
      const response = await fetch("/api/dashboard/onboarding", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flowVersion: 2,
          completedAt: null,
          tourVersion: null,
          welcome: false,
          checklistDismissed: false,
          celebrated: false,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Onboarding konnte nicht neu gestartet werden.");
      }
      router.push("/onboarding");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Onboarding konnte nicht neu gestartet werden.");
      setRestartingOnboarding(false);
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="overflow-visible data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <TokenAvatarRing size={36}>
                <Avatar className="size-full rounded-full grayscale after:hidden">
                  <AvatarImage src={user.avatar || undefined} alt={user.name} />
                  <AvatarFallback className="rounded-full text-xs">{getInitials(user.name)}</AvatarFallback>
                </Avatar>
              </TokenAvatarRing>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-muted-foreground text-xs">{user.email}</span>
              </div>
              <EllipsisVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar || undefined} alt={user.name} />
                  <AvatarFallback className="rounded-lg">{getInitials(user.name)}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-muted-foreground text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">
                  <CircleUser className="group-hover/dropdown-menu-item:-rotate-6 group-focus/dropdown-menu-item:-rotate-6" />
                  Profil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/pricing">
                  <CreditCard className="group-hover/dropdown-menu-item:-rotate-3 group-focus/dropdown-menu-item:-rotate-3" />
                  Abonnement
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">
                  <Settings2 className="group-hover/dropdown-menu-item:rotate-45 group-focus/dropdown-menu-item:rotate-45" />
                  Einstellungen
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={restartingOnboarding}
                onSelect={(event) => {
                  event.preventDefault();
                  void restartOnboarding();
                }}
              >
                {restartingOnboarding ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RotateCcw className="group-hover/dropdown-menu-item:-rotate-45 group-focus/dropdown-menu-item:-rotate-45" />
                )}
                {restartingOnboarding ? "Onboarding wird gestartet …" : "Onboarding neu starten"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void logout()}>
              <LogOut className="group-hover/dropdown-menu-item:translate-x-0.5 group-focus/dropdown-menu-item:translate-x-0.5" />
              Abmelden
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
