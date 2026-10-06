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
  StationReader,
  StationScanner,
} from '../application/ports'
import { EventFailure } from '../domain/errors'
import {
  connectionPoints,
  ideaPoints,
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
  EventAdmin

const LEADERBOARD_SIZE = 10

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
  company: true,
  city: true,
  email: true,
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

  return {
    async participant(userId) {
      const [user, totalPoints, ideasCount, connectionsCount] = await db.$transaction([
        db.user.findUnique({
          where: { id: userId },
          select: {
            firstName: true,
            lastName: true,
            company: true,
            city: true,
            personalQrToken: true,
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
        profile: user,
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
              { company: { contains: word, mode: 'insensitive' as const } },
              { city: { contains: word, mode: 'insensitive' as const } },
              { email: { contains: word, mode: 'insensitive' as const } },
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
        company: user.company,
        city: user.city,
        email: user.email,
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
          company: user.company,
          city: user.city,
          email: user.email,
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

    connect({ participantId, token }) {
      return db.$transaction(async (tx) => {
        const [me, other] = await Promise.all([
          tx.user.findUnique({
            where: { id: participantId },
            select: { city: true, company: true },
          }),
          tx.user.findUnique({
            where: { personalQrToken: token },
            select: { id: true, city: true, company: true },
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
      // Participants only (administrators never play), each with the ledger sum. People with
      // equal points share a rank; the row number breaks ties for the top-10 cut only.
      const rows = await db.$queryRaw<
        { rank: bigint; full_name: string; points: bigint; is_me: boolean }[]
      >(Prisma.sql`
        WITH scored AS (
          SELECT u.id,
                 COALESCE(
                   NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
                   NULLIF(BTRIM(u.display_name), ''),
                   'Участник'
                 ) AS full_name,
                 COALESCE(SUM(l.points_awarded), 0)::bigint AS points
          FROM users u
          LEFT JOIN activity_log l ON l.participant_id = u.id
          WHERE u.role = 'user'
          GROUP BY u.id
        ), ranked AS (
          SELECT s.*,
                 RANK() OVER (ORDER BY s.points DESC) AS rank,
                 ROW_NUMBER() OVER (ORDER BY s.points DESC, s.full_name, s.id) AS position
          FROM scored s
        )
        SELECT r.rank, r.full_name, r.points, (r.id = ${userId}::uuid) AS is_me
        FROM ranked r
        WHERE r.position <= ${LEADERBOARD_SIZE} OR r.id = ${userId}::uuid
        ORDER BY r.position
      `)
      return rows.map((row) => ({
        rank: Number(row.rank),
        fullName: row.full_name,
        totalPoints: Number(row.points),
        isMe: row.is_me,
      }))
    },

    async stationsWithTokens() {
      const event = await db.event.findFirst({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, isActive: true },
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

    async setEventActive(isActive) {
      const event = await db.event.findFirst({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      })
      if (!event) throw new EventFailure('not_found', 'There is no event yet')
      return db.event.update({
        where: { id: event.id },
        data: { isActive },
        select: { id: true, isActive: true },
      })
    },
  }
}
