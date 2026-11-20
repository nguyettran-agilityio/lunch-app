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
| Fixed dish | A complete meal for one person sold at its own price; the price includes the rice, noodles or other side it comes with, which the shop states in the dish name or description (for example "rice with caramelised ribs", "Hue beef noodle soup"). Shown to customers as "Ready meals" (D2) [CN-30] |
| Build-your-own plate | One rice plate for one person that the customer assembles from that day's dishes; the base price includes the rice; priced as base price plus surcharges. Shown to customers as "Build your own rice plate" (D2, D15) [CN-30] |
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
| Building | Name, address or description, delivery time (one fixed time per building), state: approved, pending or declined (F5), who proposed it (D14) [OQ5] |
| Dish | Name, description, optional English name and English description [CN-31], optional photo, kind (fixed dish and/or build-your-own component), price (fixed dish), group and surcharge (build-your-own), active flag |
| Dish group | Name, minimum count, maximum count, included count, extra dish fee, display order [OQ2] |
| Build-your-own rules | Base price; the groups that make up a plate [OQ2] |
| Shop settings | Default cutoff time, bank details used to build the VietQR code (bank, account number, account holder) [OQ7] [CN-5] |
| Service day | Date, menu (which fixed dishes and which build-your-own components are on sale), cutoff time (default or override), closed flag (D3, D6, D22) [OQ7] |
| Order | Order code ("LA" + service day as MMDD + a sequence number for that day, letters and digits only, for example LA1119007) [CN-20], customer, service day, delivery building, delivery note (floor, room), lines, total, status, payment state, amount paid, refund state, amount to refund, history with times (status changes and every edit with what changed) [CN-32], notes from the shop (D23) [CN-11] [CN-13]; whether the shop kept it at the cutoff review [CN-18] |
| Order line | Fixed dish or build-your-own plate (with its chosen dishes), quantity (portions), unit price as at the time of ordering (D23) [CN-10] |
| Cart | One cart per service day per customer: lines not yet placed as an order [CN-16] |
| Payment record | Order, amount, time the customer reported "I have transferred" (if they did) and the amount reported, time and account of the shop's confirmation, or the shop's "Not received yet" (D9) [CN-5] [CN-37] [CN-41] |
| Refund record | Order, amount, reason (customer cancel, edit lowered the total, shop reject, closed day, building not approved), time it was recorded, time and account of the shop's "refunded" mark, and how it was actually refunded: bank transfer or cash (D19) [OQ1] [OQ4] [CN-53] [CN-54] |
| Refund destination | Per order: how the customer wants to receive the refund: bank transfer to a bank, account number and account holder, or to a photo of a QR code uploaded by the customer; or cash at delivery, only for an order still to be delivered [CN-54]; entered by the customer when the order needs a refund, not saved to the profile [CN-33] |

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
| Reported | Customer tapped "I have transferred"; the shop has not confirmed. The app records the amount reported, which is the amount the app asked for at that moment. An Underpaid order the customer reports shows Reported, together with the amount still owed [CN-24]. Editing the order keeps the report and its amount; if the new total is higher, the customer is asked only for the difference and can report again for it [CN-37]. The report stays on a Cancelled or Rejected order until the shop confirms it or taps "Not received yet" [CN-39] [CN-41] |
| Paid | The shop confirmed receipt of the full total. The shop can confirm from Unpaid or from Reported [CN-17]. A Paid order with a report still open (for example after an edit back down) stays Paid, with the line "Customer reported X, waiting for confirmation"; the shop's "Reported" filter still lists it [CN-47] |
| Underpaid | The shop confirmed some money, but the total later went up (edit), or the shop confirmed a report that was less than the new total; the app shows the amount still owed [OQ1] [CN-38] |

Only **Paid** counts as paid. Unpaid, Reported and Underpaid all count as unpaid at the cutoff (D17) [CN-6].

### 4.3 Refund state (separate from status, D19)

| State | Meaning |
|---|---|
| None | Nothing to give back |
| Needs refund | The app has recorded an amount the shop must return, with the reason |
| Refunded | The shop returned the money outside the app and marked it here, with how: bank transfer or cash [CN-54] |

An order needs a refund when money confirmed by the shop is more than what the customer now owes: a paid order is cancelled (D19), rejected (D20, D22) [OQ4], rejected because its building was not approved [OQ3], or edited to a lower total [OQ1]. Money that is only reported is not refunded until the shop confirms it received it; the refund is recorded at that moment, with the reason the order was cancelled or rejected, or "edit lowered the total" for an order still active [CN-38] [CN-39]. A refund not yet marked Refunded is recalculated at every edit: if the total goes back up, it is dropped and the money the shop holds counts toward the new total; a refund already marked Refunded is never dropped [CN-40].

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
- **BR-11a** The customer has one cart per service day. Dishes and plates added on a day's menu go into that day's cart; placing the cart creates one order for that day and empties that cart. Carts of other days are not affected [CN-16].
- **BR-12** An order is delivered to the customer's default building unless the customer picks another building for that order before the cutoff. An order can carry a delivery note (floor, room) [CN-11].
- **BR-13** Before the cutoff the customer can edit or cancel their order, unless it is already Preparing. After the cutoff they can do neither; only the shop can reject (D6, D20) [CN-12] [OQ6].
- **BR-14** Editing an order returns it to Placed; the shop must confirm it again (D18) [OQ10]. The customer makes all changes of one edit (quantities, removed lines, added fixed dishes, added build-your-own plates, building, note) and saves them once with "Save"; adding a plate does not save the order on its own [CN-29]. Every saved edit is recorded in the order history with its time, the old and new total, and what changed: lines added or removed, quantities changed, building changed, note changed. Customer and shop both see it [CN-32].
- **BR-15** A customer must have a complete profile (name, phone number, default building) before ordering. A Google sign-in without a phone number is sent to profile completion first (D13) [CN-3].

