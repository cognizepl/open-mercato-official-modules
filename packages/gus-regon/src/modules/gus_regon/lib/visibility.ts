/**
 * Client-safe visibility rules for the company lookup widget.
 */

const COMPANY_CREATE_ROUTE = /\/backend\/customers\/companies\/create(?:[/?#]|$)/
const COMPANY_DETAIL_ROUTE = /\/backend\/customers\/companies(?:-v2)?\/[^/]+/
const PERSON_ONLY_FIELDS = ['firstName', 'lastName', 'jobTitle', 'companyEntityId']

/**
 * The create-form spot `crud-form:customers.customer_entity` is shared by the
 * company and person forms — including the "add person" dialog opened from a
 * company page. Render only for the company create page (create) or the
 * company edit form (update), and never when the values look like a person.
 */
export function shouldRenderCompanyLookup(pathname: string, operation: string | undefined, values: Record<string, unknown>): boolean {
  if (PERSON_ONLY_FIELDS.some((key) => key in values)) return false
  if (operation === 'update') return COMPANY_DETAIL_ROUTE.test(pathname)
  return COMPANY_CREATE_ROUTE.test(pathname)
}
