"use client";

import { useT } from "@/lib/i18n/client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMe } from "@/components/AppShell";
import { LoginPanel } from "@/components/LoginPanel";
import { Empty, PageSkeleton, Row, Section } from "@/components/ui";

export default function LeaderboardIndex() {
  const { data: me, isLoading } = useMe();
  const router = useRouter();
  const t = useT();
  useEffect(() => {
    if (me?.chats.length === 1) router.replace(`/leaderboard/${me.chats[0].publicId}`);
  }, [me, router]);

  if (isLoading) return <PageSkeleton variant="list" />;
  if (!me?.user) return <LoginPanel />;
  return (
    <div>
      <h1 className="font-display mb-4 px-1 text-[1.6rem] font-bold">{t("lb.title")}</h1>
      <Section title={t("lb.yourGroups")}>
        {me.chats.length ? (
          me.chats.map((c) => (
            <Row key={c.id} href={`/leaderboard/${c.publicId}`}>
              <span className="chip h-10 w-10 shrink-0" style={{ ["--chip" as string]: "var(--felt)" }} />
              <span className="flex-1 font-bold">{c.title}</span>
              <span className="text-hint">›</span>
            </Row>
          ))
        ) : (
          <Empty icon="👥" title={t("lb.noGroups")}>
            {t("lb.noGroupsText")}
          </Empty>
        )}
      </Section>
    </div>
  );
}
