const TRAFFIC_FALSE_VALUES = new Set(["0", "false", "off", "no"]);

export const TRAFFIC_FEATURE_ENV_NAME = "NEXT_PUBLIC_ENABLE_TRAFFIC";
export const TRAFFIC_DISABLED_MESSAGE =
  "Traffic support is disabled for this build. Re-enable NEXT_PUBLIC_ENABLE_TRAFFIC to restore the traffic workflow.";

export function isTrafficFeatureEnabled(): boolean {
  const rawValue = process.env.NEXT_PUBLIC_ENABLE_TRAFFIC;
  if (rawValue == null) return true;
  return !TRAFFIC_FALSE_VALUES.has(rawValue.trim().toLowerCase());
}
