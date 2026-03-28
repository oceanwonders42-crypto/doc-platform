# Dashboard load speed — audit and improvements

## 1. Causes of slowness (identified)

### A. Single loading gate
- **Issue:** One `loading` state was cleared only in `.finally()` after **all four** API calls completed. The entire KPI row, queue card, activity card, and trends card stayed in skeleton state until the slowest request (often `activity-feed` or `metrics-summary`) finished.
- **Impact:** First paint of real data was delayed by the slowest of: `me/metrics-summary`, `cases`, `activity-feed?limit=10`, `me/queue-status`.

### B. Sequential perception
- **Issue:** Even though the four fetches were in `Promise.all`, the UI treated them as one unit. Fast endpoints (e.g. `cases`, `me/queue-status`) could not show data until the slowest one completed.
- **Impact:** Users saw skeletons for longer than necessary; no progressive reveal.

### C. Redundant work in trend chart
- **Issue:** In the trend bar chart, `Math.max(1, ...trend.map((x) => x.docsProcessed))` was computed **inside** the `.map()` over `trend.slice(-14)`, so the max was recomputed 14 times per render.
- **Impact:** Minor CPU work every render when trend data was present.

### D. No duplicate fetches
- **Verified:** Layout runs `/auth/me` once in `DashboardAuthContext`. The dashboard page does not call `/auth/me` again. No overlap between layout and page data.

### E. Theme and i18n
- **Verified:** `ThemeProvider` and `I18nProvider` use stable `useCallback`/`useState`; value references only change when theme/locale change. No evidence of unnecessary rerenders or expensive recalculation on every render.

### F. loading.tsx
- **Verified:** `app/dashboard/loading.tsx` exists and shows a skeleton consistent with the page (header, KPI grid, quick actions, two cards). Next.js shows it during navigation while the dashboard segment loads. No change made.

---

## 2. Files changed

| File | Change |
|------|--------|
| `apps/web/app/dashboard/page.tsx` | Per-resource loading (four states). Independent fetches. Trend chart max computed once per render. |

---

## 3. What became faster (perceived and actual)

### Perceived speed
- **KPI cards** show real data as soon as their own request resolves:
  - Cases count appears when `GET /cases` returns (often fastest).
  - Documents processed, Needs review, Unmatched, Records requests appear when `GET /me/metrics-summary` returns.
  - Queue status appears when `GET /me/queue-status` returns.
- **Activity card** shows content when `GET /activity-feed?limit=10` returns; it no longer blocks KPIs or trends.
- **Trends card** shows when `metrics-summary` returns (same as summary KPIs); it no longer waits on activity or queue.
- **Empty state** still appears only when all loading is done and there is no data; logic unchanged.

### Actual speed
- **No extra requests:** Still four parallel requests; no duplicate calls.
- **Faster time to first meaningful paint:** As soon as any one of the four responses arrives, the corresponding section can render real data instead of waiting for the slowest.
- **Trend chart:** Max is computed once over `trend.slice(-14)` per render instead of 14 times; less work per render.

---

## 4. Remaining backend/API bottlenecks

- **Backend not changed.** Any slowness in `me/metrics-summary`, `activity-feed`, `me/queue-status`, or `cases` is unchanged. If one of these is slow (e.g. heavy DB or aggregations), the frontend will still wait for it for that section only; other sections can already be painted.
- **Recommendation:** If `me/metrics-summary` or `activity-feed` are slow in production, consider indexing, caching, or lighter queries on the API side. The dashboard no longer blocks the whole page on them.

---

## 5. Summary

| Before | After |
|--------|--------|
| One `loading` flag; all sections skeleton until all 4 requests done | Four loading flags; each section shows data when its request completes |
| Trend chart recomputed max 14 times per render | Max computed once per render over the visible slice |
| No duplicate fetches; layout only does auth/me | Unchanged |

Product behavior is unchanged: same endpoints, same data, same UI structure. Only loading behavior and a small render optimization were updated to improve perceived and actual dashboard load speed.
