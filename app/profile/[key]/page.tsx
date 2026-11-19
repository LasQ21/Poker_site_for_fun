"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/client/api";
import { useBackButton } from "@/lib/client/telegram";
import type { ProfileDTO } from "@/lib/types";
import { ProfileView } from "@/components/ProfileView";
import { Empty, PageLoader } from "@/components/ui";

function PlayerProfile() {
  const { key } = useParams<{ key: string }>();
  const chat = useSearchParams().get("chat") ?? "";
  const router = useRouter();
  const back = useCallback(() => router.back(), [router]);
  useBackButton(back);
  const decoded = decodeURIComponent(key);
  const { data, error, isLoading } = useSWR<ProfileDTO>(
    `/api/profile?key=${encodeURIComponent(decoded)}&chat=${encodeURIComponent(chat)}`,
    fetcher,
  );
  if (isLoading) return <PageLoader />;
  if (error || !data) return <Empty icon="🤷" title="Профіль недоступний">{error?.message}</Empty>;
  return <ProfileView data={data} />;
}

export default function PlayerProfilePage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <PlayerProfile />
    </Suspense>
  );
}
