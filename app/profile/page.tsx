"use client";

import useSWR from "swr";
import { useState } from "react";
import { fetcher } from "@/lib/client/api";
import type { ProfileDTO } from "@/lib/types";
import { useMe } from "@/components/AppShell";
import { LoginPanel } from "@/components/LoginPanel";
import { ProfileView } from "@/components/ProfileView";
import { Empty, PageLoader } from "@/components/ui";

/** The viewer's own profile: all games, or one group's games. */
export default function MyProfilePage() {
  const { data: me, isLoading } = useMe();
  const [chat, setChat] = useState<string>("");
  const { data, error } = useSWR<ProfileDTO>(me?.user ? `/api/profile?chat=${chat}` : null, fetcher);

  if (isLoading) return <PageLoader />;
  if (!me?.user) return <LoginPanel />;
  if (error) return <Empty icon="🤷" title="Не вдалося завантажити">{error.message}</Empty>;
  if (!data) return <PageLoader />;

  const scope =
    me.chats.length > 0 ? (
      <div className="-mx-3 mb-4 flex gap-2 overflow-x-auto px-3 pb-1">
        {[{ publicId: "", title: "Усі ігри" }, ...me.chats].map((c) => (
          <button
            key={c.publicId || "all"}
            type="button"
            onClick={() => setChat(c.publicId)}
            aria-pressed={chat === c.publicId}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition active:scale-95 ${chat === c.publicId ? "glass-tint" : "glass text-fg/80"}`}
          >
            {c.title}
          </button>
        ))}
      </div>
    ) : null;

  return <ProfileView data={data} scope={scope} />;
}
