import ProvidersMapClient from "./ProvidersMapClient";

export const dynamic = "force-dynamic";

export default function ProvidersMapPage() {
  return (
    <main
      style={{
        padding: 24,
        maxWidth: 1200,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <ProvidersMapClient />
    </main>
  );
}
