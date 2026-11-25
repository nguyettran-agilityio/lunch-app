// The role of an account (B17, plan.md section 1.5): a shop account is one whose email is
// in SHOP_EMAILS (a comma list, compared in lower case). Computed on every request, never stored.
export type Role = 'customer' | 'shop'

export function roleOf(email: string, shopEmails: string | undefined = process.env.SHOP_EMAILS): Role {
  const shops = (shopEmails ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return shops.includes(email.trim().toLowerCase()) ? 'shop' : 'customer'
}
