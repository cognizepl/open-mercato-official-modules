import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'
import { gusRegonDetailWidgetSpotId } from '../integration'

// Stacked (rendered above the form fields) rather than a group card: on the
// shared create-form spot the widget renders nothing for people, and a group
// card would leave an empty frame behind.
const companyLookup = {
  widgetId: 'gus_regon.injection.company-lookup',
  kind: 'stack' as const,
  priority: 50,
}

/**
 * - `customers.company` — company edit form spot as passed by `companies-v2/[id]` in OM 0.6.x.
 * - `crud-form:customers.company` — the same form's spot id in OM ≥ 0.7.
 * - `crud-form:customers.customer_entity` — base spot of the customers create forms
 *   (shared by companies and people); the widget renders only on company routes.
 */
export const injectionTable: ModuleInjectionTable = {
  // Status of the CRM company card on Settings → Integrations → GUS REGON.
  [gusRegonDetailWidgetSpotId]: [{ widgetId: 'gus_regon.injection.integration-status', kind: 'stack', priority: 100 }],
  'customers.company': [companyLookup],
  'crud-form:customers.company': [companyLookup],
  'crud-form:customers.customer_entity': [companyLookup],
}

export default injectionTable
