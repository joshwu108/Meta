import Link from "next/link";
import { PreferencesPage } from "@/features/agent/components/agent-pages";
import { getCurrentUser } from "@/features/core";
import { canUseImport } from "@/features/import";

export const metadata = { title: "Preferences · Weave" };

export default async function Page() {
  const user = await getCurrentUser();
  const showImport = user ? await canUseImport(user.id) : false;
  return (
    <>
      <PreferencesPage />
      {showImport ? (
        <p className="mx-auto w-full max-w-[680px] px-4 pb-8">
          <Link className="font-semibold text-brand" href="/agent/import">Bring in your Instagram taste</Link>
          <span className="text-text-2"> · find more interests from screenshots you choose</span>
        </p>
      ) : null}
    </>
  );
}
