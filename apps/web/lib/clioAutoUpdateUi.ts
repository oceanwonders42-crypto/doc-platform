export type ClioAutoUpdateGateSource = "entitlement" | "legacy_flag" | null;

export type ClioAutoUpdateUiState = {
  badgeClass: string;
  badgeLabel: string;
  inlineDescription: string;
  showPageBanner: boolean;
  pageBannerTitle: string | null;
  pageBannerDescription: string | null;
  showUpgradeCta: boolean;
  upgradeCtaLabel: string | null;
};

export function getClioAutoUpdateUiState(
  gateSource: ClioAutoUpdateGateSource
): ClioAutoUpdateUiState {
  if (gateSource === "entitlement") {
    return {
      badgeClass: "onyx-badge-success",
      badgeLabel: "Auto-update active",
      inlineDescription: "Routed documents will write back to Clio automatically when the post-route sync runs.",
      showPageBanner: false,
      pageBannerTitle: null,
      pageBannerDescription: null,
      showUpgradeCta: false,
      upgradeCtaLabel: null,
    };
  }

  if (gateSource === "legacy_flag") {
    return {
      badgeClass: "onyx-badge-warning",
      badgeLabel: "Legacy auto-update enabled (migration pending)",
      inlineDescription: "This firm is still using the legacy Clio auto-update fallback while plan migration is completed.",
      showPageBanner: false,
      pageBannerTitle: null,
      pageBannerDescription: null,
      showUpgradeCta: false,
      upgradeCtaLabel: null,
    };
  }

  return {
    badgeClass: "onyx-badge-warning",
    badgeLabel: "Automatic Clio update disabled",
    inlineDescription: "Document review and routing still work. Onyx will skip the automatic Clio write-back step until this is enabled.",
    showPageBanner: true,
    pageBannerTitle: "Automatic Clio updates are not enabled on your plan",
    pageBannerDescription: "Document review and routing still work. Onyx will skip the automatic Clio write-back step until this is enabled.",
    showUpgradeCta: true,
    upgradeCtaLabel: "Upgrade to enable",
  };
}
