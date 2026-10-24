'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';

export function CompleteOnboardingButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, setIsPending] = useState(false);
  const complete = async () => {
    setIsPending(true);
    const res = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ onboarding_completed_at: new Date().toISOString() }),
    });
    setIsPending(false);
    if (!res.ok) {
      toast('Could not finish onboarding', 'danger');
      return;
    }
    router.replace('/discover');
  };
  return (
    <Button size="lg" onClick={complete} isLoading={isPending}>
      Continue to Discover
    </Button>
  );
}
