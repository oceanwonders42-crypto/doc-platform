/**
 * Matter/workflow type. Separate from document type (what the document is).
 * Used for routing: PI = personal injury / LegalCase; TRAFFIC = traffic citation / TrafficMatter.
 */
export const MatterType = {
  PI: "PI",
  TRAFFIC: "TRAFFIC",
} as const;

export type MatterTypeValue = (typeof MatterType)[keyof typeof MatterType];

export function isTrafficMatterType(value: string | null | undefined): value is "TRAFFIC" {
  return value === MatterType.TRAFFIC;
}

export function isPIMatterType(value: string | null | undefined): value is "PI" {
  return value === MatterType.PI || value == null;
}
