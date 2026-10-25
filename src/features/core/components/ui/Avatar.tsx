import { cn } from './cn';

export type AvatarSize = 24 | 32 | 40 | 56;

export type AvatarProps = { name: string; src?: string | null; size?: AvatarSize; className?: string };

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const textSize: Record<AvatarSize, string> = { 24: 'text-[10px]', 32: 'text-xs', 40: 'text-sm', 56: 'text-md' };

/** Circular avatar with initials fallback. */
export function Avatar({ name, src, size = 40, className }: AvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-pill bg-brand-soft font-semibold text-brand-ink',
        textSize[size],
        className,
      )}
      style={{ width: size, height: size }}
      role="img"
      aria-label={name}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/** Overlapping avatars for "friends going". Shows at most `max`, then a +N bubble. */
export function AvatarStack({ people, max = 3, size = 24 }: { people: Array<{ name: string; src?: string | null }>; max?: number; size?: AvatarSize }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="inline-flex items-center">
      {shown.map((person, index) => (
        <span key={`${person.name}-${index}`} className={cn('rounded-pill ring-2 ring-surface', index > 0 && '-ml-2')}>
          <Avatar name={person.name} src={person.src} size={size} />
        </span>
      ))}
      {extra > 0 && (
        <span
          className="-ml-2 inline-flex items-center justify-center rounded-pill bg-pressed text-[10px] font-semibold text-text-2 ring-2 ring-surface"
          style={{ width: size, height: size }}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
