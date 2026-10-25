'use client';
import { Bot, Inbox, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AiRing } from '../ui/AiRing';
import { AiTag } from '../ui/AiTag';
import { Avatar, AvatarStack } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { CapacityMeter } from '../ui/CapacityMeter';
import { Card, CardFooter, CardHeader } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Input } from '../ui/Input';
import { Sheet } from '../ui/Sheet';
import { StatusPill } from '../ui/StatusPill';
import { Switch } from '../ui/Switch';
import { Tabs } from '../ui/Tabs';
import { ToastView } from '../ui/Toast';
import { ThemeToggle } from './ThemeToggle';

const STATUSES = ['published', 'confirmed', 'pending', 'awaiting_approval', 'cancelled', 'approved_draft', 'full'] as const;
const TAB_ITEMS = [
  { value: 'upcoming', label: 'Upcoming', count: 3 },
  { value: 'past', label: 'Past' },
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-text-2">{title}</h2>
      <div className="surface-card flex flex-wrap items-center gap-3 p-4">{children}</div>
    </section>
  );
}

export function ThemeGallery({ forcedTheme }: { forcedTheme: 'light' | 'dark' | null }) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);
  const [isOn, setIsOn] = useState(true);
  const [tab, setTab] = useState<(typeof TAB_ITEMS)[number]['value']>('upcoming');
  const [selected, setSelected] = useState(true);

  useEffect(() => {
    if (forcedTheme) document.documentElement.setAttribute('data-theme', forcedTheme);
  }, [forcedTheme]);

  return (
    <main className="mx-auto flex max-w-[var(--feed-width)] flex-col gap-6 px-4 py-6" data-testid="theme-gallery">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lead">Theme gallery</h1>
          <p className="text-text-2">Every primitive, both themes. Used for visual regression.</p>
        </div>
        <ThemeToggle />
      </header>

      <Section title="Buttons">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button isLoading>Saving</Button>
        <Button size="lg" leadingIcon={<Sparkles size={16} aria-hidden />}>
          Large
        </Button>
      </Section>

      <Section title="Chips and AI markers">
        <Chip>Pottery</Chip>
        <Chip selected={selected} onSelect={() => setSelected((value) => !value)}>
          Coffee shops
        </Chip>
        <Chip onRemove={() => undefined}>Thursday evenings</Chip>
        <AiTag />
        <AiTag label="AI inferred" />
        <AiTag label="Estimate" />
        <AiRing>
          <Avatar name="Agent" size={40} />
        </AiRing>
      </Section>

      <Section title="Avatars">
        <Avatar name="Maya Chen" size={24} />
        <Avatar name="Maya Chen" size={32} />
        <Avatar name="Maya Chen" size={40} />
        <Avatar name="Maya Chen" size={56} />
        <AvatarStack people={[{ name: 'Maya Chen' }, { name: 'Leo Park' }, { name: 'Sam Rivera' }, { name: 'Ana Souza' }, { name: 'Kai Ito' }]} />
      </Section>

      <Section title="Status pills">
        {STATUSES.map((status) => (
          <StatusPill key={status} status={status} />
        ))}
      </Section>

      <section className="flex flex-col gap-3">
        <h2 className="text-text-2">Card, capacity meter, tabs</h2>
        <Card isClickable as="article">
          <CardHeader title="Beginner Pottery & Coffee Night" subtitle="Kiln & Cup · Thu 7:00 PM" action={<AiTag />} />
          <p className="text-text-2">Six neighbors who like creative evenings are free Thursday. Small group, $25 includes clay and a latte.</p>
          <CapacityMeter confirmed={9} capacity={12} className="mt-3" />
          <CardFooter>
            <StatusPill status="published" />
            <Button>RSVP</Button>
          </CardFooter>
        </Card>
        <Card>
          <Tabs items={TAB_ITEMS} value={tab} onChange={setTab} ariaLabel="Example tabs" />
          <div className="flex flex-col gap-2 pt-3">
            <CapacityMeter confirmed={2} capacity={10} />
            <CapacityMeter confirmed={8} capacity={10} />
            <CapacityMeter confirmed={10} capacity={10} />
          </div>
        </Card>
      </section>

      <Section title="Switch and input">
        <div className="w-full">
          <Switch checked={isOn} onChange={setIsOn} label="Allow matching" description="Share consented interests with your agent's matching." />
          <Switch checked={!isOn} onChange={(next) => setIsOn(!next)} label="Share name with business" />
        </div>
        <Input label="Display name" defaultValue="Maya Chen" className="w-full" />
        <Input label="Email" defaultValue="not-an-email" error="Enter a valid email" className="w-full" />
      </Section>

      <Section title="Toast and empty state">
        <div className="flex w-full flex-col gap-2">
          <ToastView item={{ id: 1, message: 'RSVP confirmed', tone: 'success' }} />
          <ToastView item={{ id: 2, message: 'Saved your preferences', tone: 'info' }} />
          <ToastView item={{ id: 3, message: 'Could not reach the server', tone: 'danger' }} />
        </div>
        <div className="w-full">
          <EmptyState icon={<Inbox size={20} aria-hidden />} title="No proposals yet" action={<Button variant="secondary">Learn how proposals work</Button>} />
        </div>
      </Section>

      <Section title="Sheet">
        <Button variant="secondary" onClick={() => setIsSheetOpen(true)}>
          Open sheet
        </Button>
        <Button variant="secondary" onClick={() => setIsFormSheetOpen(true)}>
          Open form sheet
        </Button>
        <Sheet isOpen={isFormSheetOpen} onClose={() => setIsFormSheetOpen(false)} title="Rename group">
          <Input label="Group name" defaultValue="Mission Makers" autoFocus />
        </Sheet>
        <Sheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} title="Edit price" footer={<Button onClick={() => setIsSheetOpen(false)}>Save</Button>}>
          <p className="text-text-2">Sheets use radius-lg, shadow-3 and the token backdrop.</p>
          <div className="mt-3 flex items-center gap-2">
            <Bot size={20} className="text-brand" aria-hidden />
            <AiTag label="Estimate" />
          </div>
        </Sheet>
      </Section>
    </main>
  );
}
