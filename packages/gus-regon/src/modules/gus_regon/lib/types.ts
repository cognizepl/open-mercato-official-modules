/**
 * Shared, client-safe types for the GUS REGON lookup.
 */

/** GUS entity type as returned by BIR1 `Typ`: P = legal entity, F = natural person business, LP/LF = local units. */
export type GusEntityType = 'P' | 'F' | 'LP' | 'LF' | string

export type GusCompany = {
  nip: string
  regon: string | null
  name: string | null
  street: string | null
  buildingNumber: string | null
  flatNumber: string | null
  postalCode: string | null
  city: string | null
  voivodeship: string | null
  county: string | null
  commune: string | null
  type: GusEntityType | null
  /** Set when the entity has ceased activity (`DataZakonczeniaDzialalnosci`). ISO date string. */
  endDate: string | null
  country: 'PL'
}

export type GusLookupFailureReason = 'not_found' | 'unavailable' | 'not_configured'

export type GusLookupResult =
  | { ok: true; company: GusCompany; candidates: GusCompany[] }
  | { ok: false; reason: GusLookupFailureReason }

export type GusEnvironment = 'test' | 'production'
