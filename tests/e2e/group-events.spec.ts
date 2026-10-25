import { expect, test } from '@playwright/test';
import { CONSUMER, login, reseed } from './helpers';

// The first request to a route compiles it in dev mode, which can take longer than 5s in CI.
const FIRST_REQUEST = { timeout: 20_000 };

type GroupDetail = { upcomingEvents: Array<{ membersGoing: number; event: { id: string; title: string } }> };

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('AC5: a group sees the events its members are going to and opens one', async ({ page }) => {
  test.setTimeout(60_000);
  await reseed(page);
  await login(page, CONSUMER.email);
  const { data: groups } = (await (await page.request.get('/api/groups')).json()) as { data: Array<{ id: string; name: string }> };
  const groupId = groups.find((g) => g.name === 'Mission Makers')!.id;
  const { data: detail } = (await (await page.request.get(`/api/groups/${groupId}`)).json()) as { data: GroupDetail };
  const top = detail.upcomingEvents.find((e) => e.membersGoing > 0);
  expect(top, "06's seeded RSVPs give the group an event its members are going to").toBeDefined();

  await page.goto(`/groups/${groupId}?tab=events`);
  const link = page.getByRole('region', { name: 'Upcoming events' }).getByRole('link', { name: new RegExp(escape(top!.event.title)) });
  await expect(link).toContainText(`${top!.membersGoing} ${top!.membersGoing === 1 ? 'member is' : 'members are'} going`);
  await link.click();
  await page.waitForURL(new RegExp(`/events/${top!.event.id}$`));
  await expect(page.getByRole('heading', { level: 1, name: top!.event.title })).toBeVisible(FIRST_REQUEST);
});
