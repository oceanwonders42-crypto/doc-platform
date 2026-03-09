"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getApiBase, getAuthHeader, getFetchOptions } from "../lib/api";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const base = getApiBase();
    if (!base) {
      router.replace("/login");
      return;
    }
    fetch(`${base}/auth/me`, { headers: getAuthHeader(), ...getFetchOptions() })
      .then((res) => {
        if (res.ok) {
          router.replace("/dashboard");
        } else {
          router.replace("/login");
        }
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [router]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>Loading…</p>
    </div>
  );
}
