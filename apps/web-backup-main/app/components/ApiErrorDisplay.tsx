type Props = {
  onRetry: () => void;
  retrying?: boolean;
  message?: string;
};

export default function ApiErrorDisplay({
  onRetry,
  retrying = false,
  message = "Something went wrong loading data.",
}: Props) {
  return (
    <div
      style={{
        padding: 16,
        background: "#fef2f2",
        border: "1px solid #fecaca",
        borderRadius: 8,
        marginBottom: 16,
      }}
    >
      <p style={{ color: "#991b1b", fontSize: 14, margin: "0 0 12px 0" }}>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        style={{
          padding: "8px 16px",
          fontSize: 14,
          border: "1px solid #b91c1c",
          borderRadius: 6,
          background: retrying ? "#fecaca" : "#fff",
          color: "#b91c1c",
          cursor: retrying ? "not-allowed" : "pointer",
          fontWeight: 500,
        }}
      >
        {retrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}
