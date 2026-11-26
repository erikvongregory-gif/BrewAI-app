"use client";

import Link from "next/link";
import { DashboardTabLink } from "@/components/dashboard-shell/dashboard-tab-nav";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { ChevronRight, PlusCircleIcon } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type {
  NavBadge,
  NavGroup,
  NavMainItem,
  NavMainLinkItem,
  NavMainParentItem,
} from "@/navigation/sidebar/sidebar-items";

interface NavMainProps {
  readonly items: readonly NavGroup[];
}
interface NavItemProps {
  readonly item: NavMainItem;
  readonly isItemActive: (item: NavMainItem) => boolean;
  readonly isSubItemActive: (url: string) => boolean;
  readonly isSubmenuOpen: (item: NavMainParentItem) => boolean;
  readonly mediaUnseen: number;
}

interface NavLinkItemProps {
  readonly item: NavMainLinkItem;
  readonly isActive: boolean;
  readonly showIconFallback: boolean;
  /** Neue, noch nicht angesehene Motive (nur Mediathek). */
  readonly unseen?: number;
}

interface NavLinkIconProps {
  readonly item: NavMainLinkItem;
  readonly showFallback: boolean;
}

interface NavDropdownItemProps {
  readonly item: NavMainParentItem;
  readonly isActive: boolean;
  readonly isSubItemActive: (url: string) => boolean;
}

interface NavCollapsibleItemProps {
  readonly item: NavMainParentItem;
  readonly isActive: boolean;
  readonly defaultOpen: boolean;
  readonly isSubItemActive: (url: string) => boolean;
}

function CollapsedIconFallback({ title }: { title: string }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center rounded-xs font-medium text-[10px] outline">
      {title.slice(0, 1)}
    </span>
  );
}

function hasSubItems(item: NavMainItem): item is NavMainParentItem {
  return Boolean(item.subItems?.length);
}

