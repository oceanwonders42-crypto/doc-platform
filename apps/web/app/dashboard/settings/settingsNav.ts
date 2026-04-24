export type SettingsNavItem = {
  label: string;
  href: string;
  description: string;
};

export type SettingsNavSection = {
  title: string;
  items: SettingsNavItem[];
};

export const settingsNavSections: SettingsNavSection[] = [
  {
    title: "Firm settings",
    items: [
      {
        label: "Profile",
        href: "/dashboard/settings/firm",
        description: "Firm details, billing contact, retention, and workspace defaults.",
      },
      {
        label: "Team",
        href: "/dashboard/team",
        description: "Invite staff, manage roles, and review workspace access.",
      },
    ],
  },
  {
    title: "Revenue and integrations",
    items: [
      {
        label: "Billing",
        href: "/dashboard/settings/billing",
        description: "Plan, usage, billing status, and document limits.",
      },
      {
        label: "Clio Integration",
        href: "/dashboard/settings/clio",
        description: "Connection health, disconnect, and Clio staff defaults.",
      },
      {
        label: "API Keys",
        href: "/dashboard/settings/api-keys",
        description: "Create new ingest keys for firm-level automation and imports.",
      },
    ],
  },
];

export function isSettingsNavActive(pathname: string, href: string): boolean {
  if (href === "/dashboard/settings/firm" && pathname === "/dashboard/settings") {
    return true;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
