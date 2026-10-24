'use client';
import { useEffect, useState } from 'react';
import { Button, Sheet, useToast } from '@/features/core/components/ui';
import { useApiAction } from '@/lib/api/use-api-action';
import type { GroupDetail } from '../server/types';
import { GroupFormFields, type GroupFormValues } from './GroupFormFields';

const fromGroup = (group: GroupDetail): GroupFormValues => ({
  name: group.name,
  description: group.description ?? '',
  interests: group.interests,
  visibility: group.visibility,
});

/** Admins edit name, description, interests and visibility (PATCH /api/groups/:id). */
export function EditGroupSheet({ group, isOpen, onClose }: { group: GroupDetail; isOpen: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { run, isPending } = useApiAction(toast);
  const [values, setValues] = useState<GroupFormValues>(() => fromGroup(group));
  useEffect(() => {
    if (isOpen) setValues(fromGroup(group));
  }, [isOpen, group]);

  const save = async () => {
    const body = { name: values.name.trim(), description: values.description.trim() || null, interests: values.interests, visibility: values.visibility };
    if (await run('save', `/api/groups/${group.id}`, { method: 'PATCH', body }, { success: 'Group updated' })) onClose();
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      variant="modal"
      title="Edit group"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} isLoading={isPending('save')} disabled={values.name.trim().length < 2}>
            Save changes
          </Button>
        </>
      }
    >
      <GroupFormFields values={values} onChange={setValues} />
    </Sheet>
  );
}
