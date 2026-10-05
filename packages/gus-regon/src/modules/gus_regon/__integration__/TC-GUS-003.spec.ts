import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  lookup,
  restoreIntegration,
  saveCredentials,
  setIntegrationEnabled,
  snapshotIntegration,
  VALID_NIP,
} from './helpers/fixtures'

/**
 * TC-GUS-003: fail-open lookup contract
 *
 * - Disabled integration → 200 { ok:false, reason:'not_configured' }.
 * - Production without an API key → 200 { ok:false, reason:'not_configured' }.
 * - Production with a rejected key → 200 { ok:false, reason:'unavailable' }, key never echoed.
 * - Test environment without a key (public GUS test key) → 200 with the test-registry
 *   company, or a fail-open miss when the GUS test endpoint is unreachable from CI.
 *
 * Self-contained: the integration state and credentials are restored in `finally`.
 * Skips itself when a real API key is configured or credentials cannot be read,
 * so it never clobbers a shared environment.
 */
test.describe('TC-GUS-003: GUS REGON fail-open lookup contract', () => {
  test('reports not_configured, fails open, and answers in Test without leaking credentials', async ({ request }) => {
    const token = await getAuthToken(request, 'superadmin')
    const snapshot = await snapshotIntegration(request, token)
    test.skip(snapshot.credentials === null, 'Integration credentials cannot be read on this environment')
    const existingKey = snapshot.credentials?.apiKey
    test.skip(typeof existingKey === 'string' && existingKey.length > 0, 'A GUS API key is already configured on this environment')

    try {
      await setIntegrationEnabled(request, token, false)
      const disabled = await lookup(request, token, VALID_NIP)
      expect(disabled.status()).toBe(200)
      expect(await disabled.json()).toEqual({ ok: false, reason: 'not_configured' })

      await saveCredentials(request, token, { environment: 'production', apiKey: '' })
      await setIntegrationEnabled(request, token, true)
      const missingKey = await lookup(request, token, VALID_NIP)
      expect(missingKey.status()).toBe(200)
      expect(await missingKey.json()).toEqual({ ok: false, reason: 'not_configured' })

      const secret = 'tc-gus-003-not-a-real-key'
      await saveCredentials(request, token, { environment: 'production', apiKey: secret })
      const rejected = await lookup(request, token, VALID_NIP)
      expect(rejected.status()).toBe(200)
      const rejectedRaw = await rejected.text()
      expect(rejectedRaw).not.toContain(secret)
      expect(JSON.parse(rejectedRaw)).toEqual({ ok: false, reason: 'unavailable' })

      await saveCredentials(request, token, { environment: 'test' })
      const response = await lookup(request, token, VALID_NIP)
      expect(response.status()).toBe(200)
      const body = (await response.json()) as { ok: boolean; reason?: string; company?: { nip: string; regon: string | null } }
      if (body.ok) {
        expect(body.company?.nip).toBe(VALID_NIP)
        expect(body.company?.regon).toBe('140182840')
      } else {
        expect(body.reason).toBe('unavailable')
      }
    } finally {
      await restoreIntegration(request, token, snapshot)
    }
  })
})
