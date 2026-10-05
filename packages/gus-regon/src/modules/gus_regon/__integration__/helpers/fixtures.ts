import { expect, type APIRequestContext } from '@playwright/test'
import { apiRequest } from '@open-mercato/core/helpers/integration/api'

export const INTEGRATION_ID = 'gus_regon'
/** Valid checksum; the real NIP of a test-registry record. */
export const VALID_NIP = '5252344078'
/** Invalid checksum. */
export const BAD_NIP = '5252344079'

export type IntegrationSnapshot = {
  isEnabled: boolean
  /** `null` when the credentials could not be read — callers must not mutate the environment then. */
  credentials: Record<string, unknown> | null
}

export async function getIntegrationDetail(request: APIRequestContext, token: string) {
  const response = await apiRequest(request, 'GET', `/api/integrations/${INTEGRATION_ID}`, { token })
  expect(response.status()).toBe(200)
  return (await response.json()) as {
    integration: { id: string; credentials?: { fields: Array<{ key: string; type: string }> } }
    state: { isEnabled: boolean }
    hasCredentials: boolean
  }
}

export async function snapshotIntegration(request: APIRequestContext, token: string): Promise<IntegrationSnapshot> {
  const detail = await getIntegrationDetail(request, token)
  const credentialsResponse = await apiRequest(request, 'GET', `/api/integrations/${INTEGRATION_ID}/credentials`, { token })
  const credentialsBody = credentialsResponse.ok()
    ? ((await credentialsResponse.json()) as { credentials?: Record<string, unknown> | null })
    : null
  return { isEnabled: detail.state.isEnabled, credentials: credentialsBody?.credentials ?? null }
}

export async function setIntegrationEnabled(request: APIRequestContext, token: string, isEnabled: boolean) {
  const response = await apiRequest(request, 'PUT', `/api/integrations/${INTEGRATION_ID}/state`, {
    token,
    data: { isEnabled },
  })
  expect(response.ok()).toBe(true)
}

export async function saveCredentials(request: APIRequestContext, token: string, credentials: Record<string, unknown>) {
  const response = await apiRequest(request, 'PUT', `/api/integrations/${INTEGRATION_ID}/credentials`, {
    token,
    data: { credentials },
  })
  expect(response.ok()).toBe(true)
}

export async function restoreIntegration(request: APIRequestContext, token: string, snapshot: IntegrationSnapshot) {
  // An empty object restores the "no credentials" state (treated as empty by the platform).
  await saveCredentials(request, token, snapshot.credentials ?? {})
  await setIntegrationEnabled(request, token, snapshot.isEnabled)
}

export async function lookup(request: APIRequestContext, token: string | null, nip?: string) {
  const path = nip === undefined ? '/api/gus_regon/lookup' : `/api/gus_regon/lookup?nip=${encodeURIComponent(nip)}`
  if (!token) return request.get(path.startsWith('http') ? path : `${process.env.BASE_URL?.trim() ?? ''}${path}`)
  return apiRequest(request, 'GET', path, { token })
}
