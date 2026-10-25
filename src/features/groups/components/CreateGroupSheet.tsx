'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Sheet, useToast } from '@/features/core/components/ui';
import { apiPost } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/use-api-action';
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
    const body = {
      name: values.name.trim(),
      ...(values.description.trim() ? { description: values.description.trim() } : {}),
      interests: values.interests,
      visibility: values.visibility,
    };
    try {
      const group = await apiPost<{ id: string; name: string }>('/api/groups', body);
      toast(`${group.name} is ready. Invite a few people.`, 'success');
      setValues(EMPTY);
      onClose();
      router.push(`/groups/${group.id}?tab=members`);
    } catch (error) {
      toast(errorMessage(error), 'danger');
    } finally {
      setIsSaving(false);
    }
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
