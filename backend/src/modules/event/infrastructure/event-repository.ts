import { HOSTESS_SEARCH_LIMIT, POLYMER_GROUP } from '@event-tracking-system/contracts'

import { acquireParticipantScoringLock, type DbClient } from '../../../db'
import { Prisma } from '../../../generated/prisma/client'
import type {
  ConnectionMaker,
  EventAdmin,
  HostessDesk,
  IdeaWriter,
  LeaderboardReader,
  ParticipantReader,
  PhotoSourceReader,
  PlannedParticipantsAdmin,
  RegistrationReader,
  StationReader,
  StationScanner,
  TeamReader,
} from '../application/ports'
import { EventFailure } from '../domain/errors'
import {
  BADGE_MIN_ACTIVITIES,
  BADGE_POINTS,
  completedActivities,
  connectionPoints,
  ideaPoints,
  listedNameMatches,
  orderedPair,
  participantFullName,
  sameCityAndCompany,
  searchWords,
} from '../domain/rules'

type EventRepository = ParticipantReader &
  StationReader &
  StationScanner &
  ConnectionMaker &
  IdeaWriter &
  LeaderboardReader &
  HostessDesk &
  EventAdmin &
  RegistrationReader &
  PlannedParticipantsAdmin &
  PhotoSourceReader &
  TeamReader

const LEADERBOARD_SIZE = 10
/** Lifetime ceiling of `team_bonus` points per participant, whatever the award keys. */
const TEAM_BONUS_MAX_PER_PARTICIPANT = 100

const scheduledTeamSelect = { id: true, name: true, startsAt: true, endsAt: true } as const

function toScheduledTeam(team: { id: string; name: string; startsAt: Date | null; endsAt: Date | null }) {
  return {
    id: team.id,
    name: team.name,
    startsAt: team.startsAt?.toISOString() ?? null,
    endsAt: team.endsAt?.toISOString() ?? null,
  }
}

const stationScoringSelect = {
  id: true,
  points: true,
  isActive: true,
  displayGroup: true,
  successMessage: true,
  event: { select: { isActive: true } },
} as const

type ScoringStation = Prisma.StationGetPayload<{ select: typeof stationScoringSelect }>

const hostessParticipantSelect = {
  id: true,
  firstName: true,
  lastName: true,
  displayName: true,
  company: { select: { name: true } },
  city: { select: { name: true } },
} as const

