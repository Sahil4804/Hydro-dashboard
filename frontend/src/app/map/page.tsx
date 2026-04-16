"use client";

import dynamic from "next/dynamic";
import { useApi } from "@/hooks/use-api";
import { Loader2 } from "lucide-react";

const MapView = dynamic(() => import("./map-view"), { ssr: false });

export default function MapPage() {
  const { data, isLoading, error } = useApi<any>("/api/map/context");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[80vh] gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Loading map data...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <p className="text-muted-foreground">Could not load map data.</p>
      </div>
    );
  }

  return <MapView data={data} />;
}
