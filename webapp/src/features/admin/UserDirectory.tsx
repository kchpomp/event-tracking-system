import { Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  userRoleSchema,
  type AdminUserSummary,
  type UserDto,
  type UserRole,
} from '@event-tracking-system/contracts'
import { useState, type FormEvent } from 'react'

import { DataTableFrame } from '@/components/dashboard'
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Item } from '@/components/ui/item'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Typography } from '@/components/typography'
import { useMediaQuery } from '@/hooks/use-media-query'
import { formatDate } from '@/platform/intl'
import { DeleteUserDialog } from './DeleteUserDialog'
import {
  adminUsersPagination,
  adminUsersViewState,
  deleteFailureReason,
  roleBlockedByUnverifiedEmail,
  roleLabel,
  roleMutationFeedback,
} from './model'
import {
  useAdminUsersQuery,
  useDeleteAdminUserMutation,
  useRequestUserEmailVerificationMutation,
  useUpdateAdminUserRoleMutation,
} from './queries'
import { RoleChangeDialog } from './RoleChangeDialog'

type PendingRoleChange = {
  role: UserRole
  user: AdminUserSummary
}

type DirectoryRowsProps = {
  currentUser: UserDto
  isRoleChangePending: boolean
  isSendingVerification: boolean
  onDelete: (user: AdminUserSummary) => void
  onRoleChange: (user: AdminUserSummary, role: UserRole) => void
  onSendVerification: (user: AdminUserSummary) => void
  users: ReadonlyArray<AdminUserSummary>
}

// Tailwind's `sm` breakpoint. The frame's toolbar and footer stack below it through `sm:`
// classes, so the rows switch on the same edge. Below it the three columns do not fit a phone,
// and a table squeezed into a column with CSS loses its semantics: `display` overrides drop the
// table from the accessibility tree and a hidden `<thead>` takes the column labels with it. So
// each viewport gets markup of its own kind: a real table, or a list whose fields carry labels.
const tableViewportQuery = '(min-width: 40rem)'

