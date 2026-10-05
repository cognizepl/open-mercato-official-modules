import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { GUS_REGON_INTEGRATION_ID } from '../../lib/config'
import { resolveGusStatus } from '../../lib/status'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['gus_regon.lookup'] },
}

type CredentialsService = {
  resolve: (id: string, scope: { organizationId: string; tenantId: string }) => Promise<Record<string, unknown> | null>
}

type StateService = {
  isEnabled: (id: string, scope: { organizationId: string; tenantId: string }) => Promise<boolean>
}

/**
 * GET /api/gus_regon/status
 *
 * Tells widgets whether to render: integration enabled, lookup usable, and
 * whether the built-in CRM company card is active. Never returns the key.
 */
export async function GET(req: Request) {
  const { translate } = await resolveTranslations()
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth || !auth.tenantId) throw new CrudHttpError(401, { error: translate('gus_regon.errors.unauthorized', 'Unauthorized') })
    const organizationId = auth.orgId ?? null
    if (!organizationId) throw new CrudHttpError(400, { error: translate('gus_regon.errors.organizationRequired', 'Organization scope is required') })
    const scope = { organizationId, tenantId: auth.tenantId }

    const container = await createRequestContainer()
    const stateService = container.resolve<StateService>('integrationStateService')
    const enabled = await stateService.isEnabled(GUS_REGON_INTEGRATION_ID, scope)
    const credentialsService = container.resolve<CredentialsService>('integrationCredentialsService')
    const credentials = await credentialsService.resolve(GUS_REGON_INTEGRATION_ID, scope)

    return NextResponse.json(resolveGusStatus(enabled, credentials))
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    console.error('[internal] gus_regon.status failed', err)
    return NextResponse.json({ error: translate('gus_regon.errors.internal', 'Internal server error') }, { status: 500 })
  }
}

const statusSchema = z.object({
  enabled: z.boolean(),
  environment: z.enum(['test', 'production']),
  hasApiKey: z.boolean(),
  lookupAvailable: z.boolean(),
  companyFormsRequested: z.boolean(),
  companyFormsActive: z.boolean(),
})
const errorSchema = z.object({ error: z.string() })

export const openApi: OpenApiRouteDoc = {
  tag: 'GUS REGON',
  summary: 'GUS REGON availability for the current organization',
  methods: {
    GET: {
      summary: 'Return whether the GUS lookup and the CRM company card are active',
      description:
        'Reads the organization\'s gus_regon integration state and credentials server-side and returns only booleans and the environment. The API key is never returned.',
      responses: [{ status: 200, description: 'Status', schema: statusSchema }],
      errors: [
        { status: 400, description: 'User without an organization', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
  },
}
