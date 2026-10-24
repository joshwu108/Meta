'use client';

import { BusinessErrorState } from '@/features/business/components/BusinessErrorState';

export default function BusinessError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <BusinessErrorState {...props} />;
}
