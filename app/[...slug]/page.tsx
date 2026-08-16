import { forbidden, notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/session-cookie";
import { gateValid } from "@/lib/guard";
import { getRuleByDummyPath, getRuleByRealPath } from "@/lib/repo";
import { GateForm } from "./gate-form";
import { RealPage } from "./real-page";

export default async function SlugPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = "/" + slug.join("/");

  const realRule = await getRuleByRealPath(path);
  if (realRule) {
    const session = await getCurrentSession();
    if (!gateValid(session?.data, realRule.id)) forbidden();
    return <RealPage rule={realRule} />;
  }

  const dummyRule = await getRuleByDummyPath(path);
  if (dummyRule) {
    const session = await getCurrentSession();
    return <GateForm ruleId={dummyRule.id} csrf={session?.data.csrf ?? null} />;
  }

  notFound();
}
