"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BadgeCheck, Compass, CreditCard, LogOut, Settings2 } from "lucide-react";

import { startDashboardTour } from "@/components/dashboard-shell/dashboard-product-tour";

import { TokenAvatarRing, TokenBalanceMenuBlock } from "@/components/dashboard-shell/token-avatar-ring";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, getInitials } from "@/lib/utils";

export function AccountSwitcher({
  users,
  onLogout,
}: {
  readonly users: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly avatar: string;
    readonly role: string;
  }>;
  readonly onLogout?: () => void;
}) {
  const [activeUser, setActiveUser] = useState(users[0]);

  useEffect(() => {
    const next = users.find((user) => user.id === activeUser?.id) ?? users[0];
    if (next) setActiveUser(next);
  }, [users, activeUser?.id]);

  if (!activeUser) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          id="tour-avatar"
          type="button"
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <TokenAvatarRing size={36}>
            <Avatar className="size-full rounded-full after:hidden">
              <AvatarImage src={activeUser.avatar || undefined} alt={activeUser.name} />
              <AvatarFallback className="rounded-full text-xs">{getInitials(activeUser.name)}</AvatarFallback>
            </Avatar>
          </TokenAvatarRing>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56 space-y-1 rounded-lg" side="bottom" align="end" sideOffset={4}>
        {users.map((user) => (
          <DropdownMenuItem
            key={user.email || user.id}
            className={cn("p-0", user.id === activeUser.id && "bg-accent/50")}
            aria-current={user.id === activeUser.id ? "true" : undefined}
            onClick={() => setActiveUser(user)}
          >
            <div className="flex w-full items-center gap-2 px-1 py-1.5">
              <Avatar className="size-9 rounded-lg">
                <AvatarImage src={user.avatar || undefined} alt={user.name} />
                <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{user.name}</span>
                <span className="truncate text-xs capitalize">{user.role}</span>
              </div>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <TokenBalanceMenuBlock />
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/dashboard/settings">
              <BadgeCheck className="group-hover/dropdown-menu-item:-rotate-6 group-focus/dropdown-menu-item:-rotate-6" />
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
          <DropdownMenuItem onClick={() => startDashboardTour()}>
            <Compass className="group-hover/dropdown-menu-item:rotate-45 group-focus/dropdown-menu-item:rotate-45" />
            Rundgang starten
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout}>
          <LogOut className="group-hover/dropdown-menu-item:translate-x-0.5 group-focus/dropdown-menu-item:translate-x-0.5" />
          Abmelden
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
