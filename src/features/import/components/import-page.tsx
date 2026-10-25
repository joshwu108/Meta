'use client';
import { useState } from 'react';
import { ImportFlow } from './import-flow';
import { PlanView } from './plan-view';

/** /agent/import: share → review, with "Your plan" underneath (rebuilt after each Done for now). */
export function ImportPage() {
  const [version, setVersion] = useState(0);
  return (
    <div className="flex flex-col gap-6">
      <ImportFlow onDecided={() => setVersion((v) => v + 1)} />
      <PlanView key={version} refresh={version > 0} />
    </div>
  );
}
