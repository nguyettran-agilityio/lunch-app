# Spec: Office lunch ordering app

Status: Draft for review (Design step)

This spec says **what the app does**: users, screens, flows, data, business rules and acceptance criteria. It does not discuss code or technology. It is derived from [intent.md](intent.md) (D1–D23, OQ1–OQ12). `intent.md` keeps what was asked; this spec is the source of truth for what was decided. Every open question and every concern found while writing it was decided by the Lead and is recorded under [Areas of concern](#areas-of-concern) as "Resolved by Lead: ...". Technical and process decisions live in [decisions.md](decisions.md).

References in brackets point to the decision behind a rule: `D#` (intent), `OQ#` (open question in intent, resolved below), `CN-#` (concern raised by this spec, resolved below).

## 1. Users and roles

| Role | Who | Can do |
|---|---|---|
| Customer | Office workers in the buildings the shop delivers to | Sign up and sign in, keep a profile, view the menu for the coming days, place, edit and cancel orders before the cutoff, pay by QR, follow order status, see payment and refund state |
| Shop | The shop owner and kitchen (D1) | Manage dishes, build-your-own rules, day menus, cutoff times, closed days and buildings; confirm and reject orders; review unpaid orders; view the preparation sheet and delivery list; move orders through statuses; confirm payments and refunds |

- There is exactly one shop (D1). Shippers are not users (intent, Out of scope).
- The shop role is assigned in configuration to a list of accounts; all shop accounts have the same rights [CN-4].
- In the first version the Lead uses one shop account and one customer account to play both sides (D11) [CN-4].

## 2. Glossary

| Term | Meaning |
|---|---|
| Service day | A calendar date the shop sells lunch for. Each service day has a menu, a cutoff time and an open/closed flag |
| Cutoff | The time on a service day after which customers cannot place, edit or cancel orders for that day (D6) [CN-12]. An order that is already Preparing cannot be edited or cancelled even before the cutoff [OQ6] |
| Fixed dish | A complete dish sold at its own price (D2) |
| Build-your-own plate | A rice plate the customer assembles from that day's dishes, priced as base price plus surcharges (D2, D15) |
| Dish group | A category used by build-your-own plates (for example main, vegetable, soup), with a minimum, a maximum and an included count [OQ2] |
| Base price | One shared price of a build-your-own plate: rice plus the included number of dishes per group [OQ2] |
| Surcharge | Extra amount a dish adds to a build-your-own plate; stored on the dish, may be 0 VND [OQ2] |
| Order status | Where the order is in its lifecycle (D10); see section 4 |
| Payment state | Whether the shop has received the money for an order; tracked separately from the status (D18) |
| Refund state | Whether money must go back to the customer and whether it has; tracked separately from the status (D19) [OQ4] |
| Approved / pending building | A building in the shop's list, or one entered by a customer and waiting for the shop (D14) |

All dates and times are in Asia/Ho_Chi_Minh, whatever the device's time zone. Money is in VND, whole numbers only [CN-14].

## 3. Data

Conceptual entities and the facts the app keeps. This is not a database schema.

| Entity | Facts kept |
|---|---|
| Account | Name, phone number (unique across accounts), email (required for phone + password accounts), default building, sign-in method (phone + password, or Google; one per account), role (customer or shop), interface language (D13) [CN-2] [CN-3] [CN-8] [CN-15] |
| Building | Name, address or description, delivery time (one fixed time per building), state: approved or pending, who proposed it (D14) [OQ5] |
| Dish | Name, description, optional photo, kind (fixed dish and/or build-your-own component), price (fixed dish), group and surcharge (build-your-own), active flag |
| Dish group | Name, minimum count, maximum count, included count, extra dish fee, display order [OQ2] |
| Build-your-own rules | Base price; the groups that make up a plate [OQ2] |
| Shop settings | Default cutoff time, bank details used to build the VietQR code (bank, account number, account holder) [OQ7] [CN-5] |
| Service day | Date, menu (which fixed dishes and which build-your-own components are on sale), cutoff time (default or override), closed flag (D3, D6, D22) [OQ7] |
| Order | Order code, customer, service day, delivery building, delivery note (floor, room), lines, total, status, payment state, amount paid, refund state, amount to refund, status history with times, notes from the shop (D23) [CN-11] [CN-13] |
| Order line | Fixed dish or build-your-own plate (with its chosen dishes), quantity (portions), unit price as at the time of ordering (D23) [CN-10] |
| Payment record | Order, amount, time the customer reported "I have transferred", time and account of the shop's confirmation (D9) [CN-5] |
| Refund record | Order, amount, reason (customer cancel, edit lowered the total, shop reject, closed day, building not approved), time and account of the shop's "refunded" mark (D19) [OQ1] [OQ4] |

## 4. Order lifecycle

### 4.1 Statuses (D10)

`Placed → Shop confirmed → Preparing → Delivering → Delivered`, plus `Rejected` and `Cancelled` as end states.

| From | To | Who | When / guard |
|---|---|---|---|
| (new) | Placed | Customer | Before the day's cutoff; day has a menu and is not closed; within the order horizon [CN-7] |
| Placed | Shop confirmed | Shop | Any time before Preparing, including after the cutoff [CN-1]; the delivery building must be approved [OQ3] |
| Shop confirmed | Placed | System | The customer edits the order (before the cutoff) [OQ10] |
| Placed, Shop confirmed | Cancelled | Customer | Before the cutoff only [CN-12]; never once the order is Preparing [OQ6] |
| Placed, Shop confirmed | Rejected | Shop | Until the order is Preparing, including after the cutoff (D20); also in bulk when the day is marked closed (D22) [CN-9] |
| Shop confirmed | Preparing | Shop | Per order, at any time, also before the cutoff; only an order that is Shop confirmed can move; orders still Placed do not block other orders [OQ6] |
| Preparing | Delivering | Shop | Per building or per order [OQ6] |
| Delivering | Delivered | Shop | Per building or per order; with an optional delivery note [OQ6] [CN-13] |

No other transitions exist. There is no "delivery failed" status [CN-13].

### 4.2 Payment state (separate from status, D18)

| State | Meaning |
|---|---|
| Unpaid | Customer has not reported a transfer |
| Reported | Customer tapped "I have transferred"; the shop has not confirmed |
| Paid | The shop confirmed receipt of the full total |
| Underpaid | The shop confirmed some money, but the total later went up (edit); the app shows the amount still owed [OQ1] |

Only **Paid** counts as paid. Unpaid, Reported and Underpaid all count as unpaid at the cutoff (D17) [CN-6].

### 4.3 Refund state (separate from status, D19)

| State | Meaning |
|---|---|
| None | Nothing to give back |
| Needs refund | The app has recorded an amount the shop must return, with the reason |
| Refunded | The shop returned the money outside the app and marked it here |

An order needs a refund when money confirmed by the shop is more than what the customer now owes: a paid order is cancelled (D19), rejected (D20, D22) [OQ4], rejected because its building was not approved [OQ3], or edited to a lower total [OQ1].

## 5. Business rules

### Menu and days

- **BR-1** The shop keeps one dish list. A dish can be sold as a fixed dish, as a build-your-own component, or both (D2).
- **BR-2** The shop sets the menu for each service day: which fixed dishes and which build-your-own components are on sale. The menu can differ every day; the app does not check repetition (D3, D4).
- **BR-3** Customers see and can order for today and the next 6 days. Only days with a menu that are not closed take orders. Days without a menu show "no menu yet"; closed days show as closed (D3, D5, D22) [CN-7].
- **BR-4** Each service day uses the default cutoff time unless the shop sets an override for that day. An override can be set or changed only before that day's cutoff (D6) [OQ7].
- **BR-5** There is no daily portion limit (D21).
- **BR-6** Orders keep the unit prices from the time of ordering; a price change applies only to new orders. A dish cannot be removed from a day's menu while that day has active orders containing it; to drop it, the shop first rejects those orders [CN-10].

### Build-your-own plates

- **BR-7** The shop sets one base price and, for each dish group, a minimum, a maximum, an included count (for example 1 main + 1 vegetable) and an extra dish fee. These rules are fixed, not per day (D15) [OQ2].
- **BR-8** Plate price = base price + the surcharge of every chosen dish + the group's extra dish fee for every dish picked beyond that group's included count. Each dish's surcharge is stored on the dish and may be 0 VND (D15) [OQ2].
- **BR-9** A plate is valid only if every group has between its minimum and maximum dishes, chosen from that day's menu [OQ2].

### Ordering

- **BR-10** An order has one or more lines; each line has a quantity. The whole order goes to one recipient, the customer who placed it, who pays the whole total (D23).
- **BR-11** A customer can place any number of orders for the same day; each is paid and tracked separately [OQ8].
- **BR-12** An order is delivered to the customer's default building unless the customer picks another building for that order before the cutoff. An order can carry a delivery note (floor, room) [CN-11].
- **BR-13** Before the cutoff the customer can edit or cancel their order, unless it is already Preparing. After the cutoff they can do neither; only the shop can reject (D6, D20) [CN-12] [OQ6].
- **BR-14** Editing an order returns it to Placed; the shop must confirm it again (D18) [OQ10].
- **BR-15** A customer must have a complete profile (name, phone number, default building) before ordering. A Google sign-in without a phone number is sent to profile completion first (D13) [CN-3].

### Buildings

- **BR-16** Customers pick a building from the approved list, or enter one that is not listed; that building is pending until the shop approves it (D14).
- **BR-17** An order to a pending building can be placed and stays Placed; the shop cannot confirm it until the building is approved. If the shop does not approve the building, it rejects the order, with a refund if paid [OQ3].
- **BR-18** Each building has one fixed delivery time, set when the shop adds or approves it. The shop can change it; the change applies to days not yet past the cutoff (D8) [OQ5].

### Payment and refunds

- **BR-19** Customers pay when they order (D16). The app shows a VietQR code for the order with the amount and the order code prefilled in the transfer note. The customer taps "I have transferred"; the shop checks its bank statement and confirms receipt. There is no bank integration (D9) [CN-5].
- **BR-20** When a paid order is edited to a higher total, the payment state becomes Underpaid and the app shows a QR for the difference; the shop confirms it the same way. When the total goes down, the difference is recorded as Needs refund (D19) [OQ1].
- **BR-21** Every refund works the same way: the app records the amount and reason as Needs refund; the shop returns the money outside the app and marks it Refunded. This covers customer cancellation, edits that lower the total, shop rejection, closed days and unapproved buildings (D19, D20, D22) [OQ1] [OQ3] [OQ4].

### Shop review and day run

- **BR-22** The shop confirms orders before the cutoff (D18). Orders still Placed at the cutoff stay Placed; after the cutoff the shop confirms or rejects each one [CN-1].
- **BR-23** At the cutoff the shop reviews every order whose payment state is not Paid and chooses to reject it or keep it (D17) [CN-6]. The review list shows the amount still owed.
- **BR-24** The shop moves orders to Preparing one order at a time, at any time, also before the cutoff. Only a Shop confirmed order can move to Preparing; orders still Placed do not block other orders. Once an order is Preparing the customer can no longer edit or cancel it, even before the cutoff, and the shop can no longer reject it (D7, D20) [OQ6].
- **BR-25** The shop sees the preparation sheet for a day: portions of each fixed dish and of each build-your-own component, split into columns by status (Preparing, Shop confirmed not yet preparing, still Placed) with a total. Rejected and Cancelled orders are not counted (D7) [OQ6].
- **BR-26** The shop sees the delivery list grouped by building, ordered by delivery time, with each order's customer name, phone number, lines, delivery note and payment state (D8).
- **BR-27** The shop moves orders to Delivering and Delivered per building or per order. If a customer cannot be reached, the shop still marks the order Delivered (for example left at reception) with a delivery note; anything further is handled outside the app (D10) [OQ6] [CN-13].
- **BR-28** The shop can mark a day closed until any order of that day is Preparing. Marking a day closed rejects all its active orders in bulk and records refunds for paid ones; customers see the day as closed (D20, D22) [CN-9].

### Accounts, language and devices

- **BR-29** Customers sign up and sign in with phone number + password, or with Google; either is fine. Each account uses one method; a phone number cannot belong to two accounts. A phone + password account must also have an email. A customer who forgets the password taps "Forgot password" and receives a reset link by email [CN-2] [CN-3] [CN-15].
- **BR-30** The interface is available in Vietnamese and English, Vietnamese by default, with a VI/EN switch remembered per account and per browser. Only the app's own text is translated; dish and building names entered by the shop are shown as entered [OQ11] [CN-8].
- **BR-31** Every screen, for customers and for the shop, works on both phone and computer [OQ12].
- **BR-32** Customers see order status and payment and refund state when they open the app. There are no push, email or SMS notifications about orders in the first version; email is used only for password reset links [OQ6] [CN-15].

## 6. Screens

All screens have the VI/EN switch and work on phone and computer (BR-30, BR-31).

### Customer

| # | Screen | Shows / does |
|---|---|---|
| S-C1 | Sign in / Sign up | Phone + password (with email), or Google (BR-29) |
| S-C1a | Forgot password | Request a reset link by email; set a new password from the link (BR-29) |
| S-C2 | Profile | Name, phone number, default building (pick from list or propose a new one), language. Shown first when the profile is incomplete (BR-15, BR-16) |
| S-C3 | Week view | Today + next 6 days, each marked open (with cutoff time), closed, past cutoff or "no menu yet" (BR-3) |
| S-C4 | Day menu | Fixed dishes with prices; entry to the plate builder; add to cart (BR-2) |
| S-C5 | Plate builder | Groups with min/max/included counts, chosen dishes, live plate price; blocks invalid plates (BR-7–BR-9) |
| S-C6 | Cart and checkout | Lines and quantities, delivery building (default, changeable) and note, total; place order (BR-10, BR-12) |
| S-C7 | Payment | VietQR with amount and order code, "I have transferred" button, amount still owed if Underpaid (BR-19, BR-20) |
| S-C8 | My orders | Orders by day with status, payment state and refund state (BR-32) |
| S-C9 | Order detail | Lines, total, building, status history; edit and cancel before the cutoff while not Preparing (BR-13, BR-14) |

### Shop

| # | Screen | Shows / does |
|---|---|---|
| S-S1 | Dishes | Dish list: add, edit, deactivate; fixed price, group and surcharge (BR-1, BR-6) |
| S-S2 | Build-your-own rules | Base price; groups with min, max, included count, extra dish fee (BR-7) |
| S-S3 | Days | Calendar of service days: set menu, cutoff override, mark closed (BR-2, BR-4, BR-28) |
| S-S4 | Settings | Default cutoff time; bank details for VietQR (BR-4, BR-19) |
| S-S5 | Buildings | Approved buildings with delivery times; pending buildings to approve or decline (BR-16–BR-18) |
| S-S6 | Orders | Orders of a day, filter by status/payment/building; confirm, reject, confirm payment (BR-19, BR-22) |
| S-S7 | Cutoff review | After the cutoff: orders still Placed and orders not Paid, with amount owed; keep or reject each (BR-22, BR-23) |
| S-S8 | Preparation sheet | Portions per dish for the day, split by status with a total; "Start preparing" per Shop confirmed order (BR-24, BR-25) |
| S-S9 | Delivery list | By building and delivery time; mark Delivering / Delivered per building or per order, with note (BR-26, BR-27) |
| S-S10 | Refunds | Orders with Needs refund: amount, reason, customer phone; mark Refunded (BR-21) |

## 7. Flows

**F1 Customer orders and pays.** Sign in → (complete profile if needed) → week view → pick a day → add fixed dishes and/or build a plate → checkout (building, note) → order is Placed → payment screen: scan QR, transfer, tap "I have transferred" → payment state Reported → shop confirms → Paid.

**F2 Customer edits or cancels.** Before the cutoff, while the order is not Preparing: open the order → edit → order returns to Placed; if paid and the total went up, pay the difference (Underpaid until confirmed); if it went down, the difference is Needs refund. Or cancel → Cancelled; if paid, Needs refund. After the cutoff, or once the order is Preparing: no edit or cancel; the customer contacts the shop, which may reject until the order is Preparing.

**F3 Shop daily run (D12).** Before the day: set dishes, rules, the day's menu and cutoff. Before the cutoff: confirm incoming orders and payments. At the cutoff: open the cutoff review, decide every order still Placed and every order not Paid. Start preparing order by order (any Shop confirmed order, also before the cutoff), using the preparation sheet. Deliver by building using the delivery list: Delivering, then Delivered. Finish payments and refunds: every order is Paid or rejected, every Needs refund is Refunded.

**F4 Closed day.** Shop marks a day closed (before any order is Preparing) → all active orders of that day are Rejected → paid ones are Needs refund → customers see the day as closed.

**F5 New building.** Customer proposes a building (profile or checkout) → building is pending → orders to it stay Placed → shop approves it and sets its delivery time, then confirms the orders; or declines it and rejects the orders (with refunds if paid).

## 8. Acceptance criteria

**Release criterion (D12) [OQ9].** The first version is accepted when the Lead runs one full service day end to end — put up the menu → customers order → orders close → cook → deliver → collect payment — without keeping any records outside the app. No further threshold of days or orders is part of the spec.

| # | Given | When | Then |
|---|---|---|---|
| AC1 | A day with a menu, before its cutoff | A customer with a complete profile places an order | The order is Placed, payment state Unpaid, and the payment screen shows a QR with the exact total and the order code |
| AC2 | A day past its cutoff | A customer tries to place, edit or cancel an order for it | The app refuses and says the day is closed for ordering |
| AC3 | Base price 35,000 VND; groups main (min 1, max 2, included 1, extra dish fee 10,000) and vegetable (min 1, max 1, included 1) | A customer picks ribs (+5,000) and a vegetable (0), then adds an egg (0) as a second main | The price is 40,000 VND, then 50,000 VND; a plate with 0 mains or 2 vegetables cannot be added |
| AC4 | A customer already has an order for a day | They place a second order for the same day | Both orders exist, each with its own total, QR and payment state |
| AC5 | A Shop confirmed order before the cutoff | The customer edits it | The order is Placed again and needs the shop's confirmation |
| AC6 | A Paid order of 50,000 VND before the cutoff | The customer edits it to 65,000 | Payment state Underpaid, amount owed 15,000, a QR for 15,000 is shown |
| AC7 | A Paid order of 50,000 VND before the cutoff | The customer edits it to 40,000 | Refund state Needs refund, 10,000 VND, reason "edit lowered the total" |
| AC8 | A Paid order | The customer cancels it before the cutoff, or the shop rejects it | Status Cancelled or Rejected, Needs refund for the paid amount; after the shop marks it, Refunded |
| AC9 | The cutoff has passed | The shop opens the cutoff review | It lists every order still Placed and every order not Paid (Unpaid, Reported, Underpaid) with the amount owed; each can be kept or rejected |
| AC10 | A day with one Placed order and one Shop confirmed order, before or after the cutoff | The shop starts preparing the Shop confirmed order, and tries the same on the Placed order | The Shop confirmed order becomes Preparing; the Placed order cannot move to Preparing until it is confirmed, and it does not block the other order |
| AC11 | An order moved to Preparing before the cutoff | The customer tries to edit or cancel it, and the shop tries to reject it | All are refused; the preparation sheet counts it in the Preparing column, shows Shop confirmed and Placed orders in their own columns with a total, and leaves out Rejected and Cancelled orders |
| AC12 | Orders for two buildings | The shop opens the delivery list | Orders are grouped by building, ordered by delivery time, with name, phone, lines, note and payment state; Delivering/Delivered can be set per building or per order |
| AC13 | A day with orders and none Preparing | The shop marks it closed | All active orders are Rejected, paid ones Need refund, and customers see the day as closed; once any order is Preparing, the day can no longer be marked closed |
| AC14 | A customer proposes a new building | They order to it | The order is Placed and cannot be confirmed until the building is approved; declining the building lets the shop reject the order with a refund if paid |
| AC15 | A dish is in a day's active orders | The shop changes its price or tries to remove it from that day | Existing orders keep the old price; removal is refused until those orders are rejected |
| AC16 | A customer signs in with Google for the first time | They try to order | They are sent to profile completion; a phone number already used by another account is refused |
| AC17 | A device set to another time zone | It shows cutoffs and delivery times | Times are shown and enforced in Asia/Ho_Chi_Minh |
| AC18 | A new visitor | They open the app | The interface is in Vietnamese; switching to English changes app text, not dish or building names; the choice is remembered |
| AC19 | Any screen | It is opened on a phone and on a computer | It is usable on both without horizontal scrolling |
| AC20 | A phone + password account with an email | The customer taps "Forgot password" | A reset link is sent to that email, and the customer can set a new password from it |

## 9. Out of scope for the first version

From intent: multiple shops; shippers using the app; a daily portion limit (D21).

Decided while writing this spec: push, email or SMS notifications about orders (email is used only for password reset) [OQ6] [CN-15]; bank integration or automatic payment matching [CN-5]; a "delivery failed" status [CN-13]; translating shop-entered content [CN-8]; linking two sign-in methods to one account [CN-2] [CN-3]; customer cancellation after the cutoff [CN-12]; staff roles with different rights inside the shop [CN-4]; a success threshold beyond one full day [OQ9].

## Areas of concern

Each entry states where `intent.md` was ambiguous, contradictory or silent, then the Lead's decision, recorded in full.

### Open questions from intent

**OQ1 — Paid order edited to a different total (D6, D16, D19).** Intent lets customers edit before the cutoff and pay at ordering, but says nothing about the difference.
Resolved by Lead: "Top up / refund the difference": if the total goes up, the customer scans the QR to pay the extra, and the order becomes "not fully paid" until the shop confirms. If the total goes down, the app records the difference as "needs refund", and the shop refunds outside the app as in D19.

**OQ2 — Build-your-own rules (D2, D15).** Intent gives "base price + surcharge" but not who sets it, whether it changes daily, or how many dishes per group.
Resolved by Lead: "Shop sets it, fixed, with group rules": the shop sets one shared base price (covering rice plus a set number of dishes, e.g. 1 main + 1 vegetable). Each dish has its own surcharge (may be 0 VND) stored in the dish list. Each group has a minimum/maximum number of dishes set by the shop; picking more than the included number adds a surcharge.
Resolved by Lead (follow-up on how surcharges add up): "Dish surcharges always add": every chosen dish adds its own surcharge (0 VND if it is an ordinary dish). A dish picked beyond the included number also adds an "extra dish" fee for its group, set by the shop. Example: ribs (+5k) + vegetable (0) = 40k; adding an egg (0) beyond the included number → +10k extra dish fee = 50k.

**OQ3 — Order to a building not yet approved (D8, D14).**
Resolved by Lead: "Can be placed, waits for approval": the order is still created, in Placed. The shop does not confirm the order before approving the building. If the shop does not approve the building, it rejects the order (refund if already paid).

**OQ4 — Shop rejects a paid order (D19, D20, D22).**
Resolved by Lead: "Refund as in D19": the app records the order as "needs refund", the shop refunds outside the app and then marks it "refunded". One refund mechanism shared by cancellation, rejection and closed days.

**OQ5 — Delivery time per building (D8, D14).**
Resolved by Lead: "Fixed per building": each building has one fixed delivery time set by the shop when adding/approving the building; the shop can edit it, and the change applies to days not yet past the cutoff.

**OQ6 — Who moves orders to Preparing, Delivering, Delivered, and are customers notified (D10).**
Resolved by Lead (replaced, see below): "The shop, in bulk and per order; viewed in the app": the shop moves the whole day to Preparing, and Delivering/Delivered by building or per order. Customers see the status when they open the app; no push notification/SMS in the first version.
Resolved by Lead (follow-up after CN-15): email is used only for password reset. Order notifications by email stay out of scope, as before.
Resolved by Lead (replaces the Preparing part of the decision above): the shop moves orders to Preparing per order, not the whole day. An order must be confirmed before it can move; orders still Placed do not block other orders. Delivering/Delivered by building or per order, and viewing status in the app, are unchanged.
Resolved by Lead (follow-up on when): "Any time": the shop can start cooking early. Once an order is Preparing the customer can no longer edit or cancel it, even before the cutoff (an exception to D6).
Resolved by Lead (follow-up on the preparation sheet, D7): "Split by status": the preparation sheet shows the portions of each dish split into columns: being cooked (Preparing), confirmed not yet cooking, still Placed; with a total. Rejected and Cancelled are not counted.
Resolved by Lead (follow-up on closed days, CN-9): "Keep as CN-9": as soon as one order is Preparing, the day can no longer be marked closed; orders not yet cooking can still be rejected one by one (D20). Matches D20.

**OQ7 — Cutoff fixed or per day (D6).** Intent says "each day has a cutoff time" and "the shop sets the cutoff time each day" without saying whether there is a default.
Resolved by Lead: "Default + per-day override": the shop sets a default cutoff time (e.g. 9:30) and can change it for a specific day before that day's cutoff. This matches "the shop sets the cutoff time each day" in scope.

**OQ8 — More than one order per day (D5, D23).**
Resolved by Lead: "Multiple orders per day": a customer can place any number of orders, each paid and tracked separately.

**OQ9 — Threshold for "one full day end to end" (D11, D12).**
Resolved by Lead: "No threshold, one day is enough": the first version succeeds when one full day runs without records outside the app. The decision to open a real shop is the Lead's, outside the spec.

**OQ10 — Edit after shop confirmation (D6, D18).**
Resolved by Lead: "Back to Placed": every edit returns the order to Placed, and the shop must confirm the new content again.

**OQ11 — Interface language.**
Resolved by Lead: "Both": Vietnamese + English, the user picks the language; i18n from the start. (Default and scope of translation: CN-8.)

**OQ12 — Devices.**
Resolved by Lead, in the Lead's words: "customers and the shop both use multiple devices". The spec therefore requires every screen, customer and shop, to work on phone and computer (BR-31).

### Concerns raised while writing this spec

**CN-1 — Order still unconfirmed at the cutoff (D18, missing).** D18 says the shop confirms before the cutoff but not what happens if it does not.
Resolved by Lead: "Shop handles it after the cutoff": the order stays Placed; after the cutoff the shop reviews it and chooses to confirm or reject (like D17). The day cannot move to Preparing while any order is still Placed. (The last sentence is replaced by the new OQ6 decision: orders move to Preparing one by one, and orders still Placed do not block other orders.)

**CN-2 — Sign-in method (D13, missing).** D13 gives customers an account but not how they sign in. SMS OTP was not offered because it costs money.
Resolved by Lead, in the Lead's words: "can sign in with phone number + password and sign in with Google. Choosing either of the two methods is fine."

**CN-3 — Google accounts and the D13 profile (D13, CN-2, gap).** A Google sign-in has no phone number, but D13 needs name, phone and default building.
Resolved by Lead: "Require the profile, one method per account": after the first Google sign-in, the customer must fill in phone number + default building before ordering. Each account uses one sign-in method; a phone number cannot be shared between accounts.

**CN-4 — Shop accounts (missing).** Intent does not say how the shop account is created or how many people (owner, kitchen) use it.
Resolved by Lead: "Shop role pre-assigned": one or a few accounts have the shop role, assigned in configuration (e.g. a list of shop emails/phone numbers). All shop accounts have the same rights. The Lead can use one shop account + one customer account to try it out (D11).

**CN-5 — Matching transfers to orders (D9, D16, ambiguous).** Intent says customers pay by QR and the shop confirms, but not how a transfer is matched to an order.
Resolved by Lead: "Per-order QR + customer reports": the app creates a VietQR-standard QR with the amount and order code prefilled in the transfer note. The customer taps "I have transferred"; the shop checks the bank statement and taps confirm. No bank integration.

**CN-6 — What counts as unpaid at the cutoff (D17, OQ1, ambiguous).** An order may be reported but not confirmed, or short of a top-up after an edit.
Resolved by Lead: "Not fully paid = unpaid": only "shop confirmed receipt of the full amount" counts as paid. Every other order (not reported, reported but not confirmed, missing a top-up) goes into the D17 review list. The app shows the amount still owed.

**CN-7 — How far ahead customers can order (D3, D5, ambiguous).** Intent says "the days of the week".
Resolved by Lead: "Next 7 days, days with a menu": customers see and can order today + the next 6 days, only days the shop has put up a menu for and that are not closed. Days without a menu show "no menu yet".

**CN-8 — Default language and what is translated (OQ11, gap).**
Resolved by Lead: "Default Vietnamese, translate the interface": default Vietnamese, a VI/EN switch, the choice remembered per account/browser. Only the app's own text is translated; dish names and building names entered by the shop stay in one language.

**CN-9 — Closed day versus rejection limit (D20 and D22, contradiction).** D22 rejects a closed day's orders in bulk, but D20 allows rejection only before Preparing.
Resolved by Lead: "Before cooking": a day can be marked closed until any order of that day is Preparing, matching D20. After that it can no longer be marked closed.

**CN-10 — Menu or price changed after orders exist (D3, missing).**
Resolved by Lead: "Keep the old price, do not remove ordered dishes": an order stores the prices at the time of ordering; a price change applies only to new orders. A dish cannot be removed from a day that already has orders for it (to drop it, reject those orders).

**CN-11 — Delivery building per order (D13, D14, ambiguous).** D13 stores a default building but does not say whether one order can go elsewhere.
Resolved by Lead: "Can change per order": an order takes the default building, and the customer can change it per order before the cutoff; plus a delivery note field (floor, room).

**CN-12 — Cancelling after the cutoff (D6, gap).** D6 forbids placing and editing after the cutoff but does not mention cancelling.
Resolved by Lead: "No cancelling after the cutoff": customers can only cancel before the cutoff. After the cutoff only the shop can reject (D20), e.g. when the customer calls to ask for cancellation.

**CN-13 — Delivery fails (D10, missing).** D10 has no status for a shipper who cannot hand over an order.
Resolved by Lead: "Still Delivered + note": no new status. The shop marks the order Delivered (left at the counter/reception) with a delivery note; anything else is handled outside the app.

**CN-14 — Time zone and currency (missing).**
Resolved by Lead: "Vietnam time, VND": all dates and times use Asia/Ho_Chi_Minh, even when the user is in another time zone. Money is VND, whole numbers, no fractions.

**CN-15 — Forgotten password (CN-2, missing).** Phone + password sign-in needs a way back in when the password is forgotten; SMS OTP was not offered because it costs money.
Resolved by Lead: "Reset link by email": phone + password accounts must also have an email; the customer taps "Forgot password" and receives a link by email. This needs an email-sending service (free plans with limits exist).

No concern is open.