export function NavMain({ items }: NavMainProps) {
  const path = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  const closeMobileNav = () => {
    if (isMobile) setOpenMobile(false);
  };

  const mediaUnseen = useMediaUnseen(path);

  const isItemActive = (item: NavMainItem) => {
    if (hasSubItems(item)) {
      return item.subItems.some((sub) => path.startsWith(sub.url));
    }

    return path === item.url;
  };

  const isSubItemActive = (url: string) => {
    return path === url;
  };

  const isSubmenuOpen = (item: NavMainParentItem) => {
    return item.subItems.some((sub) => path.startsWith(sub.url));
  };

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent className="flex flex-col gap-2">
          <SidebarMenu>
            <SidebarMenuItem className="flex items-center gap-2">
              <SidebarMenuButton
                asChild
                tooltip="Neu erstellen"
                className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
              >
                <Link
                  id="tour-create"
                  href="/inhalte-erstellen"
                  onClick={closeMobileNav}
                >
                  <PlusCircleIcon className="group-hover/menu-button:rotate-90 group-hover/menu-button:scale-110 motion-reduce:group-hover/menu-button:rotate-0 motion-reduce:group-hover/menu-button:scale-100" />
                  <span>Neu erstellen</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {items.map((group) => (
        <SidebarGroup key={group.id}>
          {group.label && (
            <SidebarGroupLabel className="group-data-[collapsible=icon]:pointer-events-none">
              {group.label}
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <NavItem
                  key={item.id}
                  item={item}
                  isItemActive={isItemActive}
                  isSubItemActive={isSubItemActive}
                  isSubmenuOpen={isSubmenuOpen}
                  mediaUnseen={mediaUnseen}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

function NavItem({ item, isItemActive, isSubItemActive, isSubmenuOpen, mediaUnseen }: NavItemProps) {
  const { state, isMobile } = useSidebar();
  const isCollapsedDesktop = state === "collapsed" && !isMobile;

  if (!hasSubItems(item)) {
    return (
      <NavLinkItem
        item={item}
        isActive={isItemActive(item)}
        showIconFallback={isCollapsedDesktop}
        unseen={item.id === "media" ? mediaUnseen : 0}
      />
    );
  }

  if (isCollapsedDesktop) {
    return <NavDropdownItem item={item} isActive={isItemActive(item)} isSubItemActive={isSubItemActive} />;
  }

  return (
    <NavCollapsibleItem
      item={item}
      isActive={isItemActive(item)}
      defaultOpen={isSubmenuOpen(item)}
      isSubItemActive={isSubItemActive}
    />
  );
}

/** Aktiver Eintrag: eine gemeinsame Fläche gleitet zwischen den Nav-Punkten. */
const NAV_PILL_SPRING = { type: "spring", stiffness: 520, damping: 40, mass: 0.8 } as const;
const NAV_BUTTON_OVER_PILL = "relative z-[1] data-active:bg-transparent";

function NavActivePill({ className }: { className?: string }) {
  return (
    <motion.span
      aria-hidden
      layoutId="sidebar-nav-active"
      transition={NAV_PILL_SPRING}
      className={cn("pointer-events-none absolute inset-0 z-0 rounded-md bg-sidebar-accent", className)}
    />
  );
}

const MEDIA_PATH = "/dashboard/media";

/** Zählt fertige Motive aus „Bild erstellen“, bis man die Mediathek öffnet. */
function useMediaUnseen(path: string) {
  const [unseen, setUnseen] = useState(0);
  const onMedia = path.startsWith(MEDIA_PATH);

  useEffect(() => {
    const onAdded = (event: Event) => {
      if (window.location.pathname.startsWith(MEDIA_PATH)) return;
      const count = (event as CustomEvent<{ count?: number }>).detail?.count ?? 1;
      setUnseen((n) => n + count);
    };
    window.addEventListener("brewai-media-added", onAdded);
    return () => window.removeEventListener("brewai-media-added", onAdded);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Zähler beim Öffnen der Mediathek zurücksetzen
    if (onMedia) setUnseen(0);
  }, [onMedia]);

  return onMedia ? 0 : unseen;
}

function NavUnseenBadge({ count }: { count: number }) {
  return (
    <AnimatePresence>
      {count > 0 ? (
        <motion.span
          key="badge"
          aria-label={`${count} neue Motive`}
          className="pointer-events-none absolute top-1.5 right-1.5 z-[2] flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 font-medium text-[10px] text-primary-foreground tabular-nums group-data-[collapsible=icon]:top-0.5 group-data-[collapsible=icon]:right-0.5 group-data-[collapsible=icon]:h-3.5 group-data-[collapsible=icon]:min-w-3.5 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:text-[8px]"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 520, damping: 22 }}
        >
          <motion.span
            key={count}
            className="relative"
            initial={{ scale: 1.6 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 520, damping: 18 }}
          >
            {count}
          </motion.span>
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/50 [animation-iteration-count:2] motion-reduce:hidden" />
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}

function NavLinkItem({ item, isActive, showIconFallback, unseen = 0 }: NavLinkItemProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarMenuItem>
      {isActive ? <NavActivePill /> : null}
      <SidebarMenuButton
        asChild
        aria-disabled={item.disabled}
        tooltip={item.title}
        isActive={isActive}
        className={NAV_BUTTON_OVER_PILL}
      >
        <DashboardTabLink
          id={`tour-nav-${item.id}`}
          href={item.url}
          target={item.newTab ? "_blank" : undefined}
          rel={item.newTab ? "noreferrer" : undefined}
          onClick={closeMobile}
        >
          <NavLinkIcon item={item} showFallback={showIconFallback} />
          <span>{item.title}</span>
        </DashboardTabLink>
      </SidebarMenuButton>
      <NavItemBadge badge={item.badge} />
      <NavUnseenBadge count={unseen} />
    </SidebarMenuItem>
  );
}

/** Hover-Motion je Nav-Icon — leicht und unterschiedlich, ohne Ablenkung. */
const NAV_ICON_HOVER: Record<string, string> = {
  dashboard: "group-hover/menu-button:scale-110 group-hover/menu-button:-rotate-6",
  assistant: "group-hover/menu-button:scale-110 group-hover/menu-button:-rotate-3",
  create: "group-hover/menu-button:scale-110 group-hover/menu-button:rotate-6",
  media: "group-hover/menu-button:scale-110 group-hover/menu-button:-translate-y-0.5",
  brand: "group-hover/menu-button:scale-110 group-hover/menu-button:-rotate-8",
  team: "group-hover/menu-button:scale-110",
  pricing: "group-hover/menu-button:scale-110 group-hover/menu-button:-rotate-3",
  settings: "group-hover/menu-button:rotate-45",
};

const NAV_ICON_MOTION = cn(
  "transition-[color,scale,rotate,translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
  "motion-reduce:transition-none",
  "motion-reduce:group-hover/menu-button:translate-y-0 motion-reduce:group-hover/menu-button:rotate-0 motion-reduce:group-hover/menu-button:scale-100",
);

function navIconClass(itemId: string) {
  return cn(
    NAV_ICON_MOTION,
    itemId !== "brand" && "group-hover/menu-button:text-acc",
    NAV_ICON_HOVER[itemId] ?? "group-hover/menu-button:scale-110",
  );
}

/** Palette-Tupfer: default currentColor, Hover → bunt. */
const BRAND_PALETTE_DOTS = [
  { cx: 13.5, cy: 6.5, hover: "group-hover/menu-button:fill-[#EF4444]" },
  { cx: 17.5, cy: 10.5, hover: "group-hover/menu-button:fill-[#3B82F6]" },
  { cx: 8.5, cy: 7.5, hover: "group-hover/menu-button:fill-[#EAB308]" },
  { cx: 6.5, cy: 12.5, hover: "group-hover/menu-button:fill-[#22C55E]" },
] as const;

function BrandPaletteNavIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={cn("size-4 shrink-0 origin-center", className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" />
      {BRAND_PALETTE_DOTS.map((dot) => (
        <circle
          key={`${dot.cx}-${dot.cy}`}
          cx={dot.cx}
          cy={dot.cy}
          r="1.5"
          stroke="none"
          className={cn(
            "fill-current transition-[fill] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            "motion-reduce:transition-none",
            dot.hover,
          )}
        />
      ))}
    </svg>
  );
}

function NavLinkIcon({ item, showFallback }: NavLinkIconProps) {
  if (item.id === "brand") {
    return <BrandPaletteNavIcon className={navIconClass(item.id)} />;
  }

  const Icon = item.icon;

  if (Icon) {
    return <Icon className={navIconClass(item.id)} />;
  }

  if (showFallback) {
    return <CollapsedIconFallback title={item.title} />;
  }

  return null;
}

function NavDropdownItem({ item, isActive, isSubItemActive }: NavDropdownItemProps) {
  const Icon = item.icon;
  const { isMobile, setOpenMobile } = useSidebar();
  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            tooltip={item.title}
            isActive={isActive}
            disabled={item.disabled}
            className={NAV_BUTTON_OVER_PILL}
          >
            {Icon ? (
              <Icon className={navIconClass(item.id)} />
            ) : (
              <CollapsedIconFallback title={item.title} />
            )}
            <span>{item.title}</span>
          </SidebarMenuButton>
        </DropdownMenuTrigger>

        <DropdownMenuContent side="right" align="start" sideOffset={12} className="w-48">
          <DropdownMenuGroup>
            {item.subItems.map((subItem) => {
              const SubIcon = subItem.icon;

              return (
                <DropdownMenuItem key={subItem.id} asChild disabled={subItem.disabled}>
                  <DashboardTabLink
                    href={subItem.url}
                    target={subItem.newTab ? "_blank" : undefined}
                    rel={subItem.newTab ? "noreferrer" : undefined}
                    aria-current={isSubItemActive(subItem.url) ? "page" : undefined}
                    className="flex items-center gap-2"
                    onClick={closeMobile}
                  >
                    {SubIcon && <SubIcon />}
                    <span>{subItem.title}</span>
                  </DashboardTabLink>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

function NavCollapsibleItem({ item, isActive, defaultOpen, isSubItemActive }: NavCollapsibleItemProps) {
  const Icon = item.icon;
  const { isMobile, setOpenMobile } = useSidebar();
  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Collapsible asChild defaultOpen={defaultOpen} className="group/collapsible">
      <SidebarMenuItem>
        {isActive ? <NavActivePill className="h-8 bottom-auto" /> : null}
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            tooltip={item.title}
            isActive={isActive}
            disabled={item.disabled}
            className={NAV_BUTTON_OVER_PILL}
          >
            {Icon ? (
              <Icon className={navIconClass(item.id)} />
            ) : null}
            <span>{item.title}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <NavItemBadge badge={item.badge} />

        <CollapsibleContent>
          <SidebarMenuSub>
            {item.subItems.map((subItem) => {
              const SubIcon = subItem.icon;

              return (
                <SidebarMenuSubItem key={subItem.id}>
                  <SidebarMenuSubButton
                    asChild
                    aria-disabled={subItem.disabled}
                    isActive={isSubItemActive(subItem.url)}
                  >
                    <DashboardTabLink
                      href={subItem.url}
                      target={subItem.newTab ? "_blank" : undefined}
                      rel={subItem.newTab ? "noreferrer" : undefined}
                      onClick={closeMobile}
                    >
                      {SubIcon && <SubIcon />}
                      <span>{subItem.title}</span>
                    </DashboardTabLink>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function NavItemBadge({ badge }: { badge?: NavBadge }) {
  if (!badge) {
    return null;
  }

  return (
    <SidebarMenuBadge
      className={cn(
        "rounded-sm border capitalize",
        badge === "new" &&
          "border-green-600 text-green-600 peer-hover/menu-button:text-green-600 peer-data-active/menu-button:text-green-600",
        badge === "soon" && "border-muted-foreground text-muted-foreground",
      )}
    >
      {badge}
    </SidebarMenuBadge>
  );
}
