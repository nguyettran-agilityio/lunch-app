// The seeded accounts of the test sign-in mode (B44). The e2e script writes them into
// `profiles` and puts the shop email in SHOP_EMAILS; `/test/sign-in?account=<key>` signs
// one in. Each later PR adds the accounts it needs. Fixed ids keep the tests readable.
// The customer's default building, approved: a complete profile is name, phone number and
// default building (BR-15), and a declined building makes it incomplete (CN-61).
export const TEST_BUILDING = {
  id: '00000000-0000-4000-8000-0000000000b1',
  name: 'Test Tower',
  address: '1 Test Street',
  state: 'approved',
} as const

export const TEST_ACCOUNTS = {
  customer: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'customer@example.test',
    method: 'password',
    phone: '0912345678',
    name: 'Nguyễn Văn Test',
    buildingId: TEST_BUILDING.id,
  },
  // A shop account needs no customer profile (BR-15).
  shop: {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'shop@example.test',
    method: 'password',
    phone: null,
    name: null,
    buildingId: null,
  },
} as const

export type TestAccountKey = keyof typeof TEST_ACCOUNTS

export function isTestAccountKey(key: string): key is TestAccountKey {
  return Object.hasOwn(TEST_ACCOUNTS, key)
}
