"use client";

import { DataGuard } from "@/components/dashboard/data-guard";

export default function StreamflowLayout({ children }: { children: React.ReactNode }) {
  return <DataGuard>{children}</DataGuard>;
}
