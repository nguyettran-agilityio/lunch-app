// The layout test (AC19, BR-31, B11, B28; docs/test-scenarios.md E5): every screen at
// 375 px and 1280 px has no horizontal scroll. Until real screens exist it runs on the
// prototype under /proto; from M1-2 each milestone adds its real screens to SCREENS.
import { expect, test } from '@playwright/test'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { vietnamNow } from '@/domain/time'
import { seed } from '@/proto/seed'

// Fresh fake data, written into the prototype's localStorage before each page loads, so
// the pages that need an id or a date get one from the seed (B47).
const state = seed(vietnamNow(new Date()).today)
const mine = state.orders.find((o) => o.customerId === state.me)!
const day = state.days[0].date

const SCREENS: Record<string, string> = {
  '/proto': '/proto',
  '/proto/day': `/proto/day?d=${day}`,
  '/proto/plate': `/proto/plate?d=${day}`,
  '/proto/cart': '/proto/cart',
  '/proto/orders': '/proto/orders',
  '/proto/order': `/proto/order?id=${mine.id}`,
  '/proto/pay': `/proto/pay?id=${mine.id}`,
  '/proto/shop': '/proto/shop',
  '/proto/shop/order': `/proto/shop/order?id=${mine.id}`,
  '/proto/shop/review': '/proto/shop/review',
  '/proto/shop/prep': '/proto/shop/prep',
  '/proto/shop/delivery': '/proto/shop/delivery',
  '/proto/shop/refunds': '/proto/shop/refunds',
  '/proto/shop/buildings': '/proto/shop/buildings',
}

// The real screens of M1-2 (B28), each with the seeded account it is opened as, if any.
const REAL: { url: string; account?: 'customer' | 'shop' }[] = [
  { url: '/sign-in' },
  { url: '/sign-up' },
  { url: '/auth/expired?type=signup' },
  // M1-4; /auth/reset opens only from a reset link, so e2e/reset.spec.ts checks it the same way.
  { url: '/forgot-password' },
  { url: '/auth/expired?type=recovery' },
  { url: '/', account: 'customer' },
  { url: '/shop', account: 'shop' },
]

// Every page.tsx under src/app/proto, as a route.
function protoRoutes(dir = path.resolve('src/app/proto'), base = '/proto'): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return protoRoutes(path.join(dir, e.name), `${base}/${e.name}`)
    return e.name === 'page.tsx' ? [base] : []
  })
}

test('E5 the layout test covers every /proto page (B28)', () => {
  expect(Object.keys(SCREENS).sort()).toEqual(protoRoutes().sort())
})

// Every screen in both languages (B49), since English labels can be longer.
for (const lang of ['vi', 'en'] as const)
  for (const width of [375, 1280]) {
    test.describe(`${lang} at ${width} px`, () => {
      test.use({ viewport: { width, height: width === 375 ? 812 : 800 } })

      test.beforeEach(async ({ page }) => {
        await page.addInitScript(
          (s) => {
            if (!sessionStorage.getItem('e2e-seeded')) {
              localStorage.setItem('lunch-prototype-v5', s)
              sessionStorage.setItem('e2e-seeded', '1')
            }
          },
          JSON.stringify({ ...state, lang }),
        )
      })

      for (const [route, url] of Object.entries(SCREENS)) {
        test(`E5${route} has no horizontal scroll in ${lang} at ${width} px`, async ({ page }) => {
          await page.goto(url)
          await expect(page.locator('main')).toBeVisible()
          // The demo bar's label proves the screen is in the language under test.
          await expect(page.getByText(lang === 'vi' ? 'Dữ liệu thử' : 'Prototype data').first()).toBeVisible()
          await page.waitForLoadState('networkidle')
          const { scrollWidth, clientWidth } = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }))
          expect(scrollWidth, `${url} is ${scrollWidth - clientWidth} px too wide`).toBeLessThanOrEqual(clientWidth)
        })
      }

      for (const { url, account } of REAL) {
        test(`E5${url} has no horizontal scroll in ${lang} at ${width} px`, async ({ page, context }) => {
          await context.addCookies([{ name: 'lang', value: lang, url: 'http://127.0.0.1:3100' }])
          if (account) expect((await page.request.get(`/test/sign-in?account=${account}`)).status()).toBe(200)
          await page.goto(url)
          await expect(page.locator('main')).toBeVisible()
          // The real shell sets <html lang> to the language under test.
          await expect(page.locator('html')).toHaveAttribute('lang', lang)
          await page.waitForLoadState('networkidle')
          const { scrollWidth, clientWidth } = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }))
          expect(scrollWidth, `${url} is ${scrollWidth - clientWidth} px too wide`).toBeLessThanOrEqual(clientWidth)
        })
      }
    })
  }
