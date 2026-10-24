import { ThemeGallery } from '@/features/core/components/theme/ThemeGallery';

export const metadata = { title: 'Theme gallery' };

/**
 * Public route: renders every primitive in both themes for visual regression
 * (design-system §7). `?theme=dark` forces the dark tokens.
 */
export default async function ThemePage({ searchParams }: { searchParams: Promise<{ theme?: string }> }) {
  const { theme } = await searchParams;
  return <ThemeGallery forcedTheme={theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : null} />;
}
