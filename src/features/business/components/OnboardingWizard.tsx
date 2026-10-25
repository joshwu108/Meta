'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button, Card, CardFooter } from '@/features/core/components/ui';
import { apiPost } from '@/lib/api/client';
import { cn } from '@/lib/util/cn';
import { CapabilitiesStep } from './onboarding/CapabilitiesStep';
import { LocationStep } from './onboarding/LocationStep';
import { ProfileStep } from './onboarding/ProfileStep';
import { ReviewStep } from './onboarding/ReviewStep';
import {
  EMPTY_DRAFT,
  ONBOARDING_STEPS,
  canLeaveStep,
  toOnboardingBody,
  type OnboardingDraft,
} from './onboarding/draft';
import { useSubmit } from './use-submit';

/**
 * Business Screen 1 (spec section 7): Profile -> Location & hours -> What you can host ->
 * Review. This component owns the state machine; each step renders its own fields.
 */
export function OnboardingWizard() {
  const { busy: pending, message, errors, submit: run, navigate } = useSubmit();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_DRAFT);

  const set = <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = () =>
    run(
      () => apiPost('/api/business', toOnboardingBody(draft)),
      () => navigate('/business'),
    );

  const stepProps = { draft, set, errors };
  const isLast = step === ONBOARDING_STEPS.length - 1;

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-4 py-10">
      {/* Matches 01's AuthCard frame: this is reached straight after signup, before the
          business shell exists, so it needs its own landmark and wordmark. */}
      <p className="text-[length:var(--text-lg)] font-bold text-brand">Weave</p>
      <header>
        <h1 className="text-2xl font-bold leading-tight">Set up your venue</h1>
        <p className="mt-1 text-sm text-text-2">Four short steps. You can change any of it later.</p>
      </header>

      <ol className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {ONBOARDING_STEPS.map((label, index) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex size-5 items-center justify-center rounded-pill text-xs font-bold',
                index < step && 'bg-brand text-text-on-brand',
                index === step && 'bg-brand-soft text-brand',
                index > step && 'bg-pressed text-text-3',
              )}
            >
              {index < step ? <Check aria-hidden size={12} strokeWidth={3} /> : index + 1}
            </span>
            <span className={index === step ? 'font-semibold' : 'text-text-2'}>{label}</span>
          </li>
        ))}
      </ol>

      {message ? (
        <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
          {message}
        </p>
      ) : null}

      <Card className="flex flex-col gap-4">
        {step === 0 ? <ProfileStep {...stepProps} /> : null}
        {step === 1 ? <LocationStep {...stepProps} /> : null}
        {step === 2 ? <CapabilitiesStep {...stepProps} /> : null}
        {step === 3 ? <ReviewStep draft={draft} /> : null}

        <CardFooter>
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={pending}>
              Back
            </Button>
          ) : null}
          {isLast ? (
            <Button className="ml-auto" onClick={submit} disabled={pending}>
              Finish setup
            </Button>
          ) : (
            <Button
              className="ml-auto"
              onClick={() => setStep(step + 1)}
              disabled={!canLeaveStep(step, draft) || pending}
            >
              Continue
            </Button>
          )}
        </CardFooter>
      </Card>
    </main>
  );
}
