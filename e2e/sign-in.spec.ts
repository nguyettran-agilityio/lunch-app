// The test sign-in mode on the e2e server (docs/test-scenarios.md section 20, B42, B44).
import { expect, test } from '@playwright/test'

test('E1 each browser context signs in its own seeded account (B42, B44)', async ({ browser }) => {
  const customer = await browser.newContext()
  const shop = await browser.newContext()
  const nobody = await browser.newContext()

  const signedIn = await customer.request.get('/test/sign-in?account=customer')
  expect(signedIn.status()).toBe(200)
  expect(await signedIn.json()).toEqual({ email: 'customer@example.test', role: 'customer' })
  expect((await shop.request.get('/test/sign-in?account=shop')).status()).toBe(200)

  expect(await (await customer.request.get('/test/session')).json()).toEqual({ email: 'customer@example.test', role: 'customer' })
  expect(await (await shop.request.get('/test/session')).json()).toEqual({ email: 'shop@example.test', role: 'shop' })
  expect(await (await nobody.request.get('/test/session')).json()).toBeNull()

  // The session lives in the browser's cookie, so a page of that context sees it too.
  const page = await customer.newPage()
  await page.goto('/test/session')
  expect(JSON.parse((await page.textContent('body')) ?? '')).toEqual({ email: 'customer@example.test', role: 'customer' })

  await Promise.all([customer.close(), shop.close(), nobody.close()])
})

test('E2 an account that was not seeded is refused and gets no session (B42)', async ({ request }) => {
  const res = await request.get('/test/sign-in?account=nobody')
  expect(res.status()).toBe(400)
  expect(await (await request.get('/test/session')).json()).toBeNull()
})