### Buildings

- **BR-16** Customers pick a building from the approved list, or enter one that is not listed; that building is pending until the shop approves it (D14). A pending building is shown only to the customer who proposed it; other customers propose it again or wait for the shop to approve it [CN-25].
- **BR-17** An order to a pending building can be placed and stays Placed; the shop cannot confirm it until the building is approved. If the shop does not approve the building, it rejects the order, with a refund if paid [OQ3]. Declining a building rejects all its active orders in one action; before the shop confirms, the app shows the list of orders that will be rejected and the amount to refund for each [CN-26]; for an order with a transfer reported but not confirmed, the list also shows that amount, to be refunded if the shop confirms it received it [CN-39].
- **BR-18** Each building has one fixed delivery time, set when the shop adds or approves it. The shop can change it; the change applies to days not yet past the cutoff (D8) [OQ5].

### Payment and refunds

- **BR-19** Customers pay when they order (D16). The app shows a VietQR code for the order with the amount and the order code prefilled in the transfer note. The customer taps "I have transferred"; the shop checks its bank statement and confirms receipt. The shop can also confirm receipt of an order the customer has not reported (Unpaid), for example when the customer forgot to tap the button. There is no bank integration (D9) [CN-5] [CN-17]. The shop's "Payment received" always records the full amount still owed; a transfer of less than that is not recorded as a partial payment [CN-28]. When the customer has reported a transfer, "Payment received" records exactly the amount reported instead: if the order now costs more, the rest is still owed (Underpaid); if it now costs less, the difference is recorded as Needs refund [CN-38]. The shop can confirm a reported transfer also on a Cancelled or Rejected order; the amount is then recorded as Needs refund [CN-39]. When the shop does not find a reported transfer in its bank statement, it taps "Not received yet": the report is cleared, the order goes back to Unpaid (or Underpaid), the customer sees that the shop has not found the transfer and the QR again, and the order history records it [CN-41]. Each tap on "I have transferred" is its own report with its own amount; the shop answers each report on its own with "Payment received" or "Not received yet", matching each transaction in its bank statement [CN-43]. On a Cancelled or Rejected order, "Not received yet" shows the customer only the notice, without a QR, because nothing is owed [CN-44]. "Show QR again" shows a QR for exactly the amount reported, with "Transfer of X reported, waiting for the shop to confirm" and no button to report more [CN-45]. The "not found" notice stays until the customer reports a transfer again or the shop taps "Payment received"; an edit does not remove it [CN-46]. Next to the button for each report, the shop has "Received the rest" for the amount owed that the customer has not reported [CN-48]. With several reports open, "Show QR again" carries the latest report [CN-49]. "Payment received" on another report does not remove the "not found" notice; it goes away only when the customer reports again or the shop taps "Received the rest" [CN-50]. On a Paid order, "Not received yet" shows the customer the notice without a QR, as on a closed order [CN-51]. A Cancelled or Rejected order with a report open has no "Show QR again" [CN-52]. Once the customer has tapped "I have transferred" (Reported), the payment screen and the order no longer show the QR; they show "Transfer reported, waiting for the shop to confirm" with the amount, and a "Show QR again" link, before and after the cutoff [CN-34].
- **BR-20** When a paid order is edited to a higher total, the payment state becomes Underpaid and the app shows a QR for the difference; the shop confirms it the same way. When the total goes down, the difference is recorded as Needs refund (D19) [OQ1]. Editing after reporting a transfer does not lose the reported amount (BR-19) [CN-37]; a refund not yet sent is recalculated at each edit [CN-40].
- **BR-21** Every refund works the same way: the app records the amount and reason as Needs refund; the shop returns the money outside the app and marks it Refunded. This covers customer cancellation, edits that lower the total, shop rejection, closed days and unapproved buildings (D19, D20, D22) [OQ1] [OQ3] [OQ4]. When an order needs a refund, the customer can enter where to receive it on that order: bank, account number and account holder, or upload a photo of a QR code. The shop's Refunds screen shows it. If the customer has not entered it, the Refunds screen says so, and the shop can still mark the refund Refunded (for example after refunding to the account seen in the bank statement or after calling the customer) [CN-33]. A pending refund does not block confirming, cooking or delivering the order; it is always shown to the shop on the Orders screen, the order detail and the delivery list [CN-53]. A refund pending for more than one hour shows a red reminder on every shop screen ("N orders not refunded, X in total", counting every refund not made) that opens the Refunds screen; "Seen" hides it for one hour, then it shows again until every refund is made [CN-53] [CN-55]. A refund recalculated by an edit keeps the time of the first one [CN-55]. The customer chooses how to receive it: bank transfer, or cash at delivery for an order still to be delivered (not yet Delivering or Delivered, not Cancelled or Rejected); if cash was chosen and the order is then cancelled or rejected, the choice goes back to not chosen. On the delivery list the shop taps "Cash given back" for that order; if the shop or shipper has no cash ready, the shop contacts the customer and transfers, and still marks it Refunded. When marking Refunded the shop picks bank transfer or cash, defaulting to the customer's choice (bank transfer when not chosen), and both sides see how it was refunded [CN-54] [CN-55]. "Cash given back" is on the delivery list only when the customer chose cash or has not chosen [CN-55].

### Shop review and day run

