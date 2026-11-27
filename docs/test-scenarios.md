# Test scenarios: prototype

Scenarios for the clickable prototype (PR #17), with the steps, the expected result and how each one is run.

**How run**
- **Browser**: clicked through by hand in the Browser pane at 375px wide, on fresh fake data ("Reset data"). Since PR M1-1a the prototype is clicked under `/proto` (for example `/proto/cart`, `/proto/shop`) (B31).
- **Test**: automated test in `__tests__/` (Vitest), for example `prototype-logic.test.ts` (logic) or `screens.test.tsx` (screens). The test name starts with the scenario, AC or CN id.
- **Both**: clicked through and covered by an automated test.
- **Playwright**: automated browser test run in CI (decision B19); the test name starts with the scenario, AC or CN id.
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
| D14 | Switch VI/EN | App text changes; building names stay; a dish shows its English name when it has one, else its Vietnamese name (AC18, AC29) | Both |

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

## 13. Sign-up, sign-in and profile (CN-58)

Written in the Plan step before any code (X6). They run in milestone M1 of [plan.md](plan.md), as Playwright tests where they go through screens and as tests on the server code otherwise, except A14 (M5: needs orders and the delivery list), and A17 and A18 (M3: need ordering).

| # | Steps | Expected | How run |
|---|---|---|---|
| A1 | Phone + password account with lan@gmail.com; sign in with Google as lan@gmail.com | Not signed in, accounts not joined, "This email already has an account that signs in with a phone number; sign in with phone + password" (AC49) | Playwright |
| A2 | Sign up with phone + password using the email of a Google account | "This email already has an account (signs in with Google)" (AC50) | Playwright |
| A3 | Sign up with phone + password using the email of another phone account | "This email already has an account (signs in with a phone number)" (AC50) | Playwright |
| A4 | Sign up with `0905111222` when `0905 111 222` has an account | "This phone number already has an account. If it is yours, call the shop" (AC50) | Playwright |
| A5 | Sign up, then sign in before confirming the email | Refused until the confirmation link is tapped; after tapping, sign-in works (AC51) | Playwright |
| A6 | "Send again" right after sign-up, then after 60 seconds | Disabled for 60 seconds, then sends (AC51) | Playwright |
| A7 | Tap a confirmation or reset link older than 1 hour, or a second time | "The link has expired" with a button to send a new one (AC51) | Playwright |
| A8 | Account `0912 345 678` / lan@gmail.com: sign in with `+84912345678`, then with `lan@gmail.com` | Both work (AC52) | Playwright |
| A9 | Another sign-up with `0912345678` | Refused: the number already has an account (AC52) | Playwright |
| A10 | Password `abc12`, `abcdefgh`, `abcdef12` at sign-up and at reset | First two refused with "At least 8 characters, with both letters and digits"; third accepted (AC53) | Playwright |
| A11 | Profile: change the phone number to a free one, then to one another account has | First saved; second refused (AC54) | Playwright and Test |
| A12 | Profile of a phone + password account: change the email | Old email kept until the link sent to the new email is tapped; an email with an owner is refused with "This email already has an account" (AC54) | Playwright and Test |
| A13 | Profile of a Google account | Email shown, not editable (AC54) | Playwright |
| A14 | Customer places an order, changes the phone number; shop opens the order, the delivery list, searches the old number | New number shown on both; the old number finds nothing (AC55) | Planned |
| A15 | "Forgot password" with an unknown phone number, then with a Google account's email | "No account with this phone number or email"; "This account signs in with Google" (AC56) | Playwright |
| A16 | "Forgot password" for a confirmed phone + password account, open the link, set a new password | The reset email arrives at the account's email; the new password signs in (AC20) | Playwright |
| A17 | Sign in with an account whose email is in the shop list, by Google and by phone + password | Straight to the shop screens, no profile asked, no way to order (AC57) | Playwright (the Google shop sign-in; "no way to order": Planned for M3) |
| A18 | First Google sign-in of a customer | Sent to profile completion before ordering; a phone number another account has is refused (AC16) | Planned |

## 14. Building on real data (CN-59)

Written in the Plan step before any code (X6); each runs in the milestone of [plan.md](plan.md) given in brackets.

| # | Steps | Expected | How run |
|---|---|---|---|
| R1 | Shop: add a dish with a photo, one with a drawing and no photo, one with neither; customer opens the day menu (M2) | Photo; drawing; plain rice bowl (AC58) | Planned |
| R2 | Customer adds a dish at 45,000 to Monday's cart; shop changes the price to 50,000; customer opens the cart and places it (M3) | 50,000 with "Price changed from 45,000"; the order is 50,000 (AC59) | Planned |
| R3 | Customer has a fixed dish and a plate in the cart; shop takes the fixed dish off the day's menu and deactivates a dish of the plate (M3) | Both lines "No longer on sale today"; placing blocked until they are removed (AC60) | Planned |
| R4 | Two shop accounts, refund pending over an hour; the first taps "Seen" (M4) | Hidden on both for one hour (AC61) | Planned |
| R5 | Customer opens Edit; shop starts preparing the order; customer taps Save (M5) | Not saved; "This order has just changed" with the reason; the latest order shown (AC62) | Planned |
| R6 | Customer opens Edit; shop confirms the payment; customer taps Save (M4) | The edit is saved (AC62) | Planned |
| R7 | Two shop devices: one rejects an order while the other starts preparing it (M5) | Only the first saved action happens; the other device says "This order has just changed" with the reason (BR-28a) | Planned |

## 15. Review of the build plan (CN-60)

Written in the Plan step before any code (X6); each runs in the milestone of [plan.md](plan.md) given in brackets.

| # | Steps | Expected | How run |
|---|---|---|---|
| P1 | Shop: "Stop selling" on a dish that an order still to be delivered contains (M3) | Refused with the reason; the order unchanged (AC63) | Planned |
| P2 | Customer adds a dish in an edit; shop changes its price; customer saves (M4) | "Price changed from X", saved at the new price (AC64) | Planned |
| P3 | Customer adds a dish in an edit; shop takes it off the day's menu; customer saves (M4) | "No longer on sale today"; Save refused until the line is removed (AC64) | Planned |
| P4 | Cart shown at 50,000; shop sets 55,000; customer taps to place (M3) | Nothing placed; 55,000 with "Price changed from 50,000"; second tap places it (AC65) | Planned |
| P5 | Same order edited on two devices; device 1 saves, then device 2 (M4) | Device 2: "This order has just changed", shows device 1's version (AC66) | Planned |
| P6 | Sign up again with the phone and the email of an unconfirmed account (M1) | "Check your email to confirm" with "Send again" to the first email; no new account (AC67) | Playwright |
| P7 | Sign in with a wrong password, an unknown phone, a Google account's email (M1) | "Wrong password"; "No account with this phone number or email"; "This account signs in with Google" (AC68) | Playwright |
| P8 | Unconfirmed account: sign in, then "Forgot password" (M1) | "You have not confirmed your email" with "Send the confirmation link again"; no reset link (AC69) | Playwright |
| P9 | Customer changes the profile email to a shop email (M1) | "This email is for a shop account" (AC70) | Playwright and Test |
| P10 | Browser on EN, account saved VI; sign in (M1) | Vietnamese, and the browser stays VI (AC71) | Playwright |
| P11 | Profile, shop order detail and delivery list of a customer with 0912345678 (M5) | "0912 345 678" everywhere (AC72) | Planned |
| P12 | Build-your-own rules: min 2 / max 1; included 3 / max 2; extra dish fee -5,000 (M2) | Each refused under the field; valid values saved (AC73) | Planned |
| P13 | Upload an 8 MB dish photo; upload a PDF refund QR; a dish with no photo (M4) | Saved smaller, no message; "Only images (JPG, PNG)"; the drawing (AC74) | Planned |
| P14 | Settings: pick a bank from the list, enter account and holder; place an order (M3) | The payment QR carries that bank and account (AC75) | Planned |
| P15 | Sign up with phone + password (M1) | Only phone, email, password asked; profile asked after confirming (AC76) | Playwright |
| P16 | (Prototype, this PR) Open Edit, switch to the shop, start preparing the order, switch back | "This order has just changed" with the reason; "OK" closes it and shows the order (BR-28a) | Test |

## 16. Second review of the build plan (CN-61)

Written in the Plan step before any code (X6); each runs in the milestone of [plan.md](plan.md) given in brackets. The last rows give a scenario to acceptance criteria that had none.

| # | Steps | Expected | How run |
|---|---|---|---|
| Q1 | Dishes screen: surcharge -5,000, price -5,000 (M2) | Both refused under the field; 0 and 45,000 saved (AC77) | Planned |
| Q2 | Cart with a 2-main plate; shop lowers the main maximum to 1; in another case raises the base price (M3) | "This plate no longer fits the rules", placing blocked; "Price changed from 50,000" (AC78) | Planned |
| Q3 | At 10:00, today on the default 09:30; shop sets the default to 11:00 (M3) | Today stays closed for ordering; tomorrow closes at 11:00 (AC79) | Planned |
| Q4 | Unpaid order; shop changes the bank; customer opens Payment (M3) | QR with the new bank (AC80) | Planned |
| Q5 | Buildings: add "Tòa XYZ" at 11:45 (prototype: this PR; real: M2) | Approved at once; a customer can pick it (AC81) | Test |
| Q6 | Shop declines a customer's pending default building; the customer goes to order; in another case the customer signs in again to `/` (M4) | Profile first with "The shop does not deliver to …"; after saving, `/` (AC82, CN-67) | Planned |
| Q7 | Sign up with a phone waiting for confirmation and a Google account's email (M1) | Both messages, one under each field (AC83) | Playwright |
| Q8 | Tap an expired link, enter the phone number, send (M1) | New link to the account's email; 60-second wait (AC84) | Playwright |
| Q9 | Upload a HEIC dish photo and a HEIC refund QR (M4; the refund QR part also tested in the prototype) | Converted and saved as smaller JPG; one that cannot be converted refused (AC85) | Planned |
| Q10 | Two orders for one day: the second has its own total, QR and payment state (M3) | As AC4 | Planned |
| Q11 | Paid 50,000 order edited to 40,000 (M4) | Needs refund 10,000, reason "edit lowered the total" (AC7) | Planned |
| Q12 | Day with orders and none Preparing: mark it closed; then a day with one Preparing (M5) | All active orders Rejected, paid ones Need refund, customers see it closed; the second cannot be closed (AC13) | Planned |
| Q13 | A dish in active orders: change its price, try to remove it from the day, reject those orders, remove it (M4) | Old orders keep the old price; removal refused until the orders are rejected (AC15) | Planned |
| Q14 | Browser set to another time zone: week, cutoffs, delivery times (M3) | Shown and enforced in Asia/Ho_Chi_Minh (AC17) | Planned |
| Q15 | Monday's cart has items; add a dish to Tuesday and place Tuesday (M3) | Tuesday's order created; Monday's cart unchanged (AC21) | Planned |
| Q16 | Pending building with one Unpaid and one Paid order: decline (M4) | The list with 0 and the paid amount first; then both Rejected, the paid one Needs refund (AC24) | Planned |
| Q17 | After the cutoff, an order Preparing and not Paid: open the cutoff review (M5) | Keep only, no reject (AC25) | Planned |
| Q18 | Paid order cancelled; customer enters bank, account and holder; another without (M4) | Refunds shows the destination; the other "has not sent an account" and can still be marked (AC27) | Planned |
| Q19 | A dish with an English name and one without; switch to English (M2) | English name for the first, Vietnamese for the second (AC29) | Planned |
| Q20 | Two open reports, 250,000 then 40,000; "Show QR again" (M4) | QR for 40,000 (AC40) | Planned |

## 17. Third review of the build plan (CN-62)

Written in the Plan step before any code (X6); each runs in the milestone of [plan.md](plan.md) given in brackets.

| # | Steps | Expected | How run |
|---|---|---|---|
| V1 | Paid 45,000 order with Cơm sườn ram; price raised to 50,000; edit, add one more, save (M4) | A new line at 50,000 with "Price changed from 45,000"; total 95,000, 50,000 owed (AC86) | Planned |
| V2 | Order with a 2-main plate; main maximum lowered to 1; edit, raise the plate, then remove it (M4) | Raise refused with "This plate no longer fits the rules"; removing allowed (AC87) | Planned |
| V3 | At 10:00, today open until 11:00; shop sets today's cutoff, or the default, to 09:00; customer places an order (M3) | Closed at once; refused, cutoff passed (AC88) | Planned |
| V4 | Today: one Bún bò order Delivered, one Delivering; remove Bún bò from today's menu, then again after the second is Delivered (M5) | Refused, then allowed (AC89) | Planned |
| V5 | Waiting account 0912 345 678 / lan@gmial.com; sign up with the same phone and another email, or the same email and another phone (M1) | The waiting account is replaced; the old link fails; a new link is sent (AC90) | Playwright (and a Vitest test of a refusal by the sign-in service) |
| V6 | Waiting phone account with lan@gmail.com; Google sign-in as lan@gmail.com (M1) | Not signed in; the "not confirmed yet" message with "Send the confirmation link again" (AC91) | Playwright |

## 18. Fourth review of the build plan (CN-63)

Written in the Plan step before any code (X6); each runs in milestone M1 of [plan.md](plan.md).

| # | Steps | Expected | How run |
|---|---|---|---|
| W1 | Waiting account with 0905 111 222; a confirmed customer changes the profile phone to it; a new Google customer enters it at profile completion | Both refused with "This phone number is waiting for its email to be confirmed", no "Send again" (AC92) | Playwright (the confirmed customer); Test (the same rule of `saveProfile`, for any customer, a new Google one included) |
| W2 | Two waiting accounts; sign up with the phone of one and the email of the other | Both deleted, old links fail, the new account gets a link (AC93) | Playwright |
| W3 | Waiting account whose password was removed after a refused Google sign-in; "Send the confirmation link again", open the link | New password asked; saving confirms the email; sign-in with phone and the new password works; profile unchanged (AC94) | Playwright |

## 19. Zero-questions test of M1 (CN-64)

Written in the Plan step before any code (X6); each runs in milestone M1 of [plan.md](plan.md).

| # | Steps | Expected | How run |
|---|---|---|---|
| X1 | Not signed in: open `/` and `/profile`; switch to English on the sign-in page; sign in; open `/proto` in another tab | Sent to sign-in, which switches to English; back on the page opened; `/proto` opens without signing in (AC95) | Playwright |
| X2 | Sign-up form: phone `028 1234 567`, `0912 345`; email `lan@`; empty password | "Phone number is not valid"; "Email is not valid"; "Required", each under its field (AC96) | Playwright |
| X3 | Sign up, tap the confirmation link | Signed in, the profile opens (AC97) | Playwright |
| X4 | Go past the limit of sign-in attempts (test sign-in mode set to a low limit) | "Too many attempts, please try again in a few minutes" (AC98) | Playwright |
| X5 | Expired-link page of a sign-up confirmation link with the phone of a confirmed account, then the old email of a waiting account replaced by a sign-up with the same phone and another email | "Your email is already confirmed, please sign in"; "No account with this phone number or email" (AC99) | Playwright |
| X6 | Signed in on two browser contexts; reset the password from one | That one signed in with the new password; the other signed out (AC100) | Playwright |
| X7 | Profile email to a waiting account's email, then to a free one | Refused without "Send again"; then "Waiting for confirmation of …" with "Send again", no cancel (AC101) | Playwright and Test |
| X8 | Close and reopen the browser context; "Sign out" in the header menu | Still signed in; then signed out (AC102) | Playwright |
| X9 | Google profile completion: clear the name, type 81 characters; propose a building without an address | Name prefilled; both refused; building proposed (AC103) | Playwright and Test |
| X10 | The three account email templates in the repository | Vietnamese text first, then English (AC104) | Test |
| X11 | Ask for confirmation emails past the email limit (test sign-in mode set to a low limit) | "Too many attempts, please try again in a few minutes" (AC98) | Playwright |
| X12 | Signed in, tap an expired email-change link and ask for a new one; tap an expired reset link and ask for a new one | A new email-change link to the waiting address; a new reset link (AC105) | Playwright |
| X13 | A customer's profile waits for lan2@gmail.com; another sign-up and another profile change use it | Both refused with "This email is waiting for its confirmation"; the first customer can still confirm (AC106) | Playwright and Test |
| X14 | Signed out: an incomplete customer opens `/` and signs in; a shop account opens `/profile` and signs in | Profile first, then `/`; the shop account goes to `/shop` (AC107) | Playwright |
| X15 | Sign-in field: `0281234567`, then `lan@` | "Phone number is not valid", then "Email is not valid" (AC108) | Playwright |
| X16 | Not signed in, open an expired email-change link | Sign-in first, then back; "Send a new link", no phone/email field; tapping it sends a new link to the waiting address (AC109, CN-77) | Playwright |
| X17 | A customer waits for lan2@gmail.com; a first Google sign-in as lan2@gmail.com | No account created; "This email is waiting for its confirmation"; the customer can still confirm (AC110) | Playwright |
| X18 | A customer waits for lan2@gmail.com, its link expired (test sign-in mode); another sign-up with lan2@gmail.com; the customer changes the new email to lan3@gmail.com; the sign-up with lan2@gmail.com again | Refused with "This email is waiting for its confirmation"; then "Check your email to confirm"; the profile shows "Waiting for confirmation of lan3@gmail.com" (AC111, CN-66) | Playwright |

## 20. Test infrastructure (PR M1-1c, B42–B49)

Written before the code of PR M1-1c (X6, B45). They check the test sign-in mode and the layout test, not a product rule; D13 and UI-13 stay "Browser" until M6.

| # | Steps | Expected | How run |
|---|---|---|---|
| E1 | Test server: `/test/sign-in?account=customer` in one browser context and `?account=shop` in another; `/test/session` in each, and in a third context with no sign-in | `{email: "customer@example.test", role: "customer"}`; `{email: "shop@example.test", role: "shop"}`; the third context has no session (B42, B44) | Playwright |
| E2 | Test server: `/test/sign-in?account=nobody` | Refused, no session (B42) | Playwright |
| E3 | `/test/sign-in` and `/test/session` with `E2E_TEST_AUTH` unset; with `E2E_TEST_AUTH=1` and `VERCEL_ENV` set; with `E2E_TEST_AUTH=1` and each Supabase variable set | 404 every time (B25, B46) | Test |
| E4 | Server start with `E2E_TEST_AUTH=1` and `VERCEL_ENV` set, or with any Supabase variable set; start with `E2E_TEST_AUTH` unset, with `E2E_TEST_AUTH=0` next to Supabase and Vercel variables, and with the test mode alone | Refused, naming the variable; the other three start, and only the last one has the test mode on (B25, B46, B48) | Test |
| E5 | Every `/proto` screen, and the real screens of each milestone (since M1-4 `/sign-in`, `/sign-up`, `/forgot-password`, `/auth/expired` of both kinds, `/auth/reset`, `/` and `/shop`), in Vietnamese and in English, at 375 px and 1280 px, on fresh fake data | No horizontal scroll: `scrollWidth <= clientWidth` (AC19, BR-31, B11, B28, B49) | Playwright |

## 21. Open points of M1-2 (CN-67)

Written when PR M1-2 started, before its code (X6), with the points of CN-68. They run in M1 (Y2 in M1-4, with "Forgot password"). The sign-in case of AC82 is in Q6 (M4).

| # | Steps | Expected | How run |
|---|---|---|---|
| Y1 | Switch the sign-up page to English, sign up with 0912 345 678, tap the confirmation link | The account is saved as EN; the app stays in English after signing in (AC112) | Playwright |
| Y2 | A confirmation link sent to lan@gmail.com and tapped at once; 20 seconds later "Forgot password" for lan@gmail.com (M1-4) | Nothing sent; the button disabled until 60 seconds after the first email (AC113) | Playwright |
| Y3 | Confirmed account 0912 345 678 / lan@gmail.com; sign up with 0912345678 and lan@gmail.com | The phone message under the phone, "This email already has an account (signs in with a phone number)" under the email; nothing created (AC114) | Playwright |
| Y4 | Confirmed account with 0912 345 678, waiting account with huy@gmail.com; sign up with 0912345678 and huy@gmail.com | Only the phone message; nothing under the email; the waiting account and its link still work (AC115) | Playwright |
| Y6 | Waiting account with lan@gmial.com, link sent 20 seconds ago; sign up with another phone and lan@gmial.com | The waiting account replaced; the new link sent at once; "Check your email to confirm" (AC116) | Playwright |
| Y7 | Sign up; 15 seconds later sign in with the right password; in another case open the expired-link page and enter the phone | "Send the confirmation link again" and "Send a new link" disabled with the seconds left, then they send (AC117) | Playwright |
| Y8 | Sign up in Vietnamese; switch to English; sign up again with the same phone and email; tap the link | No new account; English after the link (AC118) | Playwright |
| Y9 | A signed-in customer opens `/shop` | Sent to `/` (AC119) | Playwright |
| Y10 | A signed-in customer with a complete profile opens `/sign-in`, `/sign-up`, `/sign-in?next=/proto`, `/sign-up?next=/proto`, then `/sign-in?next=/sign-up` (CN-69); the signed-in shop account opens `/sign-in?next=/sign-up` (CN-72) | No form: `/`, `/`, `/proto`, `/proto`, then `/`; the shop account: no form, `/shop` (AC120) | Playwright |
| Y11 | A customer with a complete profile. Signed in: `/sign-in?next=/shop`, `/sign-in?next=%2Fsign-up%3Fnext%3D%2Fproto`, `/sign-in?next=/auth/expired?type=signup`, `/sign-in?next=/proto/shop`; signed out: `/sign-in?next=/sign-up`, switch tabs both ways, sign in (CN-69); the shop account signed out: `/sign-in?next=/sign-up`, sign in (CN-72) | `/` with no stop at `/shop`; `/`; the expired-link page; `/proto/shop`; the tabs keep `next`, then `/` at once; the shop account: `/shop` at once (AC121) | Playwright |
| Y12 | Signed in with a confirmed account: open `/auth/expired?type=signup`, enter the own phone number, send; tap the link under the card (CN-70) | "Your email is already confirmed, please sign in" with no "Sign in" link; "Go to the home page" opens `/` (AC122) | Playwright |
| Y13 | The three account email templates in the repository (CN-70) | Each gives its subject in both languages, Vietnamese first (AC123) | Test |
| Y14 | Until M1-4, the link of Supabase's default template (CN-71): sign up, tap the link (it comes back to `/auth/confirm?code=…`), tap it again in another browser; open `/auth/confirm` with Supabase's error answer for an expired link, with an unknown code and with nothing; the link of the repository templates (`token_hash`) | Signed in, `/` opens; then the expired-link page each time; the `token_hash` link signs in too | Playwright (and a Vitest test of the Supabase calls) |

## 22. Open points of M1-3 (CN-72)

Written when M1-3 started, before its code (X6). The shop cases of AC120 and AC121 are in Y10 and Y11. Z5 needs a waiting new email, seeded by the test sign-in mode until M1-5 builds the email change; its profile part runs in M1-5.

| # | Steps | Expected | How run |
|---|---|---|---|
| Z1 | The shop account signed in opens `/sign-in?next=/proto`, `/sign-in?next=/proto/shop`, `/sign-in?next=/auth/expired?type=signup`; signed out, it signs in with the form from `/sign-in?next=/forgot-password` | `/shop` every time (AC124) | Playwright |
| Z2 | The shop account signed in opens `/auth/expired?type=signup` and taps "Go to the home page" | `/shop` opens (AC125) | Playwright |
| Z3 | The Google account minh@gmail.com exists; on `/auth/expired?type=signup` enter minh@gmail.com and send | "This account signs in with Google" (AC126) | Playwright |
| Z4 | The Google account Minh has 0938 111 222 on his profile; sign in with 0938111222 and a password | Not signed in; "This account signs in with Google" (AC127) | Playwright |
| Z5 | Lan's account waits for lan2@gmail.com; a first Google sign-in as lan2@gmail.com by Huy, then by Lan | No account created; the sign-in page with only "This email is waiting for its confirmation" under the Google button, each time; Lan's profile still shows "Waiting for confirmation of lan2@gmail.com" with "Send again" (AC128) | Playwright |
| Z6 | The shop account signed in opens `/`, then `/profile` | `/shop` each time (AC129) | Playwright |
| Z7 | Not signed in, on `/sign-in?next=/proto`, tap "Continue with Google"; the test sign-in mode answers the callback with Google's cancel error | Back on `/sign-in?next=/proto`, not signed in, "Could not sign in with Google, please try again" under the Google button (AC130) | Playwright |
| Z8 | No account with minh@gmail.com; a first Google sign-in as minh@gmail.com with the Google name "Minh Trần" | `/` greets "Minh Trần" (AC131) | Playwright |
| Z9 | Phone + password account with lan@gmail.com; on `/sign-up?next=/proto` tap "Continue with Google" as lan@gmail.com | Back on the Sign up tab at `/sign-up?next=/proto`, not signed in, the AC49 message under the Google button (AC132) | Playwright |
| Z10 | Not signed in, on `/sign-up?next=/proto`, tap "Continue with Google"; the test sign-in mode answers with Google's cancel error; then open `/auth/callback` with no code | Back on `/sign-up?next=/proto`, then on `/sign-in`, each time with "Could not sign in with Google, please try again" (AC133) | Playwright |
| Z11 | Waiting account with lan@gmail.com; Google as lan@gmail.com is refused; move the test clock 61 minutes; tap "Send the confirmation link again" | Nothing sent (test mailbox unchanged); the message and the button replaced by "Could not sign in with Google, please try again" (AC134) | Playwright |
| Z12 | First Google sign-in of an@gmail.com with an empty name, of binh@gmail.com with only spaces, and of minh@gmail.com with "  " followed by a name of 90 characters | `/` greets an@gmail.com and binh@gmail.com by the email; Minh's stored name has no leading spaces and is 80 characters (AC135) | Playwright |
| Z13 | Waiting account 0912 345 678 / lan@gmail.com; a Google sign-in as lan@gmail.com for which the sign-in service removes the password (test sign-in mode, outcome "dropped"); sign in with 0912345678 and the old password, then with abc12345; tap "Send the confirmation link again" | "You have not confirmed your email" with the button, both times; the test mailbox gets the link that sets the password (kind `recovery`) (AC136) | Playwright |
| Z14 | Waiting account with lan@gmail.com; Google as lan@gmail.com refused (AC91); confirm the account from the first link in another browser; back in the tab that still shows the AC91 message, tap the button under the Google button | "Your email is already confirmed, please sign in" alone under the Google button, no button; nothing sent (AC137) | Playwright |
| Z15 | Waiting account with lan@gmail.com; Google as lan@gmail.com refused (AC91); a sign-up with another phone and lan@gmail.com replaces it; 61 seconds later tap the button under the Google button | A new link to lan@gmail.com that confirms the new account (AC138) | Playwright |
| Z16 | Waiting account with lan@gmail.com; Google as lan@gmail.com refused (AC91); a sign-up with the same phone and another email deletes the waiting account (CN-62), then a first Google sign-in with lan@gmail.com in another browser makes it a Google account; tap the button under the Google button | "This account signs in with Google" alone under the Google button, no button; nothing sent (AC139) | Playwright |
| Z17 | The shop account (email + password); Google with the shop email | Not signed in; the AC49 sentence under the Google button (AC140) | Playwright |
| Z18 | Waiting account with lan@gmail.com; Google as lan@gmail.com refused (AC91); the button sends until the test mode's email limit (B60) refuses; move the test clock past the limit's hour, still within the hour of the refusal, and tap again | "Too many attempts…" in place of the AC91 sentence, the button still there; then the AC91 sentence with "Send again in N s", and the link in the test mailbox (AC141) | Playwright |
| Z19 | Start Google sign-in from Sign in or Sign up with the Supabase provider (a fake client) | The call to Supabase asks Google for `prompt=select_account`, so Google shows its account chooser every time (AC142) | Test |

## 23. Open points of M1-4 (CN-73)

Written when M1-4 started, before its plan and code (X6), with the points of CN-74 (N11–N17) and of CN-75, found on the code (N18–N21). A15, A16, A7 and A10 (reset parts), P8 ("Forgot password" part), Q8 (reset links), W3, X6, X12 (reset part) and Y2 also run in M1-4. Every link here is issued by the test sign-in mode into its test mailbox.

| # | Steps | Expected | How run |
|---|---|---|---|
| N1 | The Google account Minh has 0938 111 222 on his profile (seeded); "Forgot password" with 0938111222 | "This account signs in with Google"; the test mailbox gets nothing (AC143) | Playwright |
| N2 | Confirmed account 0905 111 222 / huy@gmail.com; the shop account signed in opens `/forgot-password` and sends for 0905111222; 61 seconds later a customer signed in does the same | The form each time; a reset link to huy@gmail.com each time; the shop and the customer still signed in (`/test/session`) (AC144) | Playwright |
| N3 | Waiting account 0912 345 678 / lan@gmail.com that needs a password (CN-63, seeded); "Forgot password" with 0912345678, then "Send the confirmation link again" | "You have not confirmed your email" with the button; nothing in the mailbox after the first tap; the CN-63 link after the button (AC145) | Playwright |
| N4 | The account of N3 with its CN-63 link; open the link, close the page; sign in with 0912345678 and abc12345; open the link again and save abcdef12; sign out and sign in with 0912345678 and abcdef12 | Not signed in after closing; "You have not confirmed your email" with the button; after saving signed in and confirmed; the last sign-in works; the profile unchanged (AC146) | Playwright |
| N5 | A customer signed in as usual opens `/auth/reset`; a visitor not signed in opens it | "The link has expired" page of a reset link with the phone-or-email field, each time; the password unchanged (AC147) | Playwright |
| N6 | Waiting account 0905 111 222 / huy@gmail.com; on `/auth/expired?type=recovery` enter 0905111222 and send | "You have not confirmed your email" with "Send the confirmation link again"; no reset link in the mailbox (AC148) | Playwright |
| N7 | Confirmed account 0912 345 678 / lan12345; a reset link; open it and close the page; open `/`; sign in with lan12345, sign out; open the link again and save abcdef12 | `/` goes to the sign-in page; lan12345 signs in; the link opens the form again and saving signs in with abcdef12 (AC149) | Playwright |
| N8 | Signed in on two browser contexts with lan12345; on the second open a reset link and save lan12345, close the page, open the same link again and save abcdef12 | "The new password must differ from the old one" under the field and the first context still signed in; the reopened link shows the form again; then the second context signed in and the first signed out (AC150) | Playwright |
| N9 | The shop account and a customer with a complete profile each open a reset link and save a new password | `/shop` for the shop, `/` for the customer (AC151) | Playwright |
| N10 | Signed out on `/sign-in?next=/proto`: tap "Forgot password?", "Sign in", "Forgot password?" again, send, open the link, save | `/forgot-password` and `/sign-in` without `next`; after saving `/` (AC152) | Playwright |
| N11 | A reset link sent 61 minutes ago (test clock); a link whose password was saved; a link replaced by a newer one; tap each, and save on the last; in another case, save the old password on link L1 (refused), ask for a new link L2, reopen L1 and save | The first two open "The link has expired" at once; the third shows the form and saving opens "The link has expired"; the reopened L1 saves nothing and opens "The link has expired"; L2 still works (AC153) | Playwright |
| N12 | W3 done (the CN-63 account saved abcdef12); a Google callback as lan@gmail.com with only the Google identity (test sign-in mode); then sign in with 0912345678 and abcdef12 | The AC49 sentence under the Google button; the account has no Google identity; the sign-in works (AC154) | Playwright (the identities: Test) |
| N13 | Signed in as a customer, then as the shop: open `/forgot-password` and `/auth/expired?type=recovery`, tap the link under the card; signed out, read it | "Go to the home page" to `/`, then `/shop`; "Sign in" when signed out (AC155) | Playwright |
| N14 | The test sign-in mode set to refuse sending to huy@gmail.com; sign up with 0905 111 222 / huy@gmail.com; in another case, with a confirmed account made by the test, its address refused, "Forgot password" for it | "Could not send the email, please try again later" as a Notice at the top of the card each time; no profile created; no `auth_mail_log` row (AC156) | Playwright (the `auth_mail_log` check: Test) |
| N15 | The shop account signed in on two browser contexts; on the first open Huy's reset link and save a new password; then "Forgot password" for huy@gmail.com after 60 seconds | The first context's shop session ended (the shop's old token no longer works) and Huy signed in there; the second context still the shop; under the sent card "Go to the home page" (AC157) | Playwright |
| N16 | Accounts made by the test, whose addresses the test sign-in mode then refuses: "Send again" on the sent card of "Forgot password" of a confirmed one (sent before the refusal was set); a waiting one refused at Google (AC91), then "Send the confirmation link again" under the Google button | "Could not send the email, please try again later" right under the "Send again" button; under the Google button in place of the AC91 sentence, the button kept; no new `auth_mail_log` row (AC156) | Playwright (the `auth_mail_log` check: Test) |
| N17 | A reset link opened on one browser context, the old password saved (refused); the same link opened on a second context and saved; then saved on the first | Second context: the form, then "The link has expired"; first context: saved (AC158) | Playwright |
| N18 | A reset link opened on one browser context and saved on another; reload `/auth/reset` on the first; in another case open a link, move the test clock past its hour, type "abc" and save | "The link has expired" at once each time, no password message (AC159) | Playwright |
| N19 | The shop signed in opens a customer's reset link | "Set a new password" with no account menu (AC160) | Playwright |
| N20 | A reset link L3 replaced by L4; open L3, type "abc", save | "The link has expired" at once, no password message (AC161) | Playwright |
| N21 | The seeded shop (Vietnamese) signed in opens a customer's reset link, switches to EN, saves | The page in English; the shop's stored language still Vietnamese (`/test/profile`); after saving the customer's language (AC162) | Playwright |

## 24. A field's message disappears when the field is edited (CN-76)

Written before the code (X6), from the Lead's decision on the preview. C5 waits for the profile of M1-5.

| # | Steps | Expected | How run |
|---|---|---|---|
| C1 | Sign up with "0912 345", "lan@" and no password; tap "Sign up"; type "678" at the end of the phone field, so it reads "0912 345678" (the number 0912345678) | The three messages under their fields; the phone message gone as soon as the phone is edited, before tapping, the email and password messages still there; tapping again leaves only the email and password messages (AC163) | Playwright |
| C2 | Waiting account 0905 111 222 / huy@gmail.com; the Google account lan@gmail.com; sign up with 0905111222 and lan@gmail.com; edit the phone to 0987654321; edit it back to 0905111222 and tap "Sign up" | "This phone number is waiting…" with "Send again" after the first tap; both gone once the phone is edited; both back after the last tap (AC164) | Playwright |
| C3 | Sign in with "0912 345" and no password; type "6" into the identifier, then "x" into the password, and tap; clear the identifier and tap; on "Forgot password" and on `/auth/expired?type=signup` and `?type=recovery`, send "0912 345", type "6" and send; then clear the field and send | On sign-in the identifier message gone at once, "Required" under the password still there; on each other page the message gone as soon as the field is edited; sending "0912 3456" shows "Phone number is not valid" again, and the empty field "Required" (AC165) | Playwright |
| C4 | Open a reset link, save "abc", type "d" and save "abcd"; then clear the field and save | The password rule message under the field, gone as soon as the field is edited; saving "abcd" shows it again; clearing removes it, and saving the empty field shows "Required" (AC165) | Playwright |
| C6 | Waiting account 0905 111 222 / huy@gmail.com (sign-up = email 1); the Google account lan@gmail.com; 61 s later sign up with 0905111222 and lan@gmail.com, tap "Send again" (email 2) and tap "Sign up" at once; 61 s later "Sign up", "Send again" (email 3); 61 s later "Sign up", "Send again" (over the limit); edit only the email and tap "Sign up"; tap "Send again" again, edit the phone, edit it back and tap "Sign up" | "Send again in N s" with the server's seconds after the tap at once; "Too many attempts…" under the button after the send over the limit; after each later "Sign up": "Send again", enabled, with no "Too many attempts" (AC167) | Playwright |
| C7 | Waiting account 0905 111 222 / huy@gmail.com (sign-up = email 1); "Forgot password" with 0905111222; move the test clock 61 s before each tap of "Send the confirmation link again" until "Too many attempts…" shows under it; tap "Send the reset link" | "You have not confirmed your email" with the button at the top, and no "Too many attempts" under the button (AC168) | Playwright |
| C8 | Sign up with "0912 345" and no email or password, the answer held back by the test; type "678" in the phone field while it waits; let the answer come; tap again | No phone message when the answer comes, "Required" under the email and the password; the second tap shows no phone message, since 0912345678 is valid (AC169) | Playwright |
| C9 | A confirmed account made by the test; "Forgot password" for its phone (a reset link sent); within 60 s send its phone again, the answer held back by the test, and edit the field to another valid number while it waits; let the answer come | "Send the reset link", enabled, with no countdown (AC170) | Playwright |
| C5 | The profile: clear the name, tap Save, type "Lan" | "Required" under the name, gone as soon as the name is edited (AC166) | Playwright |

## 25. Open points of M1-5 (CN-77)

Written when M1-5 started, before its plan and code (X6). Every link here is issued by the test sign-in mode, and the test clock of B59 moves time.

| # | Steps | Expected | How run |
|---|---|---|---|
| K1 | Signed in as Lan, with lan2@gmail.com waiting; move the clock past 1 hour; tap the link, reload the page, then tap "Send a new link" | "The link has expired" with "Send a new link" and no input field; no new mail after the reload; the tap puts a new link to lan2@gmail.com in the mailbox and the button reads "Send again in N s" (AC171) | Playwright |
| K2 | Lan's expired email-change link; open it signed in as Huy (no new email waiting); in another case Lan confirms a newer link first, then opens the expired one | "No new email is waiting for confirmation on this account"; the mailbox gets nothing (AC172) | Playwright |
| K3 | Lan's link to lan2@gmail.com expired; she changes her new email to lan3@gmail.com (61 s later); opens the lan2 link and taps "Send a new link" once the 60 s are over | A new link to lan3@gmail.com; "A new link was sent to lan3@gmail.com" (AC173) | Playwright and Test |
| K4 | Lan changes her new email to lan2@gmail.com, then (61 s later) to lan3@gmail.com; Huy signs up with lan2@gmail.com; Lan taps the lan2 link | "The link has expired"; the profile shows "Waiting for confirmation of lan3@gmail.com"; Huy's account still waits for its own link (AC174) | Playwright |
| K5 | Lan (lan@gmail.com, nothing waiting) types lan@gmail.com and saves; then with lan2@gmail.com waiting she types lan@gmail.com and saves; Huy signs up with lan2@gmail.com; Lan taps her old lan2 link | First: nothing in the mailbox, no message, no waiting line; second: the waiting line disappears; Huy gets "Check your email to confirm"; the old link opens "The link has expired" (AC175) | Playwright and Test |
| K6 | lan2@gmail.com waiting, link sent 20 s ago; Lan types lan2@gmail.com again and saves | No new mail; the waiting line stays, its "Send again" still counting down (AC176) | Playwright and Test |
| K7 | Lan's complete profile: change the new email to lan3@gmail.com and save | Still on `/profile`, the saved notice and "Waiting for confirmation of lan3@gmail.com" (AC177) | Playwright and Test |
| K8 | Waiting account 0905 111 222; Lan changes name to "Lan Trần", phone to 0905111222, email to lan2@gmail.com, saves; in another case valid fields with lan2@gmail.com listed by `/test/mail-refuse` | The phone message under the phone; `/test/profile` still shows the name "Lan" and no `pending_email`; no mail; in the other case "Could not send the email, please try again later" at the top and nothing saved (AC178) | Playwright and Test |
| K9 | Lan's email-change link, within its hour, opened in a browser context with nobody signed in; in another case in a context where Huy is signed in | Signed in as Lan on `/profile`, with lan2@gmail.com and "Your email was changed to lan2@gmail.com"; Huy's session in that context is gone; Lan signs in with lan2@gmail.com, and lan@gmail.com gets "No account with this phone number or email" (AC179) | Playwright and Test |
| K10 | Seeded Google account with 0938 111 222; on `/auth/expired?type=signup` enter 0938111222 and send | "This account signs in with Google"; no mail (AC180) | Playwright |
| K11 | Lan waits for lan2@gmail.com; "Forgot password" with lan2@gmail.com | "No account with this phone number or email"; no mail (AC181) | Playwright |
| K12 | Lan in Vietnamese on `/profile`; pick English in the language field; open `/`; sign in as Lan in a new browser context | English at once, `/` in English; the new context is English after signing in (AC182) | Playwright |
| K13 | A new customer on profile completion, no building approved; propose "Tòa ABC" with no address; leave without Save; open `/profile` again | "Tòa ABC" selected at once; next visit: "Complete your profile", and the list offers "Tòa ABC (waiting for the shop)"; the `buildings` row is pending, proposed by that customer (AC183) | Playwright and Test |

## 26. Review of the M1-5 plan (CN-78)

Written before the code (X6), from the points `spec-reviewer` found on the M1-5 plan.

| # | Steps | Expected | How run |
|---|---|---|---|
| K14 | Lan's complete profile with lan2@gmail.com waiting: type lan@gmail.com, save; then change nothing and save | The saved notice each time; no message under Email, no mail; the waiting line gone after the first (AC184) | Playwright and Test |
| K15 | Change the new email to lan2@gmail.com, 20 s later (test clock) to lan3@gmail.com, 20 s later back to lan2@gmail.com, save; in another case the test mode at its low limit (B60) | "Send again in 20 s" under Email, `/test/profile` still waits for lan3@gmail.com; in the other case "Too many attempts…" under Email, nothing saved (AC185) | Playwright (the wait); Test (the wait and the limit) |
| K16 | lan2@gmail.com waiting with link L1; 61 s later "Send again" (L2); open L1, then L2 | L1: "The link has expired" with "Send a new link"; L2 confirms (AC186) | Playwright and Test |
| K17 | Lan's expired email-change link opened by the signed-in shop account; then by Lan with lan2@gmail.com waiting | Shop: heading, "No new email is waiting…", no button, the account menu, "Go to the home page" → `/shop`; Lan: "Send a new link", "Go to the home page" → `/` (AC187) | Playwright |
| K18 | Seeded: Lan's default building Tòa ABC declined; open `/profile`, tap Save | The declined notice; no Tòa ABC in the list; "Required" under the building; nothing saved (AC188) | Playwright and Test |
| K19 | Propose "Tòa ABC", leave; come back, propose " tòa abc ", then "Tòa XYZ" | One Tòa ABC row only, selected again; a new Tòa XYZ row; both listed (AC189) | Playwright and Test |
| K20 | Seeded incomplete Lan (declined building); sign in from `/sign-in?next=/proto`; propose a building, change the email to lan2@gmail.com, save; open `/profile` | A link to lan2@gmail.com in the mailbox; `/proto` opens; the profile shows "Waiting for confirmation of lan2@gmail.com" (AC190) | Playwright and Test |
| K21 | Lan (lan@gmail.com) with lan2@gmail.com waiting: open `/profile`, change only the name to "Lan Trần", save | The Email field holds lan2@gmail.com, lan@gmail.com shown as current; name saved, saved notice, no mail, `/test/profile` still waits for lan2@gmail.com (AC191) | Playwright and Test |
| K22 | Seeded: Lan's default building Tòa ABC declined; on `/profile` propose "Tòa ABC", save | A second `buildings` row Tòa ABC, pending, proposed by Lan, selected; the declined row unchanged and not listed; the profile complete (AC192) | Playwright and Test |

## 27. Review of the M1-5 code (CN-79)

Written with the Lead's answers to the points `spec-reviewer` found on the M1-5 code (X6).

| # | Steps | Expected | How run |
|---|---|---|---|
| K23 | Propose "Tòa ABC" with "12 Lê Lợi", leave; come back, propose " tòa abc " with "34 Hai Bà Trưng", then " Tòa ABC " with no address | One pending Tòa ABC, address "34 Hai Bà Trưng" (AC193) | Playwright and Test |
| K24 | Tap an email-change link, then reload the profile | The notice the first time; after the reload the new email without the notice, and no `emailChanged` in the address (AC194) | Playwright |

## 28. Open points of M2-1 (CN-80, CN-81)

Written with the Lead's answers to the open points of PR M2-1, the Dishes and Build-your-own rules screens, and to the points `spec-reviewer` found on its plan (X6).

| # | Steps | Expected | How run |
|---|---|---|---|
| H1 | Dishes: save "Nước sâm" with no "Ready meal" and no group (M2) | "Pick at least one: ready meal or build-your-own dish" under the kind field; nothing saved (AC195) | Planned |
| H2 | Dishes: "Stop selling" on "Bún bò Huế", then "Sell again" (M2) | At the end with "Not sold", then back in the list by name (AC196) | Planned |
| H3 | Dishes: replace the photo of "Cá kho tộ", then "Remove photo"; a dish with no drawing removes its photo (M2) | New photo; then the drawing; with no drawing a plain rice bowl (AC197) | Planned |
| H4 | Rules: add "Tráng miệng", move it above "Canh", Save; delete it, Save; delete "Canh", which has a dish no longer sold, Save (M2) | Saved in its place, then deleted; deleting "Canh" refused with "This group still has dishes; move them to another group first" (AC198) | Planned |
| H5 | Dishes: add " trứng chiên " while "Trứng chiên" is not sold; Rules: add " rau " and an empty name, Save (M2) | "A dish with this name already exists"; "A group with this name already exists" and "Required"; nothing saved (AC199) | Planned |
| H6 | Rules: base price 40,000, "Món mặn" max 1, "Rau" min 2 / max 1, Save; fix "Rau", Save (M2) | First Save saves nothing, the message under "Rau"; second Save saves all and shows "Saved" (AC200) | Planned |
| H7 | Shop signs in from `/sign-in?next=/shop/dishes`, `/sign-in?next=/shop/old-menu`, `/sign-in?next=/proto`; a customer from `/sign-in?next=/shop/dishes` (M2) | `/shop/dishes`, `/shop`, `/shop`; the customer `/`; the shop, signed in, opening `/shop/old-menu` lands on `/shop` with no 404 (AC201) | Planned |
| H8 | Dishes: price "45.000", "45 000", "45000", "45,5", "abc" (M2) | 45,000 saved and shown "45.000" three times; "Must be a whole number of 0 or more" twice (AC202) | Planned |
| H9 | Dishes: name of 81 characters, description of 201, then 80 and 200 (M2) | "At most 80 characters", "At most 200 characters", then saved (AC203) | Planned |
| H10 | Dishes: open the list with "Rau muống xào", "Canh bí đỏ" and "Bún bò Huế" (both not sold), "Cá kho tộ", "Ấp chả" (M2) | Ấp chả, Cá kho tộ, Rau muống xào, then Bún bò Huế and Canh bí đỏ "Not sold" (AC204) | Planned |
| H11 | Dishes: build-your-own "Trứng chiên" with an empty surcharge; Rules: empty extra dish fee, Save (M2) | "Required" under each; nothing saved (AC205) | Planned |
| H12 | Dishes in English: price "45,000", "45 000", "45.5" (M2) | 45,000 saved and shown "45,000" twice; "45.5" refused (AC206) | Planned |
| H13 | Price 10,000,001 then 10,000,000; group maximum 21 then 20 (M2) | The first of each refused under the field; the second saved (AC207) | Planned |
| H14 | Add "Trứng  chiên" (two inner spaces) and "Trứng ốp la" with the English name "Fried egg" while "Trứng chiên" / "Fried egg" exists (M2) | Both saved (AC208) | Planned |
| H15 | Rules open in two browsers: the first adds "Tráng miệng" and saves; the second changes the base price and saves (M2) | The base price saved, "Tráng miệng" gone (AC209) | Planned |
| H16 | Dishes: upload a WebP, then a moving GIF (M2) | Both accepted and shown, the GIF as its first picture (AC210) | Planned |
| H17 | Dishes: the upload of a new photo fails, then Save (M2) | "Could not upload the photo, please try again"; saved with the earlier photo (AC211) | Planned |
| H18 | Rules: delete every group (no dish in them), Save (M2) | Saved with no group (AC212) | Planned |
| H19 | No group: "Add dish"; then a form with "Canh" picked while another browser deletes "Canh", Save (M2) | The box disabled with the hint; then "Required" under the group and the groups loaded again (AC213) | Planned |
| H20 | Price "45,000" in Vietnamese, "45.000" in English, then "45,5" and "45.5" (M2) | 45,000 saved twice, shown in each language's format; the last two refused (AC214) | Planned |
| H21 | Rules open on a computer; a phone adds "Tráng miệng", saves, saves "Chè đậu" into it; the computer changes the base price and saves (M2) | Base price saved; "Tráng miệng" stays with "Chè đậu" (AC215) | Planned |