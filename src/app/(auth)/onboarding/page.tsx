import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/core";
import { OnboardingFlow } from "@/features/agent/components/onboarding-flow";

export const metadata = { title: "Welcome · Weave" };

/** Screen 1. Keeps 01's routing rules: signed out → /login, already onboarded → /discover. */
export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/onboarding");
  if (user.profile.onboarding_completed_at) redirect("/discover");
  return <OnboardingFlow displayName={user.profile.display_name} />;
}
