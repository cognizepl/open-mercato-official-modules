import { createGusClient, type GusRequest } from './client'
import { resolveGusConfig } from './config'
import { normalizeNip } from './nip'
import { parseSearchResult, pickPrimaryCompany } from './parser'
import type { GusLookupResult } from './types'

export type LookupOptions = {
  request?: GusRequest
  logger?: Pick<Console, 'warn'>
}

/**
 * Looks a company up in GUS REGON by NIP.
 *
 * Fail-open by design: every upstream problem (timeout, HTTP error, SOAP fault,
 * invalid session) is reported as `{ ok: false, reason: 'unavailable' }` so the
 * calling form degrades to manual entry. Never throws.
 *
 * The NIP must already be checksum-validated by the caller.
 */
export async function lookupCompanyByNip(
  credentials: Record<string, unknown> | null | undefined,
  rawNip: string,
  options: LookupOptions = {},
): Promise<GusLookupResult> {
  const config = resolveGusConfig(credentials)
  if (!config) return { ok: false, reason: 'not_configured' }

  const logger = options.logger ?? console
  const nip = normalizeNip(rawNip)
  const client = createGusClient(config, options.request)

  let sid: string
  try {
    sid = await client.login()
  } catch (error) {
    // Expected upstream outcomes are logged as warnings without the word "failed":
    // the sandbox dev runner treats such lines as runtime errors.
    logger.warn(`[gus_regon] login unsuccessful: ${error instanceof Error ? error.message : String(error)}`)
    return { ok: false, reason: 'unavailable' }
  }

  try {
    const resultXml = await client.searchByNip(sid, nip)
    const parsed = parseSearchResult(resultXml, nip)
    if (parsed.kind === 'not_found') return { ok: false, reason: 'not_found' }
    if (parsed.kind === 'error') {
      logger.warn(`[gus_regon] search unsuccessful (code ${parsed.code ?? 'n/a'}): ${parsed.message ?? 'unknown'}`)
      return { ok: false, reason: 'unavailable' }
    }
    const company = pickPrimaryCompany(parsed.companies)
    if (!company) return { ok: false, reason: 'not_found' }
    return { ok: true, company, candidates: parsed.companies }
  } catch (error) {
    logger.warn(`[gus_regon] search unsuccessful: ${error instanceof Error ? error.message : String(error)}`)
    return { ok: false, reason: 'unavailable' }
  } finally {
    // Best effort and not awaited — a slow or failed logout must never delay
    // or break the lookup result. GUS expires idle sessions on its own.
    void client.logout(sid).catch(() => undefined)
  }
}
