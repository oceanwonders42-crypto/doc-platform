import type { CSSProperties } from "react";

import type { MigrationBatchStatus } from "./types";

type StatusMeta = {
  label: string;
  className: string;
};

const STATUS_META: Record<MigrationBatchStatus, StatusMeta> = {
  UPLOADED: { label: "Uploaded", className: "onyx-badge onyx-badge-neutral" },
  PROCESSING: { label: "Processing", className: "onyx-badge onyx-badge-info" },
  FAILED: { label: "Failed", className: "onyx-badge onyx-badge-error" },
  NEEDS_REVIEW: { label: "Needs review", className: "onyx-badge onyx-badge-warning" },
  READY_FOR_EXPORT: { label: "Ready for export", className: "onyx-badge onyx-badge-success" },
  EXPORTED: { label: "Exported", className: "onyx-badge onyx-badge-success" },
};

export function getMigrationBatchStatusMeta(status: MigrationBatchStatus): StatusMeta {
  return STATUS_META[status] ?? STATUS_META.UPLOADED;
}

export function isMigrationBatchExportReady(status: MigrationBatchStatus): boolean {
  return status === "READY_FOR_EXPORT" || status === "EXPORTED";
}

export function MigrationBatchStatusBadge({
  status,
  style,
}: {
  status: MigrationBatchStatus;
  style?: CSSProperties;
}) {
  const meta = getMigrationBatchStatusMeta(status);
  return (
    <span className={meta.className} style={style}>
      {meta.label}
    </span>
  );
}
