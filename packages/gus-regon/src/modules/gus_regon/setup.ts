import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['gus_regon.lookup'],
    admin: ['gus_regon.lookup'],
    employee: ['gus_regon.lookup'],
  },
}

export default setup
