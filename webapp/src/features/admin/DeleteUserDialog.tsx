import type { AdminUserSummary } from '@event-tracking-system/contracts'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

/** Asks before an account is removed for good: the account, its points, links, ideas and photo. */
export function DeleteUserDialog({
  failureReason,
  isPending,
  onCancel,
  onConfirm,
  user,
}: {
  failureReason: string | null
  isPending: boolean
  onCancel: () => void
  onConfirm: () => void
  user: AdminUserSummary | null
}) {
  return (
    <AlertDialog
      open={user !== null}
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить пользователя?</AlertDialogTitle>
          <AlertDialogDescription>
            {user
              ? `${user.email}: аккаунт будет удалён безвозвратно вместе с баллами, связями, идеями и фото. Человек сможет зарегистрироваться заново.`
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failureReason !== null && (
          <Alert variant="destructive">
            <AlertTitle>Пользователь не удалён</AlertTitle>
            <AlertDescription>{failureReason}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Отмена</AlertDialogCancel>
          <Button data-testid="user-delete-confirm" disabled={isPending} onClick={onConfirm} variant="destructive">
            {isPending ? 'Удаляем…' : 'Удалить'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
