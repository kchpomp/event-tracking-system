import type { AdminUserSummary, UserRole } from '@event-tracking-system/contracts'

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

export function RoleChangeDialog({
  failureReason,
  isPending,
  onCancel,
  onConfirm,
  pendingChange,
}: {
  failureReason: string | null
  isPending: boolean
  onCancel: () => void
  onConfirm: () => void
  pendingChange: {
    role: UserRole
    user: AdminUserSummary
  } | null
}) {
  return (
    <AlertDialog
      open={pendingChange !== null}
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Изменить роль пользователя?</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingChange
              ? `${pendingChange.user.email}: новая роль — ${pendingChange.role === 'admin' ? 'администратор' : 'участник'}. Все активные сессии пользователя будут завершены.`
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failureReason !== null && (
          <Alert variant="destructive">
            <AlertTitle>Роль не изменена</AlertTitle>
            <AlertDescription>{failureReason}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Отмена</AlertDialogCancel>
          <Button data-testid="role-change-confirm" disabled={isPending} onClick={onConfirm}>
            {isPending ? 'Меняем…' : 'Изменить роль'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