export function UserDirectory({ currentUser }: { currentUser: UserDto }) {
  const [draftQuery, setDraftQuery] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pendingRole, setPendingRole] = useState<PendingRoleChange | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AdminUserSummary | null>(null)
  const [deletedEmail, setDeletedEmail] = useState<string | null>(null)
  const [verificationSentTo, setVerificationSentTo] = useState<string | null>(null)
  const fitsTable = useMediaQuery(tableViewportQuery)
  const usersQuery = useAdminUsersQuery({
    q: query || undefined,
    page,
    pageSize: 20,
  })
  const roleMutation = useUpdateAdminUserRoleMutation()
  const deleteMutation = useDeleteAdminUserMutation()
  const verificationMutation = useRequestUserEmailVerificationMutation()
  const viewState = adminUsersViewState({
    isError: usersQuery.isError,
    isPending: usersQuery.isPending,
    itemCount: usersQuery.data?.items.length,
  })
  const mutationFeedback = roleMutationFeedback(roleMutation)
  const pagination = usersQuery.data
    ? adminUsersPagination(usersQuery.data)
    : null

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPage(1)
    setQuery(draftQuery.trim())
  }

  const requestRoleChange = (user: AdminUserSummary, role: UserRole) => {
    roleMutation.reset()
    setPendingRole({ role, user })
  }

  const confirmRoleChange = () => {
    if (!pendingRole) return
    roleMutation.mutate(
      { role: pendingRole.role, userId: pendingRole.user.id },
      { onSuccess: () => setPendingRole(null) },
    )
  }

  const sendVerification = (user: AdminUserSummary) => {
    setVerificationSentTo(null)
    verificationMutation.mutate(user.id, { onSuccess: () => setVerificationSentTo(user.email) })
  }

  const requestDelete = (user: AdminUserSummary) => {
    deleteMutation.reset()
    setDeletedEmail(null)
    setPendingDelete(user)
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    const { email, id } = pendingDelete
    deleteMutation.mutate(id, {
      onSuccess: () => {
        setDeletedEmail(email)
        setPendingDelete(null)
        // The last person of a page is gone: step back, or the page would be empty.
        if (page > 1 && usersQuery.data?.items.length === 1) setPage(page - 1)
      },
    })
  }

  const summary = usersQuery.data
    ? `Страница ${usersQuery.data.page} из ${pagination?.totalPages ?? 1} · пользователей: ${usersQuery.data.total}${
        pagination?.wasBounded
          ? ` · доступны первые ${pagination.reachableUsers} совпадений`
          : ''
      }`
    : viewState === 'error'
      ? 'Пользователи недоступны'
      : 'Загрузка пользователей'

  return (
    <>
      <div className="grid gap-4">
        {mutationFeedback?.kind === 'success' && (
          <Alert data-testid="role-change-success">
            <AlertTitle>Роль изменена</AlertTitle>
            <AlertDescription>
              {mutationFeedback.user.email}: теперь {roleLabel(mutationFeedback.user.role)}.
              Прежние сессии пользователя завершены.
            </AlertDescription>
          </Alert>
        )}

        {verificationSentTo !== null && (
          <Alert data-testid="user-verify-sent">
            <AlertTitle>Письмо отправлено</AlertTitle>
            <AlertDescription>
              {verificationSentTo}: после перехода по ссылке из письма можно назначить роль хостес или администратора.
            </AlertDescription>
          </Alert>
        )}
        {verificationMutation.isError && (
          <Alert variant="destructive">
            <AlertTitle>Письмо не отправлено</AlertTitle>
            <AlertDescription>Не удалось отправить письмо. Попробуйте ещё раз.</AlertDescription>
          </Alert>
        )}
        {deletedEmail !== null && (
          <Alert data-testid="user-delete-success">
            <AlertTitle>Пользователь удалён</AlertTitle>
            <AlertDescription>{deletedEmail}: аккаунт и его данные удалены.</AlertDescription>
          </Alert>
        )}

        <DataTableFrame
          description="Смена роли завершает все активные сессии пользователя."
          nextDisabled={!pagination?.canGoNext}
          onNext={() => setPage((current) => current + 1)}
          onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          previousDisabled={page <= 1}
          summary={summary}
          title="Пользователи"
          toolbar={
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={submitSearch}>
              <InputGroup>
                <InputGroupAddon>
                  <HugeiconsIcon aria-hidden icon={Search01Icon} strokeWidth={2} />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label="Поиск пользователей"
                  data-testid="user-search-input"
                  onChange={(event) => setDraftQuery(event.target.value)}
                  placeholder="Поиск по email или имени"
                  value={draftQuery}
                />
              </InputGroup>
              <Button data-testid="user-search-submit" type="submit">Найти</Button>
            </form>
          }
        >
          {viewState === 'loading' && <DirectoryLoading />}
          {viewState === 'error' && usersQuery.isError && (
            <DirectoryError
              error={usersQuery.error}
              onRetry={() => void usersQuery.refetch()}
            />
          )}
          {viewState === 'empty' && <DirectoryEmpty hasQuery={query.length > 0} />}
          {viewState === 'ready' && usersQuery.data && (
            fitsTable ? (
              <UserTable
                currentUser={currentUser}
                isRoleChangePending={roleMutation.isPending}
                isSendingVerification={verificationMutation.isPending}
                onDelete={requestDelete}
                onRoleChange={requestRoleChange}
                onSendVerification={sendVerification}
                users={usersQuery.data.items}
              />
            ) : (
              <UserList
                currentUser={currentUser}
                isRoleChangePending={roleMutation.isPending}
                isSendingVerification={verificationMutation.isPending}
                onDelete={requestDelete}
                onRoleChange={requestRoleChange}
                onSendVerification={sendVerification}
                users={usersQuery.data.items}
              />
            )
          )}
        </DataTableFrame>
      </div>

      <RoleChangeDialog
        failureReason={mutationFeedback?.kind === 'error' ? mutationFeedback.reason : null}
        isPending={roleMutation.isPending}
        onCancel={() => {
          roleMutation.reset()
          setPendingRole(null)
        }}
        onConfirm={confirmRoleChange}
        pendingChange={pendingRole}
      />

      <DeleteUserDialog
        failureReason={deleteMutation.isError ? deleteFailureReason(deleteMutation.error) : null}
        isPending={deleteMutation.isPending}
        onCancel={() => {
          deleteMutation.reset()
          setPendingDelete(null)
        }}
        onConfirm={confirmDelete}
        user={pendingDelete}
      />
    </>
  )
}

