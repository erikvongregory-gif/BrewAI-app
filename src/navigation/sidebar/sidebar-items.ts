import {
  Clapperboard,
  CreditCard,
  FolderOpen,
  ImagePlus,
  LayoutDashboard,
  type LucideIcon,
  MessageSquareText,
  Palette,
  Settings2,
  Users,
} from "lucide-react";
import { isVideosCreateEnabled } from "@/lib/featureFlags";

export type NavBadge = "new" | "soon";

export interface NavSubItem {
  id: string;
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

interface NavItemBase {
  id: string;
  title: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

export interface NavMainLinkItem extends NavItemBase {
  url: string;
  subItems?: never;
}

export interface NavMainParentItem extends NavItemBase {
  subItems: NavSubItem[];
}

export type NavMainItem = NavMainLinkItem | NavMainParentItem;

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

/** Nur echte BrewAI-Funktionen — keine Template-Stubs in der Navigation. */
export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Arbeitsbereich",
    items: [
      {
        id: "dashboard",
        title: "Dashboard",
        url: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        id: "assistant",
        title: "BrewAI",
        url: "/dashboard/assistant",
        icon: MessageSquareText,
      },
      {
        id: "create",
        title: "Bilder erstellen",
        url: "/inhalte-erstellen",
        icon: ImagePlus,
      },
      // Solange Videos per Feature-Flag gesperrt sind, führt der Eintrag nur auf eine
      // „Demnächst“-Seite — dann gar nicht erst in der Navigation anbieten.
      ...(isVideosCreateEnabled()
        ? [
            {
              id: "create-videos",
              title: "Videos erstellen",
              url: "/videos-erstellen",
              icon: Clapperboard,
            },
          ]
        : []),
      {
        id: "media",
        title: "Mediathek",
        url: "/dashboard/media",
        icon: FolderOpen,
      },
    ],
  },
  {
    id: 2,
    label: "Marke",
    items: [
      {
        id: "brand",
        title: "Markenprofil",
        url: "/dashboard/brand",
        icon: Palette,
      },
      {
        id: "team",
        title: "Team",
        url: "/dashboard/team",
        icon: Users,
      },
    ],
  },
  {
    id: 3,
    label: "Konto",
    items: [
      {
        id: "pricing",
        title: "Abonnement",
        url: "/dashboard/pricing",
        icon: CreditCard,
      },
      {
        id: "settings",
        title: "Einstellungen",
        url: "/dashboard/settings",
        icon: Settings2,
      },
    ],
  },
];