- **BR-22** The shop confirms orders before the cutoff (D18). Orders still Placed at the cutoff stay Placed; after the cutoff the shop confirms or rejects each one [CN-1].
- **BR-23** At the cutoff the shop reviews every order whose payment state is not Paid and chooses to reject it or keep it (D17) [CN-6]. The review list shows the amount still owed; when the customer has reported a transfer, it shows the amount not confirmed, the amount reported and what is still to transfer [CN-42]. A kept order leaves the review list and is marked "kept"; it is still not Paid, and the Orders screen still shows the amount owed until the shop confirms the payment [CN-18]. An order not Paid that is already Preparing (or later) can only be kept, not rejected (D20) [CN-27].
- **BR-24** The shop moves orders to Preparing one order at a time, at any time, also before the cutoff. Only a Shop confirmed order can move to Preparing; orders still Placed do not block other orders. The shop can select several Shop confirmed orders and start preparing them in one action; each order still moves on its own, Placed orders cannot be selected, and there is no "whole day" button. Once an order is Preparing the customer can no longer edit or cancel it, even before the cutoff, and the shop can no longer reject it (D7, D20) [OQ6].
- **BR-25** The shop sees the preparation sheet for a day: portions of each fixed dish and of each build-your-own component, split into columns by status (Preparing, Shop confirmed not yet preparing, still Placed, and Done for orders already Delivering or Delivered) with a total for the whole day. Rejected and Cancelled orders are not counted (D7) [OQ6] [CN-21].
- **BR-26** The shop sees the delivery list grouped by building, ordered by delivery time, with each order's customer name, phone number, lines, delivery note and payment state (D8). The list shows orders from Shop confirmed onwards (Shop confirmed, Preparing, Delivering, Delivered); a Shop confirmed order is shown so the shop knows it is coming, but only a Preparing order can move to Delivering [CN-19].
- **BR-27** The shop moves orders to Delivering and Delivered per building or per order. If a customer cannot be reached, the shop still marks the order Delivered (for example left at reception) with a delivery note; anything further is handled outside the app (D10) [OQ6] [CN-13].
- **BR-28** The shop can mark a day closed until any order of that day is Preparing. Marking a day closed rejects all its active orders in bulk and records refunds for paid ones; customers see the day as closed (D20, D22) [CN-9].

### Accounts, language and devices

- **BR-29** Customers sign up and sign in with phone number + password, or with Google; either is fine. Each account uses one method; a phone number cannot belong to two accounts. A phone + password account must also have an email. A customer who forgets the password taps "Forgot password" and receives a reset link by email [CN-2] [CN-3] [CN-15].
- **BR-30** The interface is available in Vietnamese and English, Vietnamese by default, with a VI/EN switch remembered per account and per browser. Only the app's own text is translated; dish and building names entered by the shop are shown as entered [OQ11] [CN-8]. Exception: a dish can have an optional English name and English description; in English the app shows them when present and the Vietnamese ones otherwise. Building names stay as entered [CN-31].
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
| S-C4 | Day menu | Fixed dishes ("Ready meals") with prices; entry to the plate builder ("Build your own rice plate"); add to that day's cart (BR-2, BR-11a) [CN-30] |
| S-C5 | Plate builder | Groups with min/max/included counts, chosen dishes, live plate price; blocks invalid plates (BR-7–BR-9) |
| S-C6 | Cart and checkout | One cart per service day (BR-11a); lines and quantities, delivery building (default, changeable) and note, total; place order (BR-10, BR-12) |
| S-C7 | Payment | VietQR with amount and order code, "I have transferred" button, amount still owed if Underpaid (BR-19, BR-20); once Reported, "Transfer reported, waiting for the shop to confirm" instead of the QR, with "Show QR again" [CN-34]; after an edit that raised the total, the reported amount and a QR for the difference only [CN-37]; after the shop's "Not received yet", a notice that the shop has not found the transfer, and the QR [CN-41] |
| S-C8 | My orders | Orders by day with status, payment state and refund state (BR-32) |
| S-C9 | Order detail | Lines, total, building, history of status changes and edits (CN-32); edit and cancel before the cutoff while not Preparing (BR-13, BR-14). Editing can change the quantity of any line or remove it, add fixed dishes, add new build-your-own plates, and change the building and note; the dishes inside a plate already ordered cannot be changed [CN-23]; all changes are saved together with one "Save" [CN-29]. When the order needs a refund: enter where to receive it (bank, account number, account holder, or a QR photo) [CN-33]. Money rows: received by the shop, reported and waiting for the shop (also on a Cancelled or Rejected order), refund pending, refunded, still to transfer [CN-37] [CN-39]. How to receive a refund: bank transfer (account or QR photo) or, for an order still to be delivered, cash at delivery; a refund made shows how it was made [CN-54] |

### Shop