function UserTable({
  currentUser,
  isRoleChangePending,
  isSendingVerification,
  onDelete,
  onRoleChange,
  onSendVerification,
  users,
}: DirectoryRowsProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Пользователь</TableHead>
          <TableHead>Роль</TableHead>
          <TableHead>Создан</TableHead>
          <TableHead>
            <Typography as="span" variant="srOnly">
              Действия
            </Typography>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow data-testid="user-row" key={user.id}>
            <TableCell>
              <div className="grid">
                <Typography variant="bodySmMedium">
                  {user.displayName ?? user.email}
                </Typography>
                <Typography variant="caption" tone="muted">
                  {user.email}
                </Typography>
                <EmailVerifiedNote disabled={isSendingVerification} onSend={onSendVerification} user={user} />
              </div>
            </TableCell>
            <TableCell>
              <RoleSelect
                currentUser={currentUser}
                disabled={isRoleChangePending}
                onRoleChange={onRoleChange}
                user={user}
              />
            </TableCell>
            <TableCell>
              <Typography as="span" className="tabular-nums" variant="bodySm">
                {formatDate(user.createdAt)}
              </Typography>
            </TableCell>
            <TableCell>
              <DeleteUserButton currentUser={currentUser} onDelete={onDelete} user={user} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/**
 * The narrow counterpart of `UserTable`: one list item per user, each a definition list whose
 * terms name the fields the table names with column headers. "User" and "Role" are visible in
 * the values themselves and stay screen-reader only; "Created" is the one a bare date needs.
 */
function UserList({
  currentUser,
  isRoleChangePending,
  isSendingVerification,
  onDelete,
  onRoleChange,
  onSendVerification,
  users,
}: DirectoryRowsProps) {
  return (
    // Explicit `role="list"`: WebKit drops list semantics from an unstyled `<ul>`, and phones
    // are exactly where this markup renders.
    <ul aria-label="Пользователи" className="grid gap-3" role="list">
      {users.map((user) => (
        <Item asChild key={user.id} variant="outline">
          <li data-testid="user-row">
            <dl className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3">
              <div className="col-span-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b pb-3">
                <Typography as="dt" variant="srOnly">
                  Пользователь
                </Typography>
                <dd className="grid">
                  <Typography variant="bodySmMedium">
                    {user.displayName ?? user.email}
                  </Typography>
                  <Typography variant="caption" tone="muted" wrap="break">
                    {user.email}
                  </Typography>
                  <EmailVerifiedNote disabled={isSendingVerification} onSend={onSendVerification} user={user} />
                </dd>
                <Typography as="dt" variant="srOnly">
                  Действия
                </Typography>
                <dd>
                  <DeleteUserButton currentUser={currentUser} onDelete={onDelete} user={user} />
                </dd>
              </div>
              <div className="min-w-0">
                <Typography as="dt" variant="srOnly">
                  Роль
                </Typography>
                <dd>
                  <RoleSelect
                    currentUser={currentUser}
                    disabled={isRoleChangePending}
                    onRoleChange={onRoleChange}
                    user={user}
                  />
                </dd>
              </div>
              <div className="grid justify-items-end text-right">
                <Typography as="dt" variant="caption" tone="muted">
                  Создан
                </Typography>
                <Typography as="dd" variant="bodySm">
                  {formatDate(user.createdAt)}
                </Typography>
              </div>
            </dl>
          </li>
        </Item>
      ))}
    </ul>
  )
}

/** An administrator cannot delete their own account (the server refuses too). */
function DeleteUserButton({
  currentUser,
  onDelete,
  user,
}: {
  currentUser: UserDto
  onDelete: (user: AdminUserSummary) => void
  user: AdminUserSummary
}) {
  return (
    <Button
      aria-label={`Удалить: ${user.email}`}
      data-testid="user-delete"
      disabled={user.id === currentUser.id}
      onClick={() => onDelete(user)}
      size="sm"
      type="button"
      variant="destructive"
    >
      Удалить
    </Button>
  )
}

function RoleSelect({
  currentUser,
  disabled,
  onRoleChange,
  user,
}: {
  currentUser: UserDto
  disabled: boolean
  onRoleChange: (user: AdminUserSummary, role: UserRole) => void
  user: AdminUserSummary
}) {
  return (
    <Select
      disabled={disabled}
      onValueChange={(value) => {
        const parsedRole = userRoleSchema.safeParse(value)
        if (parsedRole.success && parsedRole.data !== user.role) {
          onRoleChange(user, parsedRole.data)
        }
      }}
      value={user.role}
    >
      <SelectTrigger
        aria-label={`Роль: ${user.email}`}
        className="w-full max-w-44 capitalize"
        data-testid="role-select"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem
          data-testid="role-option-user"
          disabled={user.id === currentUser.id && user.role === 'admin'}
          value="user"
        >
          Участник
        </SelectItem>
        <SelectItem
          data-testid="role-option-hostess"
          disabled={
            (user.id === currentUser.id && user.role === 'admin') ||
            roleBlockedByUnverifiedEmail(user, 'hostess')
          }
          value="hostess"
        >
          Хостес{roleBlockedByUnverifiedEmail(user, 'hostess') && unverifiedSuffix}
        </SelectItem>
        <SelectItem
          data-testid="role-option-screen"
          disabled={user.id === currentUser.id && user.role === 'admin'}
          value="screen"
        >
          Экран
        </SelectItem>
        <SelectItem
          data-testid="role-option-admin"
          disabled={roleBlockedByUnverifiedEmail(user, 'admin')}
          value="admin"
        >
          Администратор{roleBlockedByUnverifiedEmail(user, 'admin') && unverifiedSuffix}
        </SelectItem>
      </SelectContent>
    </Select>
  )
}

const unverifiedSuffix = ' — нужна подтверждённая почта'

/**
 * Hostess and admin need a verified email. Only the administrator sees this: for an unverified
 * account they send the confirmation email from here, and the person opens the link.
 */
function EmailVerifiedNote({
  disabled,
  onSend,
  user,
}: {
  disabled: boolean
  onSend: (user: AdminUserSummary) => void
  user: AdminUserSummary
}) {
  return (
    <span className="flex flex-wrap items-center gap-x-2">
      <Typography data-testid="user-email-verified" tone="muted" variant="caption">
        {user.emailVerified ? 'Почта подтверждена' : 'Почта не подтверждена'}
      </Typography>
      {!user.emailVerified && (
        <Button
          aria-label={`Отправить письмо подтверждения: ${user.email}`}
          className="h-auto p-0"
          data-testid="user-verify-send"
          disabled={disabled}
          onClick={() => onSend(user)}
          size="sm"
          type="button"
          variant="link"
        >
          Отправить письмо
        </Button>
      )}
    </span>
  )
}

function DirectoryLoading() {
  return (
    <div aria-label="Загрузка пользователей" className="grid gap-3 py-2" role="status">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  )
}

function DirectoryError({
  error,
  onRetry,
}: {
  error: Error
  onRetry: () => void
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Пользователи недоступны</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
      <AlertAction>
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          Повторить
        </Button>
      </AlertAction>
    </Alert>
  )
}

function DirectoryEmpty({ hasQuery }: { hasQuery: boolean }) {
  return (
    <Empty data-testid="user-directory-empty">
      <EmptyHeader>
        <EmptyTitle>Пользователи не найдены</EmptyTitle>
        <EmptyDescription>
          {hasQuery
            ? 'Попробуйте другое имя или email.'
            : 'Аккаунтов пока нет.'}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
