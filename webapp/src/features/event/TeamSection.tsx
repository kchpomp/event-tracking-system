import type { TeamMember } from '@event-tracking-system/contracts'

import { Typography } from '@/components/typography'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { membersWord } from './model'
import { LoadErrorState, LoadingState, PersonAvatar } from './parts'
import { useTeamMembersQuery } from './queries'

function EmptyState({ description, testId, title }: { description: string; testId: string; title: string }) {
  return (
    <Empty data-testid={testId}>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function MemberRow({ member }: { member: TeamMember }) {
  return (
    <Item data-me={member.isMe} data-testid="team-member" variant={member.isMe ? 'muted' : 'outline'}>
      <ItemMedia>
        <PersonAvatar
          firstName={member.firstName}
          lastName={member.lastName}
          photo={member.photo}
          testId="team-member-avatar"
        />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{member.fullName}</ItemTitle>
        {member.isMe && (
          <Typography as="span" data-testid="team-member-me" tone="primary" variant="caption">
            Это вы
          </Typography>
        )}
      </ItemContent>
      <ItemActions>
        <Typography className="tabular-nums" variant="bodySmMedium">
          {member.totalPoints}
          <Typography as="span" tone="muted" variant="bodyXs">
            {' '}
            оч
          </Typography>
        </Typography>
      </ItemActions>
    </Item>
  )
}

/** «Моя команда» inside the profile: the team name, everyone with a photo or initials and their points. */
export function TeamSection() {
  const query = useTeamMembersQuery()
  if (query.isPending) return <LoadingState />
  if (query.isError) return <LoadErrorState onRetry={() => void query.refetch()} />

  const { members, team } = query.data
  if (team === null) {
    return (
      <EmptyState
        description="Хостес добавит вас в команду на мероприятии."
        testId="team-none"
        title="Команда не назначена"
      />
    )
  }
  return (
    <section className="grid gap-3">
      <div className="grid gap-1">
        <Typography as="h2" data-testid="team-name" variant="h5">
          {team.name}
        </Typography>
        <Typography tone="muted" variant="bodySm">
          {membersWord(members.length)}
        </Typography>
      </div>
      {members.length === 0 ? (
        <EmptyState description="Пока в команде никого нет." testId="team-members-empty" title="Нет участников" />
      ) : (
        <ItemGroup className="gap-2" data-testid="team-members">
          {members.map((member) => (
            <MemberRow key={member.id} member={member} />
          ))}
        </ItemGroup>
      )}
    </section>
  )
}
