"use client";

import { useT } from "@/lib/i18n/client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMe, useToast } from "@/components/AppShell";
import { joinMessage, joinWithCode } from "@/components/JoinByCode";
import { LoginPanel } from "@/components/LoginPanel";
import { Empty, LinkButton, PageLoader, Section } from "@/components/ui";

/** Deep link target: /join/1234 (also startapp=1234 in the Mini App). */
export default function JoinCodePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const { data: me, isLoading } = useMe();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!me?.user || started.current) return;
    started.current = true;
    joinWithCode(code)
      .then((r) => {
        toast(joinMessage(r));
        router.replace(`/g/${r.gameId}`);
      })
      .catch((e: Error) => setError(e.message));
  }, [me?.user, code, router, toast]);

  if (isLoading) return <PageLoader />;
  if (!me?.user) return <LoginPanel />;
  if (error)
    return (
      <Section>
        <Empty icon="🔒" title={t("join.failed", { code })}>
          {error}
        </Empty>
        <div className="px-4 pb-4">
          <LinkButton href="/" className="w-full">
            {t("common.home")}
          </LinkButton>
        </div>
      </Section>
    );
  return <PageLoader />;
}