export function createPrismaEventRepository(db: DbClient): EventRepository {
  const pointsOf = async (tx: Pick<DbClient, 'activityLog'>, participantId: string) =>
    (
      await tx.activityLog.aggregate({
        where: { participantId },
        _sum: { pointsAwarded: true },
      })
    )._sum.pointsAwarded ?? 0

  const stationsFor = async (userId: string) => {
    const [stations, visits] = await db.$transaction([
      db.station.findMany({
        where: { isActive: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true, points: true, displayGroup: true },
      }),
      db.stationVisit.findMany({
        where: { participantId: userId },
        select: { stationId: true },
      }),
    ])
    const visited = new Set(visits.map((visit) => visit.stationId))
    return stations.map((station) => ({ ...station, visited: visited.has(station.id) }))
  }

  /**
   * The one place a station is scored: the participant's own scan (`awardedById` null) and a
   * hostess's award on their behalf run the same rules. The caller holds the participant's lock.
   */
  const scoreStation = async (
    tx: Pick<DbClient, 'activityLog' | 'stationVisit'>,
    participantId: string,
    station: ScoringStation,
    awardedById: string | null,
  ) => {
    if (!station.isActive) throw new EventFailure('station_inactive', 'Station is not active')
    if (!station.event.isActive) throw new EventFailure('event_inactive', 'Event is not active')

    // One award for the whole "Полимер решений" game, whichever of its ten QR codes is
    // scanned; every other station is awarded once per station.
    const polymer = station.displayGroup === POLYMER_GROUP
    const alreadyCompleted = polymer
      ? (await tx.activityLog.count({ where: { participantId, actionType: 'polymer' } })) > 0
      : (await tx.stationVisit.count({
          where: { participantId, stationId: station.id },
        })) > 0

    if (!alreadyCompleted) {
      await tx.stationVisit.create({ data: { participantId, stationId: station.id } })
      await tx.activityLog.create({
        data: {
          participantId,
          actionType: polymer ? 'polymer' : 'station_scan',
          pointsAwarded: station.points,
          refId: station.id,
          awardedById,
        },
      })
    }

    return {
      pointsAwarded: alreadyCompleted ? 0 : station.points,
      totalPoints: await pointsOf(tx, participantId),
      alreadyCompleted,
      successMessage: station.successMessage,
    }
  }

  /** Badge progress from the ledger alone. Names are for the participant's own list. */
  const badgeProgress = async (tx: Pick<DbClient, 'activityLog' | 'station'>, participantId: string) => {
    const rows = await tx.activityLog.findMany({
      where: { participantId },
      orderBy: { id: 'asc' },
      select: { actionType: true, refId: true },
    })
    const activities = completedActivities(rows)
    const stations = await tx.station.findMany({
      where: { id: { in: activities.filter((a) => a.kind === 'station_scan').map((a) => a.refId) } },
      select: { id: true, name: true },
    })
    const names = new Map(stations.map((station) => [station.id, station.name]))
    const issued = rows.some((row) => row.actionType === 'badge')
    return {
      completed: activities.length,
      required: BADGE_MIN_ACTIVITIES,
      eligible: activities.length >= BADGE_MIN_ACTIVITIES,
      issued,
      points: issued ? BADGE_POINTS : 0,
      activities: activities.map((a) => ({
        name:
          a.kind === 'station_scan'
            ? (names.get(a.refId) ?? 'Станция')
            : { polymer: 'Полимер решений', connection: 'Диффузия', idea: 'Колба идей' }[a.kind],
      })),
    }
  }

  const hostessBadge = async (tx: Pick<DbClient, 'activityLog' | 'station' | 'user'>, participantId: string) => {
    const user = await tx.user.findFirst({
      where: { id: participantId, role: 'user' },
      select: hostessParticipantSelect,
    })
    if (!user) return null
    const { activities: _names, ...status } = await badgeProgress(tx, participantId)
    return { participant: { id: user.id, fullName: participantFullName(user) }, ...status }
  }

  return {
    badge: (userId) => badgeProgress(db, userId),

    badgeStatus: (participantId) => hostessBadge(db, participantId),

    issueBadge({ participantId, awardedById }) {
      return db.$transaction(async (tx) => {
        await acquireParticipantScoringLock(tx, participantId)
        const current = await hostessBadge(tx, participantId)
        if (!current) throw new EventFailure('not_found', 'Participant not found')
        const event = await tx.event.findFirst({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true, isActive: true },
        })
        if (!event) throw new EventFailure('not_found', 'Event not found')
        if (!event.isActive) throw new EventFailure('event_inactive', 'Event is not active')
        if (current.issued) throw new EventFailure('badge_issued', 'Значок уже выдан')
        if (!current.eligible) {
          throw new EventFailure(
            'badge_not_eligible',
            `Не хватает активностей: пройдено ${current.completed} из ${current.required}`,
          )
        }
        await tx.activityLog.create({
          data: {
            participantId,
            actionType: 'badge',
            pointsAwarded: BADGE_POINTS,
            refId: event.id,
            awardedById,
          },
        })
        return { ...current, issued: true, points: BADGE_POINTS }
      })
    },

    async participant(userId) {
      const [user, totalPoints, ideasCount, connectionsCount] = await db.$transaction([
        db.user.findUnique({
          where: { id: userId },
          select: {
            firstName: true,
            lastName: true,
            company: { select: { name: true } },
            city: { select: { name: true } },
            personalQrToken: true,
            team: { select: { id: true, name: true } },
          },
        }),
        db.activityLog.aggregate({
          where: { participantId: userId },
          _sum: { pointsAwarded: true },
        }),
        db.idea.count({ where: { authorId: userId } }),
        db.connection.count({
          where: { OR: [{ participantA: userId }, { participantB: userId }] },
        }),
      ])
      if (!user) return null
      return {
        profile: {
          firstName: user.firstName,
          lastName: user.lastName,
          company: user.company?.name ?? null,
          city: user.city?.name ?? null,
          team: user.team,
          personalQrToken: user.personalQrToken,
        },
        progress: {
          totalPoints: totalPoints._sum.pointsAwarded ?? 0,
          ideasCount,
          connectionsCount,
        },
      }
    },

    stations: stationsFor,

    scan({ participantId, token }) {
      return db.$transaction(async (tx) => {
        await acquireParticipantScoringLock(tx, participantId)

        const station = await tx.station.findUnique({
          where: { qrToken: token },
          select: stationScoringSelect,
        })
        if (!station) throw new EventFailure('invalid_station_token', 'Unknown station code')
        return scoreStation(tx, participantId, station, null)
      })
    },

    async searchParticipants(query) {
      // Every word must match somewhere: «Анна Петрова» is first name AND last name.
      const users = await db.user.findMany({
        where: {
          role: 'user',
          AND: searchWords(query).map((word) => ({
            OR: [
              { firstName: { contains: word, mode: 'insensitive' as const } },
              { lastName: { contains: word, mode: 'insensitive' as const } },
              { company: { is: { name: { contains: word, mode: 'insensitive' as const } } } },
              { city: { is: { name: { contains: word, mode: 'insensitive' as const } } } },
            ],
          })),
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        take: HOSTESS_SEARCH_LIMIT,
        select: hostessParticipantSelect,
      })
      const sums = await db.activityLog.groupBy({
        by: ['participantId'],
        where: { participantId: { in: users.map((user) => user.id) } },
        _sum: { pointsAwarded: true },
      })
      const totals = new Map(sums.map((row) => [row.participantId, row._sum.pointsAwarded ?? 0]))
      return users.map((user) => ({
        id: user.id,
        fullName: participantFullName(user),
        company: user.company?.name ?? null,
        city: user.city?.name ?? null,
        totalPoints: totals.get(user.id) ?? 0,
      }))
    },

    async participantIdByToken(token) {
      const user = await db.user.findUnique({
        where: { personalQrToken: token },
        select: { id: true, role: true },
      })
      return user?.role === 'user' ? user.id : null
    },

    async participantDetail(participantId) {
      const user = await db.user.findFirst({
        where: { id: participantId, role: 'user' },
        select: hostessParticipantSelect,
      })
      if (!user) return null
      const [totalPoints, stations] = await Promise.all([
        pointsOf(db, participantId),
        stationsFor(participantId),
      ])
      return {
        participant: {
          id: user.id,
          fullName: participantFullName(user),
          company: user.company?.name ?? null,
          city: user.city?.name ?? null,
          totalPoints,
        },
        stations,
      }
    },

    awardStation({ participantId, stationId, awardedById }) {
      return db.$transaction(async (tx) => {
        await acquireParticipantScoringLock(tx, participantId)

        const participant = await tx.user.findFirst({
          where: { id: participantId, role: 'user' },
          select: { id: true },
        })
        if (!participant) throw new EventFailure('not_found', 'Participant not found')
        const station = await tx.station.findUnique({
          where: { id: stationId },
          select: stationScoringSelect,
        })
        if (!station) throw new EventFailure('not_found', 'Station not found')

        const { pointsAwarded, totalPoints, alreadyCompleted } = await scoreStation(
          tx,
          participantId,
          station,
          awardedById,
        )
        return { pointsAwarded, totalPoints, alreadyCompleted }
      })
    },

    awardTeam({ teamId, points, awardKey, awardedById }) {
      return db.$transaction(async (tx) => {
        const team = await tx.team.findUnique({ where: { id: teamId }, select: { id: true } })
        if (!team) throw new EventFailure('not_found', 'Team not found')
        // Lock every member (lowest id first) and read the roster again under the locks, so a
        // concurrent role change cannot leave a staff account in it. Same lock as `updateRole`.
        const roster = { where: { teamId, role: 'user' as const }, select: { id: true }, orderBy: { id: 'asc' as const } }
        for (const { id } of await tx.user.findMany(roster)) await acquireParticipantScoringLock(tx, id)
        const members = await tx.user.findMany(roster)
        if (members.length === 0) throw new EventFailure('team_empty', 'The team has no participants')

        // A member who would pass the lifetime cap gets nothing; `awarded` shows how many got a row.
        const given = await tx.activityLog.groupBy({
          by: ['participantId'],
          where: {
            participantId: { in: members.map((member) => member.id) },
            actionType: 'team_bonus',
            NOT: { refId: awardKey },
          },
          _sum: { pointsAwarded: true },
        })
        const total = new Map(given.map((row) => [row.participantId, row._sum.pointsAwarded ?? 0]))
        const eligible = members.filter((member) => (total.get(member.id) ?? 0) + points <= TEAM_BONUS_MAX_PER_PARTICIPANT)

        // The unique (participant, action, ref) row is the idempotency key: a repeat of the award
        // key skips every row it already wrote, so `awarded` is the number of NEW rows.
        const { count } = await tx.activityLog.createMany({
          data: eligible.map((member) => ({
            participantId: member.id,
            actionType: 'team_bonus' as const,
            pointsAwarded: points,
            refId: awardKey,
            awardedById,
          })),
          skipDuplicates: true,
        })
        return { teamId, points, memberCount: members.length, awarded: count }
      })
    },

    async teamMembers(userId) {
      const me = await db.user.findUnique({
        where: { id: userId },
        select: { team: { select: { id: true, name: true } } },
      })
      if (!me?.team) return { team: null, members: [] }
      const users = await db.user.findMany({
        where: { teamId: me.team.id, role: 'user' },
        select: { id: true, firstName: true, lastName: true, displayName: true },
      })
      const sums = await db.activityLog.groupBy({
        by: ['participantId'],
        where: { participantId: { in: users.map((user) => user.id) } },
        _sum: { pointsAwarded: true },
      })
      const totals = new Map(sums.map((row) => [row.participantId, row._sum.pointsAwarded ?? 0]))
      const members = users
        .map((user) => ({
          id: user.id,
          fullName: participantFullName(user),
          firstName: user.firstName,
          lastName: user.lastName,
          totalPoints: totals.get(user.id) ?? 0,
        }))
        .sort((a, b) => b.totalPoints - a.totalPoints || a.fullName.localeCompare(b.fullName, 'ru'))
      return { team: me.team, members }
    },

    async teams() {
      const teams = await db.team.findMany({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true, _count: { select: { users: { where: { role: 'user' } } } } },
      })
      return teams.map(({ _count, ...team }) => ({ ...team, memberCount: _count.users }))
    },

    async schedule() {
      const teams = await db.team.findMany({ select: { id: true, name: true, startsAt: true, endsAt: true } })
      return teams
        .sort(
          (a, b) =>
            (a.startsAt?.getTime() ?? Infinity) - (b.startsAt?.getTime() ?? Infinity) ||
            a.name.localeCompare(b.name, 'ru'),
        )
        .map(toScheduledTeam)
    },

    async live() {
      const event = await db.event.findFirst({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { liveOverride: true, liveTeamId: true },
      })
      return { override: event?.liveOverride ?? false, teamId: event?.liveTeamId ?? null }
    },

    async setLive(input) {
      const event = await db.event.findFirst({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      })
      if (!event) throw new EventFailure('not_found', 'There is no event yet')
      if (input.mode === 'team' && !(await db.team.findUnique({ where: { id: input.teamId }, select: { id: true } }))) {
        throw new EventFailure('not_found', 'Team not found')
      }
      const updated = await db.event.update({
        where: { id: event.id },
        data:
          input.mode === 'auto'
            ? { liveOverride: false, liveTeamId: null }
            : { liveOverride: true, liveTeamId: input.mode === 'team' ? input.teamId : null },
        select: { liveOverride: true, liveTeamId: true },
      })
      return { override: updated.liveOverride, teamId: updated.liveTeamId }
    },

    async adminTeams() {
      const teams = await db.team.findMany({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: { ...scheduledTeamSelect, _count: { select: { users: { where: { role: 'user' } } } } },
      })
      return teams.map(({ _count, ...team }) => ({ ...toScheduledTeam(team), memberCount: _count.users }))
    },

    async setTeamSchedule(teamId, { startsAt, endsAt }) {
      const data = { startsAt: startsAt && new Date(startsAt), endsAt: endsAt && new Date(endsAt) }
      try {
        const { _count, ...team } = await db.team.update({
          where: { id: teamId },
          data,
          select: { ...scheduledTeamSelect, _count: { select: { users: { where: { role: 'user' } } } } },
        })
        return { ...toScheduledTeam(team), memberCount: _count.users }
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          throw new EventFailure('not_found', 'Team not found')
        }
        throw error
      }
    },

    connect({ participantId, token }) {
      return db.$transaction(async (tx) => {
        const [me, other] = await Promise.all([
          tx.user.findUnique({
            where: { id: participantId },
            select: { cityId: true, companyId: true },
          }),
          tx.user.findUnique({
            where: { personalQrToken: token },
            select: { id: true, cityId: true, companyId: true },
          }),
        ])
        if (!me) throw new EventFailure('not_found', 'Participant not found')
        if (!other) throw new EventFailure('invalid_participant_token', 'Unknown participant code')
        if (other.id === participantId) {
          throw new EventFailure('self_connection', 'You cannot connect with yourself')
        }
        if (sameCityAndCompany(me, other)) {
          throw new EventFailure(
            'same_city_and_company',
            'Participants from the same city and company cannot connect',
          )
        }

        // Both people are locked, lowest id first, so their "first 3 connections score" counts
        // cannot race and two people scanning each other cannot deadlock.
        const [participantA, participantB] = orderedPair(participantId, other.id)
        await acquireParticipantScoringLock(tx, participantA)
        await acquireParticipantScoringLock(tx, participantB)

        const existing = await tx.connection.findUnique({
          where: { participantA_participantB: { participantA, participantB } },
          select: { id: true },
        })
        if (!existing) {
          const connection = await tx.connection.create({
            data: { participantA, participantB },
            select: { id: true },
          })
          for (const person of [participantA, participantB]) {
            const earlier = await tx.activityLog.count({
              where: { participantId: person, actionType: 'connection' },
            })
            await tx.activityLog.create({
              data: {
                participantId: person,
                actionType: 'connection',
                pointsAwarded: connectionPoints(earlier),
                refId: connection.id,
              },
            })
          }
        }

        return {
          connectionsCount: await tx.connection.count({
            where: { OR: [{ participantA: participantId }, { participantB: participantId }] },
          }),
          alreadyConnected: existing !== null,
        }
      })
    },

    addIdea({ authorId, ...idea }) {
      return db.$transaction(async (tx) => {
        await acquireParticipantScoringLock(tx, authorId)
        const earlier = await tx.activityLog.count({
          where: { participantId: authorId, actionType: 'idea' },
        })
        const created = await tx.idea.create({ data: { authorId, ...idea }, select: { id: true } })
        await tx.activityLog.create({
          data: {
            participantId: authorId,
            actionType: 'idea',
            pointsAwarded: ideaPoints(earlier),
            refId: created.id,
          },
        })
        return { ideasCount: await tx.idea.count({ where: { authorId } }) }
      })
    },

    async leaderboard(userId) {
      // Participants only (administrators never play), each with the ledger sum. Places are
      // distinct: more points first, then whoever scored their latest points EARLIER. The ledger
      // has no timestamp column, but its ids are UUIDv7 (time-ordered), so the greatest id among
      // the rows that gave points marks the moment the person reached their current total.
      // People with no points yet are ordered by sign-up time.
      const rows = await db.$queryRaw<
        { place: bigint; full_name: string; points: bigint; is_me: boolean }[]
      >(Prisma.sql`
        WITH scored AS (
          SELECT u.id,
                 COALESCE(
                   NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
                   NULLIF(BTRIM(u.display_name), ''),
                   'Участник'
                 ) AS full_name,
                 COALESCE(SUM(l.points_awarded), 0)::bigint AS points,
                 MAX(l.id::text) FILTER (WHERE l.points_awarded > 0) AS last_scored,
                 u.created_at AS joined_at
          FROM users u
          LEFT JOIN activity_log l ON l.participant_id = u.id
          WHERE u.role = 'user'
          GROUP BY u.id
        ), ranked AS (
          SELECT s.*,
                 ROW_NUMBER() OVER (
                   ORDER BY s.points DESC, s.last_scored ASC NULLS LAST, s.joined_at, s.id
                 ) AS place
          FROM scored s
        )
        SELECT r.place, r.full_name, r.points, (r.id = ${userId}::uuid) AS is_me
        FROM ranked r
        WHERE r.place <= ${LEADERBOARD_SIZE} OR r.id = ${userId}::uuid
        ORDER BY r.place
      `)
      return rows.map((row) => ({
        rank: Number(row.place),
        fullName: row.full_name,
        totalPoints: Number(row.points),
        isMe: row.is_me,
      }))
    },

    async stationsWithTokens() {
      const event = await db.event.findFirst({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, isActive: true, registrationOpen: true },
      })
      const stations = await db.station.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          name: true,
          points: true,
          displayGroup: true,
          isActive: true,
          qrToken: true,
        },
      })
      return { event, stations }
    },

    async setEventState({ isActive, registrationOpen }) {
      const event = await db.event.findFirst({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      })
      if (!event) throw new EventFailure('not_found', 'There is no event yet')
      return db.event.update({
        where: { id: event.id },
        data: { isActive, registrationOpen },
        select: { id: true, isActive: true, registrationOpen: true },
      })
    },

    async registrationOpen() {
      const event = await db.event.findFirst({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { registrationOpen: true },
      })
      return event?.registrationOpen ?? true
    },

    async referenceLists() {
      // The standing lists plus whatever a list import added; never a row of the list itself.
      const orderBy = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }]
      const select = { id: true, name: true }
      const [companies, cities] = await db.$transaction([
        db.company.findMany({ orderBy, select }),
        db.city.findMany({ orderBy, select }),
      ])
      return { companies, cities }
    },

    async plannedParticipants() {
      // Matched by email, not by a key: the list is loaded before anyone has an account. Emails
      // are stored lower-case on both sides. People who have not signed up come first.
      const [rows, participantAccounts, hostessAccounts] = await Promise.all([
        db.$queryRaw<
          {
            id: string
            email: string
            first_name: string | null
            last_name: string | null
            department: string | null
            city: string | null
            kind: 'participant' | 'hostess'
            registered_at: Date | null
            role: 'user' | 'admin' | 'hostess' | 'screen' | null
            user_id: string | null
            has_photo: boolean
            account_first_name: string | null
            account_last_name: string | null
          }[]
        >(Prisma.sql`
          SELECT p.id, p.email, p.first_name, p.last_name, p.department, p.city, p.kind::text AS kind,
                 u.created_at AS registered_at, u.role::text AS role,
                 u.id AS user_id, u.first_name AS account_first_name, u.last_name AS account_last_name,
                 p.photo_object_key IS NOT NULL AS has_photo
          FROM planned_participants p
          LEFT JOIN users u ON u.email = p.email
          ORDER BY (u.id IS NOT NULL), p.last_name NULLS LAST, p.first_name NULLS LAST, p.email
        `),
        db.user.count({ where: { role: 'user' } }),
        db.user.count({ where: { role: 'hostess' } }),
      ])
      const items = rows.map((row) => ({
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        department: row.department,
        city: row.city,
        kind: row.kind,
        registered: row.registered_at !== null,
        registeredAt: row.registered_at?.toISOString() ?? null,
        role: row.role,
        userId: row.user_id,
        hasPhoto: row.has_photo,
        accountName:
          row.user_id === null
            ? null
            : [row.account_first_name, row.account_last_name].filter(Boolean).join(' ') || null,
        nameMatches:
          row.user_id === null
            ? null
            : listedNameMatches([row.first_name, row.last_name].filter(Boolean).join(' '), {
                firstName: row.account_first_name,
                lastName: row.account_last_name,
              }),
      }))
      const summary = (kind: 'participant' | 'hostess', actual: number) => {
        const own = items.filter((item) => item.kind === kind)
        return {
          planned: own.length,
          registered: own.filter((item) => item.registered).length,
          actual,
        }
      }
      return {
        items,
        participants: summary('participant', participantAccounts),
        hostesses: summary('hostess', hostessAccounts),
      }
    },

    async importPlanned(kind, entries) {
      // One transaction; the caller passes each email once. A repeat import replaces the five
      // columns, and a person already listed under the other kind moves to this one. Departments
      // and cities become reference rows (existing ones are kept, so ids and sign-ups stay valid).
      const departments = [...new Set(entries.map((entry) => entry.department))]
      const cities = [...new Set(entries.map((entry) => entry.city))]
      const [, , rows] = await db.$transaction([
        db.$executeRaw(Prisma.sql`
          INSERT INTO companies (name) SELECT unnest(${departments}::text[]) ON CONFLICT (name) DO NOTHING
        `),
        db.$executeRaw(Prisma.sql`
          INSERT INTO cities (name) SELECT unnest(${cities}::text[]) ON CONFLICT (name) DO NOTHING
        `),
        db.$queryRaw<{ inserted: boolean }[]>(Prisma.sql`
          INSERT INTO planned_participants (email, first_name, last_name, department, city, kind)
          SELECT e.email, e.first_name, e.last_name, e.department, e.city, ${kind}::planned_kind
          FROM unnest(
            ${entries.map((entry) => entry.email)}::text[],
            ${entries.map((entry) => entry.firstName)}::text[],
            ${entries.map((entry) => entry.lastName)}::text[],
            ${entries.map((entry) => entry.department)}::text[],
            ${entries.map((entry) => entry.city)}::text[]
          ) AS e(email, first_name, last_name, department, city)
          ON CONFLICT (email) DO UPDATE
            SET first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                department = EXCLUDED.department,
                city = EXCLUDED.city,
                kind = EXCLUDED.kind
          RETURNING (xmax = 0) AS inserted
        `),
      ])
      const added = rows.filter((row) => row.inserted).length
      return { added, updated: rows.length - added }
    },

    async removePlanned(id) {
      const rows = await db.$queryRaw<{ photo_object_key: string | null }[]>(
        Prisma.sql`DELETE FROM planned_participants WHERE id = ${id}::uuid RETURNING photo_object_key`,
      )
      return rows[0] ? { photoObjectKey: rows[0].photo_object_key } : null
    },

    async plannedByEmails(emails) {
      const rows = await db.plannedParticipant.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true, photoObjectKey: true },
      })
      return rows
    },

    async setPhoto(id, photo) {
      // One statement, so the old key is read and replaced atomically; a key that already
      // belongs to another row matches nothing (the unique index would otherwise fail it).
      const rows = await db.$queryRaw<{ previous_key: string | null }[]>(Prisma.sql`
        WITH old AS (
          SELECT id, photo_object_key FROM planned_participants WHERE id = ${id}::uuid FOR UPDATE
        )
        UPDATE planned_participants p
        SET photo_object_key = ${photo.objectKey},
            photo_content_type = ${photo.contentType},
            photo_byte_size = ${photo.byteSize}
        FROM old
        WHERE p.id = old.id
          AND NOT EXISTS (
            SELECT 1 FROM planned_participants o
            WHERE o.photo_object_key = ${photo.objectKey} AND o.id <> old.id
          )
        RETURNING old.photo_object_key AS previous_key
      `)
      return rows[0] ? { previousKey: rows[0].previous_key } : null
    },

    async photoSources(userIds) {
      const rows = await db.$queryRaw<
        {
          user_id: string
          first_name: string | null
          last_name: string | null
          avatar_key: string | null
          planned_key: string | null
          planned_name: string | null
        }[]
      >(Prisma.sql`
        SELECT u.id AS user_id, u.first_name, u.last_name,
               (SELECT a.object_key FROM user_avatars a
                WHERE a.user_id = u.id AND a.state::text = 'ready' LIMIT 1) AS avatar_key,
               p.photo_object_key AS planned_key,
               NULLIF(concat_ws(' ', p.first_name, p.last_name), '') AS planned_name
        FROM users u
        LEFT JOIN planned_participants p ON p.email = lower(u.email)
        WHERE u.id = ANY(${userIds}::uuid[])
      `)
      return rows.map((row) => ({
        userId: row.user_id,
        firstName: row.first_name,
        lastName: row.last_name,
        avatarKey: row.avatar_key,
        plannedKey: row.planned_key,
        plannedName: row.planned_name,
      }))
    },
  }
}
