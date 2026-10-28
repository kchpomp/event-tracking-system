import { z } from 'zod'

// The venue network screen («Сеть знакомств»): every participant is a circle with initials, every
// «Диффузия» connection is a line. The screen is shown to a whole room, so a node carries an id and
// initials and nothing else: no name, company, city or email, even for whoever opens DevTools.

/** At most two letters (first name, last name), or one neutral symbol when the profile has none. */
export const NETWORK_INITIALS_MAX = 2

export const networkNodeSchema = z
  .object({
    id: z.string(),
    initials: z.string().min(1).max(NETWORK_INITIALS_MAX),
  })
  .strict()

/** One unordered pair, as stored: `a` is the lower id. */
export const networkEdgeSchema = z.object({ a: z.string(), b: z.string() }).strict()

/** Participants only (never staff), oldest first, and the connections between them. */
export const networkResponseSchema = z
  .object({
    nodes: z.array(networkNodeSchema),
    edges: z.array(networkEdgeSchema),
  })
  .strict()

export type NetworkNode = z.infer<typeof networkNodeSchema>
export type NetworkEdge = z.infer<typeof networkEdgeSchema>
export type NetworkResponse = z.infer<typeof networkResponseSchema>
