"use client";

import { DataGuard } from "@/components/dashboard/data-guard";

export default function PrecipitationLayout({ children }: { children: React.ReactNode }) {
  return <DataGuard>{children}</DataGuard>;
}
