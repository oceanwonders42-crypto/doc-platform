"use client";

import { getStatusColors, type StatusType } from "../lib/statusColors";

type Props = {
  status: StatusType;
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export function StatusBadge({ status, children, style }: Props) {
  const colors = getStatusColors(status);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        background: colors.bg,
        color: colors.text,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
