'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Sheet, useToast } from '@/features/core/components/ui';
import { fetchJson } from '@/lib/api/fetch-json';
import { GroupFormFields, type GroupFormValues } from './GroupFormFields';

const EMPTY: GroupFormValues = { name: '', description: '', interests: [], visibility: 'private' };

/** Create group modal (Screen 4); opens the new group on success. */
export function CreateGroupSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState<GroupFormValues>(EMPTY);
  const [isSaving, setIsSaving] = useState(false);
  const isValid = values.name.trim().length >= 2;

  const submit = async () => {
    setIsSaving(true);
    const res = await fetchJson<{ id: string; name: string }>('/api/groups', {
      method: 'POST',
      body: {
        name: values.name.trim(),
        ...(values.description.trim() ? { description: values.description.trim() } : {}),
        interests: values.interests,
        visibility: values.visibility,
      },
    });
    setIsSaving(false);
    if (!res.ok) {
      toast(res.error.message, 'danger');
      return;
    }
    toast(`${res.data.name} is ready. Invite a few people.`, 'success');
    setValues(EMPTY);
    onClose();
    router.push(`/groups/${res.data.id}?tab=members`);
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      variant="modal"
      title="Create a group"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} isLoading={isSaving} disabled={!isValid}>
            Create group
          </Button>
        </>
      }
    >
      <GroupFormFields values={values} onChange={setValues} />
    </Sheet>
  );
}
