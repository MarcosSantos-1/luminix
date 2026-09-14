import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

import { getFirebaseAdminAuth } from '../src/shared/integrations/firebase/admin.js'

if (existsSync('.env')) {
  loadEnvFile('.env')
}

const result = await getFirebaseAdminAuth().listUsers(1)

console.log(
  `Firebase Admin: credencial validada; projeto acessível (${result.users.length} usuário(s) amostrado(s))`,
)
