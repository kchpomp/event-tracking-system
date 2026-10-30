import { z } from 'zod'

import { signedPhotoSchema } from './event'

// The venue network screen («Сеть знакомств»): every participant is a circle with initials, every
// «Диффузия» connection is a line. The screen is shown to a whole room, so a node carries an id and
// initials and a photo link and nothing else: no name, company, city or email, even for whoever opens DevTools.

/** At most two letters (first name, last name), or one neutral symbol when the profile has none. */
export const NETWORK_INITIALS_MAX = 2

export const networkNodeSchema = z
  .object({
    id: z.string(),
    initials: z.string().min(1).max(NETWORK_INITIALS_MAX),
    /** Same rule as team members and the profile: own avatar, else the guest-list photo; null for initials. */
    photo: signedPhotoSchema.nullable(),
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

// The «Колба идей» screen: who dropped an idea and when, never what the idea says.

/** The newest ideas the flask shows. */
export const FLASK_IDEAS_MAX = 40

export const flaskIdeaSchema = z
  .object({
    id: z.string(),
    createdAt: z.string().datetime({ offset: true }),
    participant: z
      .object({ fullName: z.string(), initials: z.string().min(1).max(NETWORK_INITIALS_MAX), photo: signedPhotoSchema.nullable() })
      .strict(),
  })
  .strict()

/** `ideas` is the latest `FLASK_IDEAS_MAX`, oldest first; `total` counts every idea. No idea text. */
export const flaskResponseSchema = z
  .object({ serverNow: z.string().datetime({ offset: true }), total: z.number().int().nonnegative(), ideas: z.array(flaskIdeaSchema) })
  .strict()

export type FlaskIdea = z.infer<typeof flaskIdeaSchema>
export type FlaskResponse = z.infer<typeof flaskResponseSchema>
