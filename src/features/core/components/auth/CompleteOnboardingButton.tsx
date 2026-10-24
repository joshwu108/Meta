'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiPatch } from '@/lib/api/client';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';

export function CompleteOnboardingButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, setIsPending] = useState(false);
  const complete = async () => {
    setIsPending(true);
    try {
      await apiPatch('/api/me', { onboarding_completed_at: new Date().toISOString() });
      router.replace('/discover');
    } catch {
      toast('Could not finish onboarding', 'danger');
    } finally {
      setIsPending(false);
    }
  };
  return (
    <Button size="lg" onClick={complete} isLoading={isPending}>
      Continue to Discover
    </Button>
  );
}
