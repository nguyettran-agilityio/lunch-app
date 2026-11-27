// The seeded accounts of the test sign-in mode (B44). The e2e script writes them into
// `profiles` and `test_auth_users` (confirmed), and puts the shop email in SHOP_EMAILS;
// `/test/sign-in?account=<key>` signs one in, and the phone + password ones can also sign in
// with TEST_PASSWORD through the form. Each later PR adds the accounts it needs. Fixed ids
// keep the tests readable.
// The customer's default building, approved: a complete profile is name, phone number and
// default building (BR-15), and a declined building makes it incomplete (CN-61).
export const TEST_BUILDING = {
  id: '00000000-0000-4000-8000-0000000000b1',
  name: 'Test Tower',
  address: '1 Test Street',
  state: 'approved',
} as const

// A test value for the seeded accounts only (they exist only in the in-memory test database).
export const TEST_PASSWORD = 'testpass123'

export const TEST_ACCOUNTS = {
  customer: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'customer@example.test',
    method: 'password',
    phone: '0912345678',
    name: 'Nguyễn Văn Test',
    buildingId: TEST_BUILDING.id,
    lang: 'vi',
  },
  // A shop account needs no customer profile (BR-15).
  shop: {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'shop@example.test',
    method: 'password',
    phone: null,
    name: null,
    buildingId: null,
    lang: 'vi',
  },
  // A Google account (no password, only a Google identity), for the sign-up and sign-in
  // messages of AC50, AC68, AC83, AC126 and AC127, and a returning Google sign-in.
  google: {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'google@example.test',
    method: 'google',
    phone: '0938111222',
    name: 'Trần Thị Google',
    buildingId: TEST_BUILDING.id,
    lang: 'vi',
  },
  // A complete customer saved in Vietnamese, for AC71 (the account's language wins).
  viCustomer: {
    id: '00000000-0000-4000-8000-000000000004',
    email: 'vi-customer@example.test',
    method: 'password',
    phone: '0977000111',
    name: 'Lê Thị Việt',
    buildingId: TEST_BUILDING.id,
    lang: 'vi',
  },
  // Lan, whose new email waits for its link (BR-29a, CN-65): for AC110 and AC128 before M1-5
  // builds the email change.
  lanWaitingChange: {
    id: '00000000-0000-4000-8000-000000000005',
    email: 'lan@example.test',
    method: 'password',
    phone: '0905555111',
    name: 'Phạm Thị Lan',
    buildingId: TEST_BUILDING.id,
    lang: 'vi',
    pendingEmail: 'lan2@example.test',
  },
  // A complete customer whose password only the reset test of AC151 changes.
  resetCustomer: {
    id: '00000000-0000-4000-8000-000000000007',
    email: 'reset-customer@example.test',
    method: 'password',
    phone: '0966000222',
    name: 'Đỗ Văn Reset',
    buildingId: TEST_BUILDING.id,
    lang: 'vi',
  },
  // A second email + password shop account whose password the reset tests change (AC151,
  // AC157), so the tests that sign the shop in with TEST_PASSWORD are not touched.
  resetShop: {
    id: '00000000-0000-4000-8000-000000000006',
    email: 'shop-reset@example.test',
    method: 'password',
    phone: null,
    name: null,
    buildingId: null,
    lang: 'vi',
  },
} as const

/** A shop email with no seeded account, put in SHOP_EMAILS by the e2e script: a shop account
 * made by its first Google sign-in (A17, AC57). */
export const TEST_GOOGLE_SHOP_EMAIL = 'shop-google@example.test'

/** The identities of a seeded auth user: a Google account has only its Google identity. */
export const seededIdentities = (method: string) => (method === 'google' ? ['google'] : ['email'])

export type TestAccountKey = keyof typeof TEST_ACCOUNTS

export function isTestAccountKey(key: string): key is TestAccountKey {
  return Object.hasOwn(TEST_ACCOUNTS, key)
}