| # | Screen | Shows / does |
|---|---|---|
| S-S1 | Dishes | Dish list: add, edit, deactivate; fixed price, group and surcharge (BR-1, BR-6) |
| S-S2 | Build-your-own rules | Base price; groups with min, max, included count, extra dish fee (BR-7) |
| S-S3 | Days | Calendar of service days: set menu, cutoff override, mark closed (BR-2, BR-4, BR-28) |
| S-S4 | Settings | Default cutoff time; bank details for VietQR (BR-4, BR-19) |
| S-S5 | Buildings | Approved buildings with delivery times; pending buildings to approve or decline; declining first shows the orders that will be rejected and the amount to refund for each (BR-16–BR-18) [CN-26] |
| S-S6 | Orders | Orders of a day, filter by status/payment/building; confirm, reject, confirm payment (from Unpaid or Reported, CN-17); amount owed and "kept" mark (CN-18); for a reported transfer: "Not confirmed X · customer reported Y transferred, Z still to transfer" (CN-42), "Payment received" for the reported amount (CN-38) and "Not received yet" (CN-41); select several Shop confirmed orders and start preparing them (BR-19, BR-22, BR-24); each order with a pending refund shows the amount and how the customer wants it [CN-53] |
| S-S7 | Cutoff review | After the cutoff: orders still Placed and orders not Paid and not yet kept, with amount owed; keep or reject each; a kept order leaves the list (BR-22, BR-23) [CN-18] |
| S-S8 | Preparation sheet | Portions per dish for the day, split by status (including Done, CN-21) with a total; "Start preparing" per Shop confirmed order or for several selected ones (BR-24, BR-25) |
| S-S9 | Delivery list | Orders from Shop confirmed onwards (CN-19), by building and delivery time; mark Delivering / Delivered per building or per order, with note (BR-26, BR-27); each order with a pending refund shows the amount and how the customer wants it (bank transfer, cash to give back, or not chosen yet), with "Cash given back · X"; "Delivered" does not record the refund [CN-53] [CN-54] |
| S-S10 | Refunds | The section for refunds not yet made: top part "Not refunded" with amount, reason, day, customer phone, how the customer wants it (account, QR photo, cash at delivery) or "customer has not sent an account yet" (CN-33); mark Refunded by bank transfer or cash (defaults to the customer's choice); lower part "Refunded" with how; open the order (BR-21) [CN-35] [CN-53] [CN-54] |
| S-S11 | Order detail (shop) | Opened from any order on the shop screens, including Cancelled and Rejected orders and orders of any day: lines, total, customer name and phone, building and note, status, payment and refund state with refund destination, history of status changes and edits; the same actions as on the Orders screen [CN-35]; a pending refund with its amount and how the customer wants it, marked Refunded by bank transfer or cash [CN-53] [CN-54]; with a reported transfer, the amounts as on S-S6, "Payment received" (also on a Cancelled or Rejected order) and "Not received yet" [CN-39] [CN-41] [CN-42] |

## 7. Flows

**F1 Customer orders and pays.** Sign in → (complete profile if needed) → week view → pick a day → add fixed dishes and/or build a plate → checkout (building, note) → order is Placed → payment screen: scan QR, transfer, tap "I have transferred" → payment state Reported → shop confirms → Paid.

**F2 Customer edits or cancels.** Before the cutoff, while the order is not Preparing: open the order → edit → order returns to Placed; if paid and the total went up, pay the difference (Underpaid until confirmed); if it went down, the difference is Needs refund. Or cancel → Cancelled; if paid, Needs refund. After the cutoff, or once the order is Preparing: no edit or cancel; the customer contacts the shop, which may reject until the order is Preparing.

**F3 Shop daily run (D12).** Before the day: set dishes, rules, the day's menu and cutoff. Before the cutoff: confirm incoming orders and payments. At the cutoff: open the cutoff review, decide every order still Placed and every order not Paid. Start preparing order by order (any Shop confirmed order, also before the cutoff), using the preparation sheet. Deliver by building using the delivery list: Delivering, then Delivered. Finish payments and refunds: every order is Paid or rejected, every Needs refund is Refunded.

**F4 Closed day.** Shop marks a day closed (before any order is Preparing) → all active orders of that day are Rejected → paid ones are Needs refund → customers see the day as closed.

**F5 New building.** Customer proposes a building (profile or checkout) → building is pending → orders to it stay Placed → shop approves it and sets its delivery time, then confirms the orders; or declines it and rejects the orders (with refunds if paid), after seeing the list of orders and refund amounts [CN-26].

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
| AC9 | The cutoff has passed | The shop opens the cutoff review | It lists every order still Placed and every order not Paid (Unpaid, Reported, Underpaid) with the amount owed; each order still Placed can be confirmed or rejected, and each order not Paid can be kept or rejected (an order already Preparing can only be kept, CN-27); a confirmed order that is still not Paid stays on the list until it is kept or rejected; a kept order leaves the list and keeps showing the amount owed on the Orders screen [CN-22] |
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
| AC21 | A customer has items in Monday's cart | They add a dish from Tuesday's menu and place Tuesday's cart | Tuesday's order is created; Monday's cart is unchanged |
| AC22 | An Unpaid order (the customer did not tap "I have transferred") | The shop confirms receipt | The payment state becomes Paid |
| AC23 | Orders of one day in Placed, Shop confirmed and Preparing | The shop opens the delivery list | It shows the Shop confirmed and Preparing orders, not the Placed one; only the Preparing order can be marked Delivering |
| AC24 | A pending building with one Unpaid and one Paid order | The shop taps decline | The app lists both orders with the amount to refund (0 and the paid amount) before anything changes; after the shop confirms, both are Rejected and the paid one Needs refund [CN-26] |
| AC25 | After the cutoff, an order that is Preparing and not Paid | The shop opens the cutoff review | The order can be kept, and there is no reject action for it [CN-27] |
| AC26 | An open order with one plate | The customer opens Edit, adds a new plate and changes a quantity, then taps Save | The order changes once, returns to Placed, and the history shows one edit with the old and new total and each change [CN-29] [CN-32] |
| AC27 | A paid order the customer cancels | The customer enters bank, account number and account holder (or uploads a QR photo) | The shop's Refunds screen shows that destination with the amount; without it, the screen says the customer has not sent an account and the shop can still mark it Refunded [CN-33] |
| AC28 | An order the customer has reported as transferred | The customer opens its payment screen, before or after the cutoff | No QR is shown; the screen says the transfer is reported and waiting for the shop, with "Show QR again" [CN-34] |
| AC29 | A dish with an English name and one without | The customer switches to English | The first shows its English name, the second its Vietnamese name [CN-31] |
| AC30 | A 250,000 VND order the customer has reported as transferred, not confirmed | The customer edits it to 290,000 | The order still shows 250,000 reported and waiting for the shop, and asks only for 40,000 (QR for 40,000) [CN-37] |
| AC31 | A transfer of 250,000 reported, not confirmed | The order is now 290,000, or now 210,000, and the shop taps "Payment received" | 250,000 is recorded as received: for 290,000 the order is Underpaid with 40,000 owed; for 210,000 it is Paid and 40,000 Needs refund [CN-38] |
| AC32 | A transfer of 250,000 reported, not confirmed | The customer cancels, or the shop rejects, or the day is closed, or the building is declined | No refund is recorded yet and the order still shows 250,000 reported; when the shop taps "Payment received" on it, 250,000 Needs refund with the reason of the cancellation or rejection [CN-39] |
| AC33 | A paid 250,000 order edited to 210,000 (40,000 Needs refund, not yet Refunded) | The customer edits it to 290,000 | The 40,000 refund is gone and 40,000 is owed; if the 40,000 had already been marked Refunded, 80,000 is owed [CN-40] |
| AC34 | A transfer of 250,000 reported | The shop taps "Not received yet" | The order is Unpaid again, the customer sees that the shop has not found the 250,000 transfer and the QR, and the history records it [CN-41] |
| AC35 | A 290,000 order with 250,000 reported, not confirmed | The shop opens the Orders screen or the cutoff review | It shows 290,000 not confirmed, 250,000 reported, 40,000 still to transfer; the order counts as not Paid [CN-42] |
| AC36 | A 290,000 order with two reports, 250,000 and 40,000 | The shop taps "Payment received" on the 250,000 report and "Not received yet" on the 40,000 report | 250,000 is recorded as received, the order is Underpaid with 40,000 owed, and the customer sees that the shop has not found the 40,000 transfer [CN-43] |
| AC37 | A cancelled order with 250,000 reported, not confirmed | The shop taps "Not received yet" | The customer sees that the shop has not found the 250,000 transfer, with no QR; nothing is recorded as Needs refund [CN-44] |
| AC38 | A paid 250,000 order edited to 290,000, 40,000 reported, then edited back to 250,000 | The customer and the shop open the order | It shows Paid with "40,000 reported, waiting for confirmation"; the shop's "Reported" filter lists it; confirming the report records Needs refund 40,000 [CN-47] |
| AC39 | A 290,000 order with 250,000 reported, not confirmed | The shop taps "Received the rest" | 40,000 is recorded as received; the 250,000 report stays open [CN-48] |
| AC40 | An order with two open reports, 250,000 then 40,000 | The customer taps "Show QR again" | The QR carries 40,000 [CN-49] |
| AC41 | A paid 90,000 order edited down to 45,000 (45,000 Needs refund) | The shop confirms it, starts preparing and opens the Orders screen, the order detail and the delivery list | Nothing is blocked; each screen shows the 45,000 pending refund and how the customer wants it [CN-53] |
| AC42 | A refund recorded at 10:00 and not made | The demo time reaches 11:00; the shop taps "Seen"; the time reaches 12:00 | A reminder with the count and total shows on the shop screens and opens the Refunds screen; "Seen" hides it until 12:00, when it shows again; once refunded it no longer shows [CN-53] |
| AC43 | An order still to be delivered with a pending refund, and a cancelled one | The customer opens how to receive the refund | The first offers bank transfer or cash at delivery; the cancelled one offers bank transfer only; an order with cash chosen that is then rejected goes back to not chosen [CN-54] |
| AC44 | An order with cash chosen and one with no choice, both with a pending refund | The shop opens the delivery list | Both show the amount to give back ("cash" / "not chosen yet") with "Cash given back"; tapping "Delivered" leaves the refund pending; tapping "Cash given back" marks it Refunded by cash [CN-54] |
| AC45 | A refund with cash chosen | The shop marks it Refunded by bank transfer from the Refunds screen | It is Refunded, and customer and shop see "Refunded … by bank transfer" [CN-54] |

## 9. Out of scope for the first version

From intent: multiple shops; shippers using the app; a daily portion limit (D21).

Decided while writing this spec: push, email or SMS notifications about orders (email is used only for password reset) [OQ6] [CN-15]; bank integration or automatic payment matching [CN-5]; a "delivery failed" status [CN-13]; translating shop-entered content [CN-8]; linking two sign-in methods to one account [CN-2] [CN-3]; customer cancellation after the cutoff [CN-12]; staff roles with different rights inside the shop [CN-4]; a success threshold beyond one full day [OQ9]; ordering one meal shared by several people, planned for v2 [CN-36].

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
Resolved by Lead (follow-up on the shop's order screen): "Allow selecting several orders": the shop ticks several Shop confirmed orders and taps "Start cooking" once; each order still moves on its own. Placed orders cannot be selected. There is no "whole day" button.

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

**CN-16 — Cart across days (D5, OQ8, missing).** An order belongs to one service day, but the spec did not say what happens when a customer's cart has dishes from one day and they add a dish from another day.
Resolved by Lead: "One cart per day": carts are kept separately per day; each day is placed as its own order. Matches OQ8 (several orders per day, each paid separately).

**CN-17 — Shop confirms a payment the customer did not report (D9, CN-5, missing).** A customer may transfer the money but forget to tap "I have transferred", leaving the order Unpaid.
Resolved by Lead: "Yes, from both Unpaid and Reported": when the shop sees the money in the bank statement it can confirm, without waiting for the customer to tap.

**CN-18 — What "keep" does at the cutoff review (D17, CN-6, missing).** The spec said the shop keeps or rejects each unpaid order but not whether a kept order stays on the review list.
Resolved by Lead: "Leaves the list, marked "kept"": the order is marked as reviewed/kept, is still not Paid, and still shows the amount owed on the Orders screen; the review list only shows orders not yet decided.

**CN-19 — Which orders the delivery list shows (D8, OQ6, missing).**
Resolved by Lead: "From Shop confirmed onwards": it also shows Shop confirmed orders (not cooking yet, cannot be marked delivering yet) so the shop knows in advance; only Preparing orders can move to Delivering.

**CN-20 — Order code format (D9, CN-5, missing).** The order code goes into the transfer note, and the shop looks for it in the bank statement.
Resolved by Lead: "LA + date + sequence number": for example LA1119007: only letters and digits (banks often strip special characters), and the delivery date can be read from it.

**CN-21 — Delivering and Delivered orders on the preparation sheet (D7, OQ6, missing).** The sheet had columns for Preparing, Shop confirmed and Placed, but not for orders that have already left the kitchen.
Resolved by Lead: "Separate "Done" column": a column for Delivering + Delivered orders; the total still covers the whole day.

**CN-22 — An order both still Placed and not Paid at the cutoff review (D17, D18, BR-22, AC9, contradiction).** AC9 said every listed order can be kept or rejected, while BR-22 said an order still Placed is confirmed or rejected.
Resolved by Lead: "Confirm = keep": a Placed order is confirmed or rejected; once confirmed, if money is still owed it moves to the "not fully paid" group to be kept or rejected. AC9 is reworded to match BR-22.

**CN-23 — What a customer can change when editing an order (S-C9, BR-14, missing).**
Resolved by Lead: "Can add new plates, reduce or remove old plates": new build-your-own plates are added through the plate builder; an old plate can only change its quantity or be removed, the dishes inside it cannot be changed.

**CN-24 — Underpaid and Reported at the same time, and editing after reporting (D18, OQ1, CN-6, missing).**
Resolved by Lead: "Show "Reported" + the amount still owed": Reported wins over Underpaid but the amount still owed is still shown. Editing the order clears the "reported" flag, because the amount to pay has changed. (This last sentence is replaced by CN-37.)

**CN-25 — Who sees a pending building (D14, BR-16, missing).** A building proposed by one customer is pending until the shop approves it.
Resolved by Lead: "Only the proposer sees it": other customers propose it again or wait for the shop to approve it; this avoids showing a building that has not been checked.

**CN-26 — Declining a building with orders (F5, AC14, BR-17, ambiguous).** F5 says the shop "declines it and rejects the orders", AC14 says declining "lets the shop reject"; the prototype rejected all orders in one tap.
Resolved by Lead: "Not approving a building: keep it, but before tapping, show the list of orders that will be rejected and the amount to refund, to confirm."

**CN-27 — Unpaid order already Preparing at the cutoff review (AC9, BR-24, D20, contradiction).** AC9 lets the shop keep or reject every order not Paid, but BR-24 forbids rejecting an order that is Preparing.
Resolved by Lead: "An order already in the kitchen and not fully paid on the review screen: only "Keep", no reject (matches D20)."

**CN-28 — "Payment received" when the customer transferred less (BR-19, CN-17, missing).**
Resolved by Lead: ""Payment received" when the customer transferred less: keep it as it is now, always record the full amount."

**CN-29 — Adding a plate to an order already placed (S-C9, CN-23, missing).** The prototype saved a new plate at once as its own edit, apart from the "Edit order" form.
Resolved by Lead: "Adding a plate to an order already placed: edit first, then tap "Save" once."

**CN-30 — What a fixed dish and a build-your-own plate are (D2, glossary, ambiguous).** Trying the prototype, the labels "Món theo suất" and "Tự chọn đĩa" did not say whether a dish comes with rice or whether a plate is one person's rice portion.
Resolved by Lead: "Complete meal": a fixed dish is one complete meal for one person; its price includes the rice/noodles that come with it (the shop writes it in the dish name or description, e.g. "Cơm sườn ram", "Bún bò Huế"). A build-your-own plate is one rice plate for one person; the base price includes the rice. Change the labels to "Phần ăn sẵn" and "Cơm tự chọn".

**CN-31 — Dish names in English (CN-8, BR-30, prototype feedback).** With EN selected, dish names stayed in Vietnamese.
Resolved by Lead: "Add an optional English name": a dish has an optional "English name" field (and an English description); when EN is selected and the dish has an English name, the English name is shown, otherwise the Vietnamese name. Buildings stay unchanged.

**CN-32 — Edits in the order history (S-C9, BR-14, missing).** After an edit, the order history did not record it.
Resolved by Lead: "Record the changes in detail": each time the customer saves an edit, add a line "Order edited" with the time and the old → new total, then the line "Placed" (back to waiting for confirmation), with the details: dishes added/removed/quantity changed, building changed, note changed. Customer and shop both see it.

**CN-33 — Where the shop sends a refund (BR-21, S-S10, missing).** Trying the prototype, the shop did not know where to refund a customer who cancelled a paid order.
Resolved by Lead: "When an order needs a refund, the customer enters the bank + account number for the refund in the app; the shop's Refunds screen shows that information. Or the customer can upload a QR code as an image."
Resolved by Lead (follow-up on where it is kept): "Per order": the customer enters it separately for the order that needs a refund; a later order that needs a refund is entered again. Not saved to the profile.
Resolved by Lead (follow-up on a missing account): "Allowed, with a reminder": the Refunds screen shows "The customer has not sent a receiving account", but the shop can still tap "Refunded" (e.g. already refunded from the bank statement or after calling the customer).
Resolved by Lead (follow-up on the fields): "Bank + account number + account holder name".

**CN-34 — QR shown after the transfer is reported (S-C7, BR-19, CN-24, prototype feedback).** After the customer reported the transfer, opening the order after the cutoff still showed the QR.
Resolved by Lead: it should show "Transfer reported, waiting for the shop to confirm".
Resolved by Lead (follow-up on when): "Always once reported": before or after the cutoff alike; with a small "Show QR again" link in case the customer needs to transfer again.

**CN-35 — Shop opens an order (S-S6, S-S10, prototype feedback).** The shop screens had no order detail; a cancelled paid order of another day could not be found from the Refunds screen, and an order of a later day (Saturday) could not be opened.
Resolved by Lead: "The shop needs to tap to see the detail of each order."

**CN-36 — One meal shared by several people (prototype feedback).**
Resolved by Lead: "Eating together with several people: leave it for v2, create a GitHub issue, do not do it now." Tracked in issue #18.

**CN-37 — Editing an order after reporting a transfer (CN-24, BR-19, BR-20, prototype feedback).** Trying the prototype: a 250,000 order, the customer tapped "I have transferred", the shop had not confirmed; the customer edited the order to add Bún bò (40,000), and after saving the app asked for 290,000 although 250,000 had been transferred. CN-24 cleared the report on every edit, and the app did not record how much was reported.
Resolved by Lead: "Remember the amount reported": when the customer taps it, the app records the amount reported (250,000). After the edit, the order still shows "Transfer of 250,000 reported, waiting for the shop to confirm" and asks only for the difference of 40,000 (QR for 40,000). The customer can report again for the 40,000. This replaces "Editing the order clears the reported flag" in CN-24.

**CN-38 — What "Payment received" records when the customer has reported a transfer (CN-28, BR-19, missing).** The order has a reported transfer (for example 250,000 reported, the order now 290,000 or 210,000).
Resolved by Lead: "Exactly the amount the customer reported": record 250,000. For an order of 290,000, 40,000 is still owed (Underpaid). For an order of 210,000, the app records Needs refund 40,000 by itself. An order the customer has not reported still records the full amount still owed, as in CN-28.

**CN-39 — A reported transfer, not confirmed, on an order that is then cancelled or rejected (BR-19, BR-21, D19, D20, D22, missing).** The customer cancels, the shop rejects, the day is closed, or the building is declined, while the transfer is reported and not yet confirmed; the prototype recorded no refund.
Resolved by Lead: "The shop can still confirm": the cancelled or rejected order still shows "Transfer of 250,000 reported, waiting for the shop to confirm". The shop checks the bank statement and taps "Payment received" on that order; the app then records Needs refund 250,000 by itself. No refund is recorded before the shop sees the money. The list shown before declining a building says clearly "250,000 if the shop confirms it received it".

**CN-40 — Editing down and then up while a refund is not yet sent (BR-20, BR-21, missing).** A paid 250,000 order edited to 210,000 (Needs refund 40,000, the shop has not refunded it yet), then edited to 290,000.
Resolved by Lead: "Offset": a 40,000 refund not yet sent is dropped and everything is recalculated: the shop holds 250,000, the order is 290,000, 40,000 is still owed. If the shop has already tapped "Refunded", it is not dropped, and then 80,000 is owed.

**CN-41 — The shop does not find a reported transfer (BR-19, CN-39, missing).** The customer reported 250,000 but the shop does not see the money in its bank statement; without an action, a cancelled order would stay "waiting for the shop to confirm" forever.
Resolved by Lead: "A "Not received yet" button": tapping it clears that report: the order goes back to Unpaid (or Underpaid), the customer sees "The shop has not found the transfer of 250,000, please check again" and the QR shows again. It is recorded in the order history.

**CN-42 — The amount owed the shop sees when a transfer is reported (BR-23, S-S6, S-S7, CN-6, missing).** A 290,000 order with 250,000 reported and not confirmed.
Resolved by Lead: "Show both": "Not confirmed 290,000 · customer reported 250,000 transferred, 40,000 still to transfer". The order still counts as unpaid at the cutoff, as in CN-6.

**CN-43 — Several reports on one order (CN-37, CN-38, CN-41, missing).** The customer reports 250,000, edits the order, then reports 40,000; the shop finds only one of the two transfers in its bank statement.
Resolved by Lead: "Each one separately": each report is its own line (250,000, 40,000). The shop taps "Payment received" or "Not received yet" for each line, matching each transaction in the bank statement.

**CN-44 — "Not received yet" on a Cancelled or Rejected order (CN-39, CN-41, missing).** CN-41 says the order goes back to Unpaid and the QR shows again, but a closed order owes nothing.
Resolved by Lead: "Notice only": the customer sees "The shop has not found the transfer of 250,000, please check again or call the shop". No QR, because the order no longer owes anything. If the money really was transferred, the customer calls the shop.

**CN-45 — The amount on "Show QR again" (CN-34, CN-37, missing).**
Resolved by Lead: "The amount reported": the QR carries exactly the amount reported (e.g. 40,000), with the line "Transfer of 40,000 reported, waiting for the shop to confirm", and no button to report more.

**CN-46 — How long the "not found" notice stays (CN-41, missing).**
Resolved by Lead: "Until reported again": until the customer reports a transfer again or the shop taps "Payment received". Editing the order does not remove the notice.

**CN-47 — A Paid order with a report still open (4.2, CN-37, CN-43, missing).** A paid 250,000 order is edited to 290,000, the customer reports 40,000, then edits back to 250,000; the 40,000 report is still waiting for the shop.
Resolved by Lead: "Paid + a note": it shows "Paid" because the shop confirmed the full amount, with the line "Customer reported 40,000, waiting for confirmation". The shop's "Reported" filter still lists the order so the shop handles it (confirming records Needs refund 40,000).

**CN-48 — Money the customer sent but did not report while another report is open (CN-17, CN-38, CN-43, missing).** A 290,000 order, 250,000 reported; the customer also sent 40,000 but forgot to tap; the shop sees both in its bank statement.
Resolved by Lead: "A separate button": besides the button for each report, the shop has "Received the rest · 40,000" for the amount the customer has not reported (like CN-17: confirm when the customer forgot to tap).

**CN-49 — "Show QR again" with several reports open (CN-45, CN-43, missing).** Two reports are waiting (250,000 and 40,000).
Resolved by Lead: "The latest report": the QR carries 40,000, the latest transaction, the one the customer may need to transfer again.

**CN-50 — Which "Payment received" removes the "not found" notice (CN-43, CN-46, missing).** An order has two reports; the shop taps "Not received yet" on 40,000, then "Payment received" on 250,000.
Resolved by Lead: "It does not go away": "Payment received" for another report does not remove the notice about 40,000. The notice goes away only when the customer reports again or the shop taps "Received the rest" (money not reported).

**CN-51 — "Not received yet" on a Paid order with a report open (CN-47, CN-41, CN-44, missing).** The order is paid in full but a 40,000 report is still open; the shop taps "Not received yet".
Resolved by Lead: "Notice, no QR": as in CN-44: "The shop has not found the transfer of 40,000. Please check again or call the shop", no QR because the order owes nothing. The notice goes away when the order's money changes again (the customer reports again).

**CN-52 — "Show QR again" on a Cancelled or Rejected order with a report open (CN-34, CN-39, CN-45, missing).**
Resolved by Lead: "No": a closed order needs no more transfer; it only shows "Transfer of X reported, waiting for the shop to confirm".

**CN-53 — A pending refund on an order that is still cooked, and a forgotten refund (BR-21, BR-24, prototype feedback).** Trying the prototype: the customer edits an order down; while the refund is pending the shop can still confirm and cook the order, and if the shop forgets the refund, nobody reminds it.
Resolved by Lead: "Do not block cooking. A pending refund must always be shown clearly to the shop (orders, order detail, delivery) and a reminder at the end of the day if any remain."
Resolved by Lead (follow-up on the reminder): "Can remind once an hour for orders not refunded, and a separate section for orders not refunded, which the shop checks and taps done."
Resolved by Lead (follow-up on when it starts): "1 hour after it arises": a pending refund older than 1 hour shows a red bar on every shop screen ("N orders not refunded, X in total"); tapping it opens the section of orders not refunded. The shop taps "Seen" to hide it for 1 hour, then it shows again, until everything is refunded.
Resolved by Lead (follow-up on the separate section): "The existing Refunds screen": the Refunds screen (S-S10): top part "Not refunded" (amount, how to receive it, account or cash, day, "Refunded" button), lower part "Refunded". The reminder bar leads there.

**CN-54 — How the customer receives a refund (CN-33, BR-21, prototype feedback).**
Resolved by Lead: "The customer chooses how to receive the refund: bank transfer (as now) or cash at delivery (the delivery list says clearly how much to give back). If the customer chooses cash and the shop/shipper does not have it ready, the shop contacts the customer and then transfers; it can still be marked Refunded."
Resolved by Lead (asked about the two lines "Keep excess money for the next order: v2, create an issue" and "Keep excess money for the next order: do not do"): "It is not keeping excess money but choosing the refund method: bank transfer or cash."
Resolved by Lead (follow-up on when cash can be chosen): "Only orders still to be delivered": only an order that will still be delivered (not yet "Delivering"/"Delivered", not cancelled/rejected), e.g. an edit down. A cancelled, rejected or delivered order has bank transfer only. If cash was chosen and the order is then cancelled or rejected, the app goes back to "no way chosen yet" and the customer enters an account.
Resolved by Lead (follow-up on recording cash given back): "A separate button": the delivery list has "Cash given back · X" for that order; tapping "Delivered" does not record the refund by itself (the shipper may not have cash ready).
Resolved by Lead (follow-up on how it was refunded): "Record the actual way": when tapping "Refunded", the shop chooses "Cash" or "Bank transfer" (defaulting to the customer's choice). Customer and shop see "Refunded 40,000 by bank transfer".
Resolved by Lead (follow-up on no choice yet): "Say clearly it is not chosen": "Refund pending 40,000 · customer has not chosen how to receive it"; the shipper can ask the customer and give cash at once (the "Cash given back" button is still there).

**CN-55 — Details of the refund reminder and the refund buttons (CN-53, CN-54, CN-40, missing).** Raised by the spec review of the prototype.
Resolved by Lead (what the reminder counts): "Every refund not made": once at least one refund is more than 1 hour old the reminder shows, and it counts every refund not made (new ones included), matching the Refunds screen.
Resolved by Lead (a refund recalculated by an edit, CN-40): "Keep the first time": a pending refund of 40,000 recorded at 9:00 and recalculated to 80,000 by an edit at 9:50 still counts from 9:00, so the reminder for the whole 80,000 shows at 10:00; an edit does not push the reminder back.
Resolved by Lead ("Cash given back" for a customer who chose bank transfer): "No": the delivery list shows only "Refund pending X · bank transfer" so the shipper knows; there is no cash button; the shop refunds from the Refunds screen.
Resolved by Lead (default when the customer has not chosen): "Bank transfer": "Refunded · bank transfer" comes first, "Refunded · cash" next to it. The delivery list still has "Cash given back".

No concern is open.
