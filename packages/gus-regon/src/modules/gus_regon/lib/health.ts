import { createGusClient, type GusRequest } from './client'
import { resolveGusConfig } from './config'

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy'
  message: string
  details: Record<string, unknown>
  checkedAt: Date
}

/**
 * Health check wired through `integration.ts → healthCheck.service`.
 * A successful `Zaloguj` proves the endpoint is reachable and the key is valid.
 */
export function createGusRegonHealthCheck(request?: GusRequest) {
  return {
    async check(credentials: Record<string, unknown>): Promise<HealthCheckResult> {
      const config = resolveGusConfig(credentials)
      if (!config) {
        return {
          status: 'unhealthy',
          message: 'Production environment requires an API key',
          details: { environment: 'production' },
          checkedAt: new Date(),
        }
      }
      const client = createGusClient(config, request)
      try {
        const sid = await client.login()
        // Not awaited: login alone proves the key; logout must not eat into the
        // platform health-check timeout.
        void client.logout(sid).catch(() => undefined)
        return {
          status: 'healthy',
          message: `Connected to GUS BIR1 (${config.environment})`,
          details: { environment: config.environment },
          checkedAt: new Date(),
        }
      } catch (error) {
        const message = error instanceof Error ? error.message.replace(/^\[internal\]\s*/, '') : 'Unknown error'
        return {
          status: 'unhealthy',
          message: `GUS BIR1 connection failed: ${message}`,
          details: { environment: config.environment },
          checkedAt: new Date(),
        }
      }
    },
  }
}

export const gusRegonHealthCheck = createGusRegonHealthCheck()
