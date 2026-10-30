import type { DbClient } from '../../../db'
import type { NetworkReader } from '../application/ports'
import { FLASK_IDEAS_MAX } from '@event-tracking-system/contracts'
import { participantFullName, participantInitials } from '../domain/rules'

/**
 * The venue network screen's snapshot: every participant and every connection between two
 * participants. Staff are left out together with their links (a participant can scan a staff
 * member's personal QR). Both reads share one REPEATABLE READ snapshot, so an edge never names a
 * person the node list has not seen yet.
 *
 * A full snapshot rather than a delta: ~200 people and a few hundred connections are tens of
 * kilobytes, and a snapshot also carries a person who was deleted or became staff, which a
 * cursor over new rows would miss.
 */
export function createPrismaNetworkReader(db: DbClient): NetworkReader {
  return {
    async flask() {
      const [total, latest] = await db.$transaction(
        [
          db.idea.count(),
          db.idea.findMany({
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: FLASK_IDEAS_MAX,
            select: {
              id: true,
              createdAt: true,
              author: { select: { id: true, firstName: true, lastName: true, displayName: true } },
            },
          }),
        ],
        { isolationLevel: 'RepeatableRead' },
      )
      return {
        total,
        ideas: latest.reverse().map(({ id, createdAt, author }) => ({
          id,
          createdAt,
          author: { id: author.id, fullName: participantFullName(author), initials: participantInitials(author) },
        })),
      }
    },
    async network() {
      const [users, connections] = await db.$transaction(
        [
          db.user.findMany({
            where: { role: 'user' },
            // UUIDv7: sign-up order.
            orderBy: { id: 'asc' },
            select: { id: true, firstName: true, lastName: true, displayName: true },
          }),
          db.connection.findMany({
            where: { a: { is: { role: 'user' } }, b: { is: { role: 'user' } } },
            orderBy: { id: 'asc' },
            select: { participantA: true, participantB: true },
          }),
        ],
        { isolationLevel: 'RepeatableRead' },
      )

      return {
        nodes: users.map((user) => ({ id: user.id, initials: participantInitials(user) })),
        edges: connections.map((connection) => ({
          a: connection.participantA,
          b: connection.participantB,
        })),
      }
    },
  }
}
