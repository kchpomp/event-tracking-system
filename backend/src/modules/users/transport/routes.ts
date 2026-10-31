import {
  adminDashboardResponseSchema,
  adminUserParamsSchema,
  adminUsersQuerySchema,
  adminUsersResponseSchema,
  apiErrorSchema,
  deleteUserResponseSchema,
  emailVerificationRequestResponseSchema,
  updateProfileRequestSchema,
  updateProfileResponseSchema,
  updateUserRoleRequestSchema,
  updateUserRoleResponseSchema,
} from '@event-tracking-system/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'

import { validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses, rateLimitErrorResponses } from '../../../http/openapi'
import type { AuthHttpEnv } from '../../auth'
import type { UsersService } from '../application/users-service'
import { executeUsers } from './errors'

const errorContent = {
  'application/json': {
    schema: apiErrorSchema,
  },
}

const bearerSecurity = [{ BearerAuth: [] }]

const updateProfileRoute = createRoute({
  method: 'patch',
  path: '/me',
  security: bearerSecurity,
  request: {
    body: {
      content: {
        'application/json': {
          schema: updateProfileRequestSchema,
        },
      },
    },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: updateProfileResponseSchema } },
      description: 'Updated current user profile',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
  },
})

const dashboardRoute = createRoute({
  method: 'get',
  path: '/dashboard',
  security: bearerSecurity,
  responses: {
    200: {
      content: { 'application/json': { schema: adminDashboardResponseSchema } },
      description: 'Administrator dashboard metrics',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Administrator access required' },
  },
})

const listUsersRoute = createRoute({
  method: 'get',
  path: '/users',
  security: bearerSecurity,
  request: {
    query: adminUsersQuerySchema,
  },
  responses: {
    ...rateLimitErrorResponses,
    200: {
      content: { 'application/json': { schema: adminUsersResponseSchema } },
      description: 'Paginated users',
    },
    400: { content: errorContent, description: 'Invalid query' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Administrator access required' },
  },
})

const updateRoleRoute = createRoute({
  method: 'patch',
  path: '/users/{userId}/role',
  security: bearerSecurity,
  request: {
    params: adminUserParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: updateUserRoleRequestSchema,
        },
      },
    },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: updateUserRoleResponseSchema } },
      description: 'Updated user role',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Administrator access required' },
    404: { content: errorContent, description: 'User not found' },
    409: { content: errorContent, description: 'Role update conflict' },
  },
})

const requestEmailVerificationRoute = createRoute({
  method: 'post',
  path: '/users/{userId}/email-verification',
  security: bearerSecurity,
  request: {
    params: adminUserParamsSchema,
  },
  responses: {
    ...ingressErrorResponses,
    202: {
      content: { 'application/json': { schema: emailVerificationRequestResponseSchema } },
      description: 'Verification email queued, or nothing to do for a verified address',
    },
    400: { content: errorContent, description: 'Invalid user id' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Administrator access required' },
    404: { content: errorContent, description: 'User not found' },
  },
})

const deleteUserRoute = createRoute({
  method: 'delete',
  path: '/users/{userId}',
  security: bearerSecurity,
  request: {
    params: adminUserParamsSchema,
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: deleteUserResponseSchema } },
      description: 'The account and everything it owned are deleted',
    },
    400: { content: errorContent, description: 'Invalid user id' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Administrator access required' },
    404: { content: errorContent, description: 'User not found' },
    409: { content: errorContent, description: 'An administrator cannot delete their own account' },
  },
})

type CreateUsersRoutesOptions = {
  adminUsersReadRateLimit: MiddlewareHandler<AuthHttpEnv>
  requireAdmin: MiddlewareHandler<AuthHttpEnv>
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  service: UsersService
}

export function createUsersRoutes({
  adminUsersReadRateLimit,
  requireAdmin,
  requireAuth,
  service,
}: CreateUsersRoutesOptions) {
  const userRoutes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })
  const adminRoutes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  userRoutes.use('*', requireAuth)
  userRoutes.openapi(updateProfileRoute, async (c) => {
    const result = await executeUsers(() =>
      service.updateProfile(c.var.user, c.req.valid('json')),
    )
    return c.json(result, 200)
  })

  adminRoutes.use('*', requireAuth)
  adminRoutes.use('*', requireAdmin)
  adminRoutes.use('/users', adminUsersReadRateLimit)
  adminRoutes.openapi(dashboardRoute, async (c) => c.json(await service.dashboard(), 200))
  adminRoutes.openapi(listUsersRoute, async (c) => {
    return c.json(await service.listUsers(c.req.valid('query')), 200)
  })
  adminRoutes.openapi(updateRoleRoute, async (c) => {
    const result = await executeUsers(() =>
      service.updateRole(
        c.var.user,
        c.req.valid('param').userId,
        c.req.valid('json'),
      ),
    )
    return c.json(result, 200)
  })

  adminRoutes.openapi(requestEmailVerificationRoute, async (c) => {
    const result = await executeUsers(() => service.requestEmailVerification(c.req.valid('param').userId))
    return c.json(result, 202)
  })
  adminRoutes.openapi(deleteUserRoute, async (c) => {
    const result = await executeUsers(() => service.deleteUser(c.var.user, c.req.valid('param').userId))
    return c.json(result, 200)
  })

  return { adminRoutes, userRoutes }
}
