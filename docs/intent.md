# Intent: Office lunch ordering app

Status: Draft (awaiting Lead acceptance)

## Context

Office workers currently each order their own lunch through food delivery apps. They spend time choosing a restaurant and dishes every day, and they get bored easily because they keep eating the same few familiar dishes.

The Lead wants to trial a model: one office lunch shop with its own app. The shop puts up a varied menu, office workers order in advance, and the shop closes orders at a set time so it can prepare and deliver to each building at the agreed time. For the first version the Lead tries it out themselves, playing both the shop and the customer. If the model works, the Lead will open a shop based on it.

## Problems to solve

1. Customers find it hard to choose dishes and get bored eating lunch every day.
2. The shop needs to know in advance how many of each dish to prepare, instead of receiving scattered orders.
3. The shop needs to know what to deliver, to whom, in which building, and at what time.
4. Payment collection must be clear: which orders are paid and which are not.

## What success looks like

The first version succeeds when the Lead runs one full day end to end: put up the menu → customers order → orders close → cook → deliver → collect payment, without keeping any records outside the app (D12).

## Users

- **Customers:** office workers in the buildings the shop delivers to. They view the menu, order dishes, and pay.
- **Shop:** the shop owner and the kitchen. They put up the menu, close orders, prepare dishes, arrange delivery, and confirm payment.

The shop arranges its own shippers. Shippers are not users of the app in the first version.

## Decisions made

| # | Topic | Decision |
|---|---|---|
| D1 | Model | One shop selling to office workers, not a multi-shop platform |
| D2 | Sales format | Both: fixed daily dishes and build-your-own rice plates (customers combine dishes from that day's list) |
| D3 | Menu | The menu changes daily; customers can preview the days of the week |
| D4 | Menu variety | No hard rule on repeating dishes; the shop keeps the menu varied itself |
| D5 | Advance ordering | Customers can order in advance for the days of the week |
| D6 | Order cutoff | Each day has a cutoff time; after it, customers cannot place or edit orders for that day |
| D7 | Preparation | After the cutoff, the shop sees the total number of portions of each dish to cook |
| D8 | Delivery | The shop arranges shippers to deliver to each building at the agreed time |
| D9 | Payment | Customers pay by bank transfer using the shop's QR code; the shop confirms receipt of payment |
| D10 | Order statuses | Placed → Shop confirmed → Preparing → Delivering → Delivered; plus Rejected and Cancelled |
| D11 | Trial user | The first version is used by the Lead themselves, playing both the shop and the customer |
| D12 | What success looks like | "One full day end to end": run one whole day from putting up the menu to collecting payment without keeping records outside the app |
| D13 | Customer identification | "Own account": stores name, phone number, and default building |
| D14 | Buildings and delivery times | "Combined": customers pick an existing building; if it is not listed, they enter it themselves, and the shop approves it and adds it to the list; delivery time: see OQ5 |
| D15 | Build-your-own pricing | "Base price + surcharge" |
| D16 | When customers pay | "At the time of ordering" |
| D17 | Orders still unpaid at the cutoff | "Shop decides": the shop reviews each order and chooses to reject it or keep it |
| D18 | Meaning of "Shop confirmed" | "Before the cutoff, kept separate": the shop confirms orders before the cutoff; payment confirmation is tracked separately and is not an order status |
| D19 | Customer cancels a paid order before the cutoff | "Refund": the shop refunds outside the app; the app records which orders need a refund and which have been refunded |
| D20 | Shop rejects an order | "Until cooking starts": the shop can reject an order until it moves to Preparing, including after the cutoff |
| D21 | Daily portion limit | "No limit" |
| D22 | Shop closed days | "Mark closed days": customers can clearly see closed days; orders already placed for that day are rejected in bulk and refunded |
| D23 | Portions per order | "Multiple portions, one recipient": delivered together to the person who ordered, who pays for the whole order |

## In scope for the first version

- The shop manages the dish list and puts up the menu for each day of the week.
- The shop sets the cutoff time each day.
- Customers view today's menu and the coming days, order fixed dishes or build a rice plate, and edit or cancel before the cutoff.
- The shop views the preparation sheet by dish and the delivery list by building.
- The shop updates order status; customers follow the status.
- QR payment and confirmation of receipt of payment.
- Customers have their own account that stores name, phone number, and default building. (D13)
- The shop manages the building list; customers pick an existing building, or enter one that is not listed for the shop to approve and add to the list; delivery time: see OQ5. (D14)
- Build-your-own rice plates are priced as a base price plus surcharges. (D15)
- Customers pay at the time of ordering. (D16)
- The shop confirms orders before the cutoff; payment confirmation is tracked separately and is not an order status. (D18)
- At the cutoff, the shop reviews unpaid orders and chooses to reject or keep each one. (D17)
- When a customer cancels a paid order before the cutoff, the app records that the order needs a refund and when it has been refunded; the shop refunds outside the app. (D19)
- The shop can reject an order until it moves to Preparing, including after the cutoff. (D20)
- The shop marks closed days, visible to customers; orders already placed for that day are rejected in bulk and refunded. (D22)
- One order can contain multiple portions, delivered together to the person who ordered, who pays for the whole order. (D23)

## Out of scope for the first version

- Multiple shops in the same app.
- Shippers using the app (accepting orders, updating location).
- A daily portion limit. (D21)

## Open questions

| # | Question | Related D# |
|---|---|---|
| OQ1 | A customer has paid and then edits the order before the cutoff so the total changes: how is the difference handled? | D6, D16, D19 |
| OQ2 | Build-your-own combination rules: how many dishes per group, who sets the base price and surcharges, and are they fixed or set per day? | D2, D15 |
| OQ3 | What happens to an order placed for a building that has not been approved yet? | D8, D14 |
| OQ4 | If the shop rejects an order the customer has already paid for, is it refunded the same way as a customer cancellation? | D19, D20, D22 |
| OQ5 | Does each building have one fixed delivery time, or does the delivery time change by day? | D8, D14 |
| OQ6 | Who moves an order to Preparing, Delivering, and Delivered, and when (per order or in bulk)? Is the customer notified when the status changes? | D10 |
| OQ7 | Is the cutoff one fixed time for every day, or does the shop set it separately for each day? | D6 |
| OQ8 | Can a customer place more than one order for the same day? | D5, D23 |
| OQ9 | Does the "one full day end to end" criterion need a threshold (number of days or orders) for the Lead to decide to open a real shop? | D11, D12 |
| OQ10 | If a customer edits an order the shop has already confirmed (before the cutoff), does the order go back to Placed or stay Shop confirmed? | D6, D18 |
| OQ11 | Which language does the app interface use: Vietnamese, English, or both? | — |
| OQ12 | Which devices do customers and the shop mainly use: phone, computer, or both? | — |
