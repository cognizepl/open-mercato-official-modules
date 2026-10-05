import { createGusLookupWidget } from '../../../components/createGusLookupWidget'
import { applyCompanyToCustomersCompanyForm } from '../../../lib/mapping'
import { shouldRenderCompanyLookup } from '../../../lib/visibility'

/**
 * Built-in widget for the customers company create and edit forms.
 * Uses a custom `apply` (legal/display name + primary address draft) and a
 * visibility rule, because the create-form spot is shared with person forms.
 */
const widget = createGusLookupWidget({
  id: 'gus_regon.injection.company-lookup',
  requiredModules: ['customers'],
  // Opt-in: shown only when "Show on CRM company forms" is on and an API key is set.
  gate: 'companyForms',
  descriptionKey: 'gus_regon.widget.description',
  visible: ({ pathname, operation, values }) => shouldRenderCompanyLookup(pathname, operation, values),
  apply: (values, company, { t }) =>
    applyCompanyToCustomersCompanyForm(values, company, {
      addressLabel: t('gus_regon.lookup.addressLabel', 'Registered office (GUS)'),
    }),
})

export default widget
