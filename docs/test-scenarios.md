# Test scenarios: prototype

Scenarios for the clickable prototype (PR #17), with the steps, the expected result and how each one is run.

**How run**
- **Browser**: clicked through by hand in the Browser pane at 375px wide, on fresh fake data ("Reset data").
- **Test**: automated test in `__tests__/prototype-logic.test.ts` (logic) or `__tests__/screens.test.tsx` (screens). The test name starts with the AC or CN id.
- **Both**: clicked through and covered by an automated test.
- **Planned**: written before the code (decision X6) and not run yet.

Each round of Lead decisions adds its scenarios here before the code is written. `__tests__/spec-coverage.test.ts` checks that every acceptance criterion has an automated test (decision X7).

Rules are in [spec.md](spec.md). Fake data: today's orders LA…001 to LA…008 (LA…002 Trần Văn Bình, 45,000 reported; LA…004 Phạm Quốc Huy, unpaid; LA…008 Bình, paid and cancelled, 45,000 refund pending), one Saturday order (Lê Thu Hà, paid). Default cutoff 09:30.

## 1. Sorting and searching orders (CN-56, CN-57)

| # | Steps | Expected | How run |
|---|---|---|---|
| S1 | As the customer, place a new order for today; open the shop's Orders screen | The new order is first; the others follow, newest first (AC46) | Both |
| S2 | Orders: type `binh` in "Search orders" | Only Trần Văn Bình's orders, newest first (AC47) | Both |
| S3 | Orders: type `0912345` | Bình's orders (phone `0912 345 678`, spaces ignored) | Both |
| S4 | Orders: type the last four characters of an order code (e.g. `0004`) | Only that order | Both |
| S5 | Orders: type `TRẦN văn` | Same as `binh`: case and accents ignored | Both |
| S6 | Orders: search `minh`, then set status "Placed" | Only the matching Placed order; the filter and the search apply together | Both |
| S7 | Orders: with text in the search box, switch to another day | The text stays and searches the new day; today's orders are not shown (CN-57) | Both |
| S8 | Orders: code search with a status filter that excludes the order | Nothing is shown | Test |
| S9 | Past the cutoff, open the Cutoff review | Each group (still Placed, not fully paid) is newest first (AC46) | Both |
| S10 | Cutoff review: search `huy`, then `zzz` | Only Huy's order; then "No order matches." | Browser |
| S11 | Cutoff review: search `zzz` | "No order matches." | Test |
| S12 | Refunds with refunds of two days (Bình today, Hà on Saturday): search `binh`, then `thu ha` | Only that customer's refunds, from any day, in the right part (Not refunded / Refunded) (AC48) | Both |
| S13 | Refunds: one customer with a pending and a made refund, search their name | Both parts show their refund, newest order first (AC48) | Test |
| S14 | Refunds: search `zzz` while other refunds are pending | "No order matches.", not "Nothing to refund." (CN-57) | Both |
| S15 | Open the Delivery screen | No search box; buildings stay ordered by delivery time | Both |
| S16 | Search rules on their own: contains, case, accents, `đ`, phone spaces, empty text | As in CN-56 | Test |

## 2. Filters and fixed order (existing)

| # | Steps | Expected | How run |
|---|---|---|---|
| F1 | Orders: status filter Placed / Shop confirmed / Cancelled | 3 / 3 / 1 orders | Browser |
| F2 | Orders: payment filter Unpaid / Reported / Paid | 3 / 1 / 3 orders | Browser |
| F3 | Orders: "Reported" also lists a cancelled order, or a Paid one, with a report still open (CN-39, CN-47) | The order is listed | Test |
| F4 | Orders: building filter, then add a payment filter, then a status with no match | 2 → 1 → 0 orders, "No order" message | Browser |
| F5 | Orders: switch to Saturday | Only Saturday's order | Browser |
| F6 | Orders: tap an order code, then "Back to orders" | The order detail opens; back returns to the list | Browser |
| F7 | Delivery list | Buildings by delivery time: 11:30, 11:45, 12:00 | Both |
| F8 | Buildings | Pending buildings first, then approved ones by delivery time | Browser |
| F9 | Customer "My orders" | Grouped by day, today first | Browser |
| F10 | Refunds | "Not refunded" above "Refunded" | Browser |
| F11 | Cutoff review | "Still Placed" group, then "Not fully paid" (AC9) | Both |

## 3. Money: editing after reporting a transfer (CN-37, CN-45, CN-49)

| # | Steps | Expected | How run |
|---|---|---|---|
| M1 | Bình's order (45,000 reported): Edit, add Thịt kho trứng (40,000), Save | Pay screen: "45,000 reported, waiting for the shop… transfer 40,000 more", QR for 40,000 (AC30) | Both |
| M2 | Two reports open; "Show QR again" | QR for the latest report only | Test |

## 4. Money: the shop answers each report (CN-38, CN-41, CN-42, CN-43, CN-46 to CN-51)

| # | Steps | Expected | How run |
|---|---|---|---|
| M3 | After M1, report the 40,000; shop opens the order | Two report lines (45,000 and 40,000), each with "Payment received" and "Not received yet"; "Not confirmed 85,000 · customer reported 85,000" (AC35, AC36) | Both |
| M4 | Shop: "Not received yet" on 40,000, "Payment received" on 45,000 | Received 45,000, 40,000 still owed; history "The shop has not found the transfer of 40,000"; the customer sees the notice and "Pay" (AC36) | Both |
| M5 | "Payment received" on a report when the order now costs more or less | Exactly the reported amount; Underpaid or Needs refund (AC31) | Test |
| M6 | "Received the rest" while a report is open | The unreported money is recorded; the report stays (AC39) | Test |
| M7 | "Not received yet" on a single report; the notice through edits; a Paid order with a report open | As in AC34, AC38, CN-46, CN-50, CN-51 | Test |

## 5. Money: cancelled or rejected with a report open (CN-39, CN-44, CN-52)

| # | Steps | Expected | How run |
|---|---|---|---|
| M8 | Customer reports a transfer, then cancels | No refund yet; "40,000 reported, waiting for the shop"; no "Show QR again", no cash option (AC32, CN-52) | Both |
| M9 | Shop opens the cancelled order, taps "Payment received" | Needs refund 40,000, reason "Customer cancelled" (AC32) | Both |
| M10 | Same with shop reject, closed day, building declined | Refund with that reason once confirmed | Test |
| M11 | "Not received yet" on a cancelled order | Notice only, no QR (AC37) | Test |

## 6. Money: edit down then up (CN-40)

| # | Steps | Expected | How run |
|---|---|---|---|
| M12 | Customer adds Bún bò (paid by the shop: 85,000), removes it (45,000 pending), adds Thịt kho (80,000) | The pending refund becomes 5,000 (AC33) | Browser |
| M13 | Edit down then up, with the refund pending, and with it already Refunded | Pending: dropped, difference owed; Refunded: kept (AC33) | Test |

## 7. Pending refunds shown, not blocking (CN-53)

| # | Steps | Expected | How run |
|---|---|---|---|
| M14 | Customer edits a paid 90,000 order down to 45,000; shop confirms and starts preparing | Nothing blocked; "Refund pending 45,000 · …" on Orders, order detail and Delivery (AC41) | Both |

## 8. Hourly reminder (CN-53, CN-55)

| # | Steps | Expected | How run |
|---|---|---|---|
| M15 | Shop screens with a refund pending for over an hour; tap "Seen"; move the demo time +30, +30 | Red bar with count and total; hidden after "Seen"; back one hour later; count drops when a refund is made (AC42) | Both |
| M16 | Reminder counts every pending refund; a refund recalculated by an edit keeps its first time | As in CN-55 | Test |

## 9. Cash or bank transfer (CN-54, CN-55)

| # | Steps | Expected | How run |
|---|---|---|---|
| M17 | Customer with a pending refund on an order still to be delivered opens "Receive your refund" | Account, QR photo and Cash at delivery; a cancelled order has no cash (AC43) | Both |
| M18 | Cash chosen, then the order is rejected; or the order is Delivering | Back to not chosen; transfer only (AC43) | Test |
| M19 | Delivery list: Delivering, Delivered, then "Cash given back" | "Delivered" leaves the refund pending; "Cash given back" marks it Refunded by cash; the customer sees "Refunded 45,000 by cash" (AC44) | Both |
| M20 | Delivery list with no choice yet, and with bank transfer chosen | Not chosen: "Cash given back" shown; bank transfer: no cash button (AC44, CN-55) | Test |
| M21 | Refunds screen, customer has not chosen: "Refunded · bank transfer" | It comes first; the made refund reads "Refunded 40,000 by bank transfer at 08:00, 20/11" (AC45) | Both |

## 10. Refund time format

| # | Steps | Expected | How run |
|---|---|---|---|
| T1 | Mark a refund made; look at the Refunds screen, the shop order detail and the customer's order | The same format everywhere: "at HH:MM, DD/MM" | Both |

## 11. Core day flow (first round)

Clicked through in the Browser pane in the first round of PR #17 (8eeeba1), on the fake data of that time; not clicked again since. "Test" means a test whose name gives the AC id.

| # | Steps | Expected | How run |
|---|---|---|---|
| D1 | Customer: open the week, pick today, add a ready meal to the cart | The cart shows the dish and its price | Browser |
| D2 | Customer: build a rice plate with ribs and a vegetable, then add an egg as a second main | 40,000, then 50,000; a plate with 0 mains or 2 vegetables cannot be added (AC3) | Both |
| D3 | Customer: propose a new building in the cart and place the order | The order is Placed; the shop cannot confirm it until the building is approved (AC14) | Both |
| D4 | Customer: open the payment screen, tap "I have transferred" | Fake QR with the exact total and the order code; payment state Reported (AC1) | Both |
| D5 | Shop: approve the building, "Payment received", confirm the order | Building approved; the order is Paid and Shop confirmed (AC22) | Both |
| D6 | Customer: edit the Paid order up | Placed again, Underpaid, QR for the difference only (AC5, AC6) | Both |
| D7 | Demo bar: move the time past the cutoff; shop opens the Cutoff review, confirms one order and keeps another | Still Placed and Not fully paid groups; the orders move as chosen (AC9) | Both |
| D8 | Shop: select two Shop confirmed orders, start preparing; open the preparation sheet | Both Preparing; the sheet counts them in the Preparing column (AC10, AC11) | Both |
| D9 | Shop: Delivery list, mark one building Delivering then Delivered | Orders grouped by building and delivery time; status moves per building (AC12, AC23) | Both |
| D10 | Shop: Refunds, mark a refund made | It moves from Not refunded to Refunded (AC8) | Both |
| D11 | Customer: add a plate to an existing order and Save | One edit in the history, back to Placed (AC26) | Both |
| D12 | Customer: open a closed day by its URL | Ordering is refused, the day is shown as closed (AC2) | Both |
| D13 | Every route at 375px and on desktop | No horizontal scroll (AC19) | Browser |
| D14 | Switch VI/EN | App text changes; dish and building names stay (AC18) | Both |

## 12. Design round: banana-leaf lunchbox ([design.md](design.md), UI1–UI12)

Tests in `__tests__/design.test.tsx`. "Browser" here was clicked at 375px in light and dark mode.

| # | Steps | Expected | How run |
|---|---|---|---|
| UI-1 | Customer: open today's menu on a phone | Each ready meal has our own drawing on a piece of leaf, beside the name and price; no page scroll sideways | Both |
| UI-2 | Customer: build a plate with a main, a vegetable and a soup | Each dish to choose shows its drawing; the large plate fills with the chosen dishes, empty places stay dashed | Both |
| UI-3 | Customer: cart with a plate and a ready meal | Each line has a thumbnail (the dish, or a small rice plate) | Browser |
| UI-4 | Customer: place the order, open Payment | Money block at stop 1 "Unpaid" with the amount to transfer | Both |
| UI-5 | Payment: tap "I have transferred" | Stop 2 "Transfer reported" with the amount, waiting for the shop | Both |
| UI-6 | Shop: open the reported order, "Payment received" | Stop 3 "Shop received", green, on the shop's order detail | Both |
| UI-7 | An active order edited up after payment (Underpaid) | Stays at stop 3, half filled, red "Still owed X" (UI4) | Test |
| UI-8 | An active order with a refund pending (edit lowered the total) | The 3-stop bar and the 2-stop refund bar | Test |
| UI-9 | Shop: open the cancelled paid order (LA…008) | Only the refund bar at "Needs refund"; once marked, "Refunded … by bank transfer" (UI5) | Both |
| UI-10 | A rejected order with nothing to settle | One line "Nothing left to settle" (UI5) | Test |
| UI-11 | Customer with an empty cart, and with no orders | An illustration and a way back to the week menu | Test |
| UI-12 | Device in dark mode: week, payment, shop Orders | Text readable on every filled colour; the demo bar's controls stay readable | Browser |
| UI-13 | Week view at 375px | No horizontal scroll (the day cards used to widen the page; fixed in this round, AC19) | Browser |
| UI-14 | A Paid order with a report still open (CN-47) | Stop 3 green, and inside the block "Customer reported X transferred, waiting for confirmation" (UI7) | Test |
| UI-15 | A cancelled order with a refund pending and a report still open (CN-39) | The refund bar, and inside the block "Transfer of X reported, waiting for the shop to confirm" (UI8) | Test |
| UI-16 | An Underpaid order whose difference is reported (CN-24) | Stop 2, and the line "Shop received Y" (UI9) | Test |
| UI-17 | Shop: open an unpaid order's detail | The block uses the shop's wording: "Customer still owes X" (UI10) | Test |
| UI-18 | Customer: open the Payment screen of a Reported order, without "Show QR again" | No QR; the block says the transfer is reported and waiting; "Show QR again" is there (AC28, CN-34) | Test |
| UI-19 | Customer: open the Payment screen of a cancelled order with a report open | No "Show QR again" and no QR (CN-52) | Test |
| UI-20 | Customer: open the Payment screen of a cancelled order the shop said it did not receive | The "not found" notice is shown, though nothing is left to pay (CN-44, CN-46) | Test |
| UI-21 | Shop: open a cancelled order with a refund pending and a report open, and a Paid order with a report open | Every line of the block in the shop's words: "To refund to the customer", "Customer reported X transferred, waiting for you to confirm" (UI12) | Test |
| UI-22 | Shop: open the detail of a reported order edited up | No note above the report buttons; the block says the report and what is still to transfer; the rows keep the amounts (UI13, CN-42) | Test |
| UI-23 | Shop: open any order's detail | The bar's stops read "Unpaid / Customer reported / Received" (UI14) | Test |
