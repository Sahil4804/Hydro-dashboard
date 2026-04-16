"use client";

import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { CloudRain, Loader2, Play, AlertCircle } from "lucide-react";
import Link from "next/link";

export function DataGuard({ children }: { children: React.ReactNode }) {
  const { data: status, isLoading } = useApi<any>("/api/pipeline/status");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status?.ready) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertCircle className="h-12 w-12 text-amber-500" />
        <h2 className="text-xl font-semibold">Data Not Available</h2>
        <p className="text-sm text-muted-foreground max-w-md text-center">
          The data pipeline has not been initialized yet. Please go to the Overview page to start it.
        </p>
        <Link href="/">
          <Button size="lg">
            <CloudRain className="h-4 w-4 mr-2" />
            Go to Overview
          </Button>
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
