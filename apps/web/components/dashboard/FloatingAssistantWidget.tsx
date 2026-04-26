"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { AssistantChatPanel } from "./AssistantChatPanel";

function getCaseIdFromPath(pathname: string): string | undefined {
  const match = pathname.match(/^\/dashboard\/cases\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function FloatingAssistantWidget() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const caseId = useMemo(() => getCaseIdFromPath(pathname), [pathname]);
  const isCaseContext = Boolean(caseId);
  const storageKey = isCaseContext ? `onyx-assistant:case:${caseId}` : "onyx-assistant:dashboard";

  return (
    <div
      style={{
        position: "fixed",
        left: "1rem",
        bottom: "1rem",
        zIndex: 60,
        width: open ? "min(420px, calc(100vw - 2rem))" : "auto",
        maxWidth: "calc(100vw - 2rem)",
      }}
    >
      {open ? (
        <div
          className="onyx-card"
          style={{
            padding: "1rem",
            boxShadow: "0 24px 70px rgba(15, 23, 42, 0.28)",
            border: "1px solid rgba(201, 162, 39, 0.24)",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,241,228,0.96))",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "0.75rem", marginBottom: "0.8rem" }}>
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--onyx-text-muted)",
                }}
              >
                {isCaseContext ? "Case assistant" : "Onyx assistant"}
              </p>
              <h2 style={{ margin: "0.2rem 0 0", fontSize: "1rem", lineHeight: 1.2 }}>
                Ask Onyx
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="onyx-link"
              style={{ border: 0, background: "transparent", cursor: "pointer", fontSize: "0.82rem" }}
            >
              Minimize
            </button>
          </div>
          <AssistantChatPanel
            caseId={caseId}
            storageKey={storageKey}
            placeholder={isCaseContext ? "Ask about this case..." : "Ask about the app or firm status..."}
            intro={
              isCaseContext
                ? "This chat is scoped to the current case and uses routed documents, chronology, bills, missing records, and demand context."
                : "This chat can help with navigation, firm-level summaries, enabled features, integrations, and review queues."
            }
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="onyx-btn-primary"
          style={{
            borderRadius: "999px",
            padding: "0.8rem 1rem",
            boxShadow: "0 18px 46px rgba(15, 23, 42, 0.28)",
          }}
          aria-label="Open Onyx assistant"
        >
          Ask Onyx
        </button>
      )}
    </div>
  );
}
