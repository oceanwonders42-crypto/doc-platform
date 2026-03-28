import { Breadcrumbs } from "../../../components/Breadcrumbs";
import ProvidersMapClient from "../ProvidersMapClient";

export default function ProvidersMapPage() {
  return (
    <main
      style={{
        padding: 24,
        maxWidth: 1200,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system",
      }}
    >
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Provider map" }]} />
      <ProvidersMapClient />
    </main>
  );
}
