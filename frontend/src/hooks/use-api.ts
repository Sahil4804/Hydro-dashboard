"use client";

import useSWR from "swr";
import { API_BASE } from "@/lib/constants";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error(`API error: ${res.status}`);
    (error as any).status = res.status;
    throw error;
  }
  return res.json();
};

export function useApi<T = any>(path: string | null) {
  const { data, error, isLoading, mutate } = useSWR<T>(
    path ? `${API_BASE}${path}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
      shouldRetryOnError: false,
    }
  );
  return { data, error, isLoading, mutate };
}
