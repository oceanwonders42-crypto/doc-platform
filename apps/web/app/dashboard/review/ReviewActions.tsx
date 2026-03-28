 "use client";

 import { useState, useEffect } from "react";
 import Link from "next/link";
 import { useRouter } from "next/navigation";

export type DocumentRow = {
  id: string;
  fileName?: string | null;
  clientName?: string | null;
  suggestedCaseId?: string | null;
  routedCaseId?: string | null;
  matchConfidence?: number | null;
  matchReason?: string | null;
  extractedFields?: unknown;
  [key: string]: unknown;
};

 export type CaseSummary = { id: string; caseNumber: string; title: string; clientName: string };

 const CURRENT_REVIEW_USER = process.env.NEXT_PUBLIC_REVIEW_USER_NAME ?? "You";

 export function suggestedCaseLabel(doc: DocumentRow, cases: CaseSummary[]): string {
   if (!doc.suggestedCaseId) return "";
   const c = cases.find((x) => x.id === doc.suggestedCaseId);
   return c ? `${c.caseNumber} – ${c.title ?? ""}`.trim() : doc.suggestedCaseId;
 }

 type Props = { doc: DocumentRow; cases: CaseSummary[] };

 export default function ReviewActions({ doc, cases }: Props) {
   const router = useRouter();
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [undoWithin, setUndoWithin] = useState<number | null>(null);

   const claimedBy = (doc as Record<string, unknown>).claimedBy as string | null | undefined;
   const isClaimed = claimedBy != null && String(claimedBy).trim() !== "";
   const isClaimedByMe = isClaimed && String(claimedBy) === CURRENT_REVIEW_USER;
   const actionsDisabled = isClaimed && !isClaimedByMe;

   useEffect(() => {
     // reset transient error/loading when doc changes
     setError(null);
     setLoading(false);
   }, [doc.id]);

   async function confirm() {
     if (!doc.suggestedCaseId) return;
     setError(null);
     setLoading(true);
     try {
       const res = await fetch(`/api/documents/${doc.id}/route`, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ caseId: doc.suggestedCaseId }),
       });
       const data = await res.json().catch(() => ({}));
       if (!res.ok) throw new Error(data?.error ?? "Failed to confirm");
       router.refresh();
     } catch (e) {
       setError(String(e));
     } finally {
       setLoading(false);
     }
   }

   async function reject() {
     setError(null);
     setLoading(true);
     try {
       const res = await fetch(`/api/documents/${doc.id}/reject`, { method: "POST" });
       if (!res.ok) {
         const data = await res.json().catch(() => ({}));
         throw new Error(data?.error ?? "Failed to reject");
       }
       setUndoWithin(15);
       const t = setInterval(() => {
         setUndoWithin((n) => (n == null ? null : n <= 1 ? null : n - 1));
       }, 1000);
       setTimeout(() => clearInterval(t), 15000);
       router.refresh();
     } catch (e) {
       setError(String(e));
     } finally {
       setLoading(false);
     }
   }

   async function undoReject() {
     if (undoWithin == null) return;
     setError(null);
     setLoading(true);
     try {
       const res = await fetch(`/api/documents/${doc.id}/approve`, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ previousSuggestedCaseId: doc.suggestedCaseId }),
       });
       const data = await res.json().catch(() => ({}));
       if (!res.ok) throw new Error(data?.error ?? "Failed to undo");
       setUndoWithin(null);
       router.refresh();
     } catch (e) {
       setError(String(e));
     } finally {
       setLoading(false);
     }
   }

   async function claim() {
     setError(null);
     setLoading(true);
     try {
       const res = await fetch(`/api/documents/${doc.id}/claim`, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ claimedBy: CURRENT_REVIEW_USER }),
       });
       const data = await res.json().catch(() => ({}));
       if (!res.ok) throw new Error(data?.error ?? "Failed to claim");
       router.refresh();
     } catch (e) {
       setError(String(e));
     } finally {
       setLoading(false);
     }
   }

   async function unclaim() {
     setError(null);
     setLoading(true);
     try {
       const res = await fetch(`/api/documents/${doc.id}/unclaim`, {
         method: "POST",
       });
       const data = await res.json().catch(() => ({}));
       if (!res.ok) throw new Error(data?.error ?? "Failed to unclaim");
       router.refresh();
     } catch (e) {
       setError(String(e));
     } finally {
       setLoading(false);
     }
   }

   return (
     <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
       {error && <span style={{ color: "#c00", fontSize: 12 }}>{error}</span>}
       {isClaimed && (
         <span style={{ fontSize: 11, color: "#555" }}>
           Claimed by {isClaimedByMe ? "you" : claimedBy}
         </span>
       )}
       {!isClaimed && (
         <button
           type="button"
           onClick={claim}
           disabled={loading}
           style={{
             padding: "4px 10px",
             fontSize: 12,
             border: "1px solid #666",
             borderRadius: 4,
             cursor: loading ? "not-allowed" : "pointer",
             background: "#f5f5f5",
           }}
         >
           Claim
         </button>
       )}
       {isClaimedByMe && (
         <button
           type="button"
           onClick={unclaim}
           disabled={loading}
           style={{
             padding: "4px 10px",
             fontSize: 12,
             border: "1px solid #999",
             borderRadius: 4,
             cursor: loading ? "not-allowed" : "pointer",
             background: "#fff",
           }}
         >
           Unclaim
         </button>
       )}
       <button
         type="button"
         onClick={confirm}
         disabled={loading || actionsDisabled || !doc.suggestedCaseId}
         style={{
           padding: "4px 10px",
           fontSize: 12,
           border: "1px solid #0a0",
           borderRadius: 4,
           cursor: loading || actionsDisabled || !doc.suggestedCaseId ? "not-allowed" : "pointer",
           background: "#efe",
         }}
       >
         Confirm
       </button>
       <button
         type="button"
         onClick={reject}
         disabled={loading || actionsDisabled}
         style={{
           padding: "4px 10px",
           fontSize: 12,
           border: "1px solid #c00",
           borderRadius: 4,
           cursor: loading || actionsDisabled ? "not-allowed" : "pointer",
           background: "#fee",
         }}
       >
         Reject
       </button>
       {undoWithin != null && (
         <button
           type="button"
           onClick={undoReject}
           disabled={loading}
           style={{
             padding: "4px 10px",
             fontSize: 12,
             border: "1px solid #66a",
             borderRadius: 4,
             cursor: loading ? "not-allowed" : "pointer",
             background: "#eef",
           }}
         >
           Undo ({undoWithin}s)
         </button>
       )}
       <Link href={`/documents/${doc.id}`} style={{ fontSize: 12, color: "#06c" }}>
         Open
       </Link>
     </div>
   );
 }

