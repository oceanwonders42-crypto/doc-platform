/**
 * Consistent color system for statuses across the app.
 * Use these for badges, toasts, error messages, and status indicators.
 */
export const statusColors = {
  success: {
    bg: "#e8f5e9",
    text: "#2e7d32",
    border: "#2e7d32",
  },
  warning: {
    bg: "#fff8e1",
    text: "#e65100",
    border: "#ff9800",
  },
  error: {
    bg: "#ffebee",
    text: "#b71c1c",
    border: "#c62828",
  },
  processing: {
    bg: "#e3f2fd",
    text: "#1565c0",
    border: "#1976d2",
  },
} as const;

export type StatusType = keyof typeof statusColors;

export function getStatusColors(type: StatusType) {
  return statusColors[type];
}
