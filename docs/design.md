# Design: Cơm Lá prototype

Status: Chosen by the Lead (prototype UI round)

This file records the visual direction of the clickable prototype. It changes how the app looks, never what it does: every rule stays in [spec.md](spec.md). Technical and process decisions are in [decisions.md](decisions.md).

## Brief, from the Lead

"I want the "Cơm Lá" prototype interface to be more lively while still easy to use: office workers ordering lunch quickly on their phone. The money screen must show at a glance which state the order is in." Dish pictures and illustrations are drawn by us, not taken from the internet. Business rules do not change; anything the spec does not say is asked to the Lead.

## Directions offered

| Direction | Idea |
|---|---|
| Rice-shop signboard | Hand-painted Vietnamese shop signs and meal tickets: condensed bold type (Phudu), tiled white background, chili red / turmeric / leaf green; flat thick-outline dish drawings; the money screen is a ticket and the payment state is a stamp |
| **Banana-leaf lunchbox (chosen)** | Softer and fresher: a deep banana-leaf band with drawn leaf veins at the top, dish cards rounded like a leaf parcel, Bricolage Grotesque for headings and Be Vietnam Pro for text; dishes drawn from above on a piece of leaf; the money screen has a 3-stop bar Unpaid → Transfer reported → Shop received, with a separate red branch for Still owed / Needs refund |
| Stainless canteen tray | The existing tray idea taken further: steel grey, pressed tray compartments framing dishes, Lexend, leaf green accent; the least decoration; the money screen is one large tray cell whose colour follows the state |

## Lead decisions

| # | Topic | Decision (in full) |
|---|---|---|
| UI1 | Direction | "Banana-leaf lunchbox" (Hộp cơm lá chuối), as offered: softer and fresher: a deep banana-leaf green background at the top of the screen with finely drawn leaf veins, dish cards rounded like a leaf parcel, Bricolage Grotesque for headings + Be Vietnam Pro for content. Dish pictures drawn seen from above, placed on a piece of leaf. Money screen: coin/bill changing colour, with a 3-stop bar Unpaid → Transfer reported → Shop received, and a separate red branch for Still owed / Needs refund |
| UI2 | Dark mode | "Follow the device": add a dark mode that follows the device setting (prefers-color-scheme); it costs more work and both modes must be checked |
| UI3 | Where the money state block goes | "Also the shop's order detail": the Payment screen (S-C7), the money part of the customer's Order detail (S-C9), and the shop's Order detail (S-S11). The other shop screens keep their labels as before (recoloured with the new palette) |
| UI4 | Still owed (Underpaid) on the bar | "Stays at stop 3, red": the "Shop received" stop is half filled, with a red label "Still owed X", together with the QR for the difference as now |
| UI5 | Cancelled or Rejected order | "Replace with a refund bar": hide the 3-stop bar; if there is a refund, show a 2-stop bar Needs refund → Refunded (with how it was refunded); if there is nothing, one line "Nothing left to settle" |
| UI6 | Where the drawn pictures go | All four places offered: dish cards on the day menu (a large picture on each ready meal, S-C4); the plate builder (a small picture on each dish to choose and a large plate that fills up with the chosen dishes, S-C5); a thumbnail next to each line in the Cart and the customer's Order detail; illustrations for empty screens (empty cart, no orders yet, shop closed / no menu yet) |
| UI7 | Paid with a transfer report still open (CN-47) | "Stop 3 + a line inside the block": stop 3 green "Shop received the full amount", with an extra line "Customer reported 40,000 transferred, waiting for confirmation" right inside the block; both the customer and the shop see it |
| UI8 | Cancelled or Rejected with a refund and a transfer report still open (CN-39) | "Refund bar + report line": the refund bar, with an extra line "Transfer of 40,000 reported, waiting for the shop to confirm" inside the block |
| UI9 | Underpaid, then the customer reports the difference (CN-24: shown as Reported) | "Stop 2 + received line": the bar stays at stop 2 "Transfer reported 40,000", with an extra line "Shop received 45,000" |
| UI10 | Wording of the money block on the shop's Order detail | "Shop's own wording": for example "Customer still owes 85,000", "Customer reported 85,000 transferred, waiting for you to confirm" |
| UI11 | "Show QR again" on a Paid order with a report still open (CN-47) | "Keep the button": the customer can still see the QR for 40,000 again, with "Transfer of 40,000 reported, waiting for the shop to confirm", as now |
| UI12 | The other lines of the shop's money block | "Shop's own wording for all": every line in the shop's block uses the shop's voice, for example "You refunded 40,000 by bank transfer", "Customer reported 40,000 transferred, waiting for you to confirm" |
| UI13 | The transfer report said twice on the shop's Order detail (in the block and above the "Payment received / Not received yet" buttons) | "Hide the line above the buttons": only on the shop's Order detail, the note above the buttons goes; the line of each report with its buttons stays. The shop's order lists keep the note |
| UI14 | Stop labels on the shop's bar | "Shop's own labels": for example "Unpaid / Customer reported / Received" and "Needs refund / Refunded" |
| UI15 | Shop setup screens not in the prototype (Dishes S-S1, Build-your-own rules S-S2, Days S-S3, Settings S-S4) | "Use the existing components": built with the tokens and components of the existing banana-leaf design; the Lead reviews them on the preview of each M2 PR; no separate design round (spec CN-59) |
| UI16 | Account screens (Sign in / Sign up S-C1, Forgot password S-C1a, Profile S-C2, the reset password and expired link pages) | "A short design round first": before M1-2, a design round with 2–3 directions for these screens, for the Lead to choose (spec CN-62). Brief (spec CN-64): the directions stay inside the banana-leaf style and differ in layout and in how errors are shown |
| UI17 | Direction of the account screens | "I choose direction A": "Leaf parcel", as offered in PR #60: one leaf-parcel card under the band with Sign in / Sign up tabs; a field's error is red text right under the field with a red field border; a message about the whole action is a Notice at the top of the card. The mockups are removed, all of them, as B50 says (the Lead's answer: "Delete all mockups (per B50)") |
| UI18 | Texts of the account screens | "Approve the whole table": the Vietnamese and English texts listed in PR #60 are approved as they are; they are kept in "Texts approved by the Lead" below |

## How the money block reads the states

The block only shows states the spec already defines (section 4.2 and 4.3 of the spec); it adds no rule.

| Order | Block |
|---|---|
| Active, payment state Unpaid | Stop 1 "Unpaid" lit, amount to transfer |
| Active, Reported | Stop 2 "Transfer reported" lit, amount reported, waiting for the shop |
| Active, Reported after part of the money was received | Stop 2, with the line "Shop received Y" (UI9) |
| Active, Paid | Stop 3 "Shop received" lit in green |
| Active, Paid with a report still open | Stop 3 green, with the line "Customer reported X transferred, waiting for confirmation" (UI7) |
| Active, Underpaid | Stop 3 half filled, red "Still owed X" (UI4) |
| Active, with a refund (edit lowered the total) | The 3-stop bar, and under it the 2-stop refund bar |
| Cancelled or Rejected, with a refund | Only the 2-stop refund bar Needs refund → Refunded, with how it was refunded (UI5); with a report still open, also the line "Transfer of X reported, waiting for the shop to confirm" (UI8) |
| Cancelled or Rejected, nothing to settle | One line "Nothing left to settle" (UI5) |
| Cancelled or Rejected, no refund, a report still open | One line "Transfer of X reported, waiting for the shop to confirm" (CN-39) |

On the shop's Order detail the same states use the shop's wording (UI10). The notice for a transfer the shop did not find (CN-41) stays as it is, under the block; the Payment screen shows it in every state, not only next to the QR (CN-46).

## Tokens

### Colour (light / dark)

| Token | Light | Dark | Use |
|---|---|---|---|
| `leaf-deep` | `#1d4a29` | `#13301b` | The banana-leaf band at the top |
| `leaf` | `#2e6b3c` | `#6dbb7c` | Primary actions, "Shop received" |
| `leaf-soft` | `#e2eedd` | `#1c3323` | Selected and success backgrounds |
| `chili` | `#b8321f` | `#f08a72` | Cutoff passed, refusals, Still owed, Needs refund |
| `turmeric` | `#b97a06` | `#e9b44c` | Waiting: Placed, Transfer reported |
| `paper` | `#f2f6f0` | `#0f1611` | Page background (a pale leaf tint, not cream) |
| `card` | `#ffffff` | `#18221b` | Cards |
| `ink` / `muted` | `#17231b` / `#566259` | `#e6eee6` / `#9db0a2` | Text |

Every filled colour has an `on-…` text colour so text on it keeps its contrast in both modes. The fake QR stays black on white in both modes.

### Type

- **Bricolage Grotesque** (700–800): page titles, prices, the app name, the amount in the money block. Tight tracking, set large: the type is part of the design.
- **Be Vietnam Pro** (400–700): everything else; tabular figures for money.
- Scale: 13 / 15 / 17 / 20 / 26 / 34 px. Sentence case everywhere; no all-caps labels.

### Layout

```
phone (375px)                         computer
┌──────────────────────────┐          ┌──────────────────────────────────────────┐
│▓▓ banana leaf band ▓▓▓▓▓▓│          │▓▓ banana leaf band ▓▓▓▓▓▓▓▓▓▓ nav ▓ VI/EN│
│▓ Cơm Lá          VI|EN ▓▓│          ├──────────────────────────────────────────┤
├──────────────────────────┤          │ Page title (Bricolage)                   │
│ Page title               │          │ ┌──────┐┌──────┐┌──────┐  ┌───────────┐  │
│ ╭────────────────────╮   │          │ │ art  ││ art  ││ art  │  │ build own │  │
│ │  drawn dish on leaf│   │          │ │ name ││ name ││ name │  │ cart      │  │
│ │  name      45.000 +│   │          │ └──────┘└──────┘└──────┘  └───────────┘  │
│ ╰────────────────────╯   │          └──────────────────────────────────────────┘
│ [Week] [Cart] [Orders]   │
└──────────────────────────┘
```

Content is left aligned. Cards are rounded more (leaf parcels) than buttons and inputs, so the radius shows hierarchy.

### Principles

- One bold thing: the banana leaf (the band and the drawn dishes on leaf). Everything else stays quiet.
- Colour carries state: green done, turmeric waiting, chili needs attention, the same on every screen.
- Motion only answers a tap: a dish dropping onto the plate, "added" feedback. It is turned off with reduced motion.
- Every picture is our own inline SVG; dishes the drawing set does not know get a plain rice bowl.

## Account screens round (UI16)

Status: Chosen by the Lead: direction A "Leaf parcel" (UI17); the texts below approved (UI18).

The brief (UI16, spec CN-64): the directions stay inside banana-leaf and differ in layout and in how errors are shown. Every direction keeps a field's message under its field (BR-29a, CN-64) and uses the tokens above. The screens: Sign in / Sign up (S-C1), Forgot password (S-C1a), the reset password page, the expired link page, Profile (S-C2).

The mockups were at `/proto/accounts` (PR M1-D, #60): switch the direction, the screen and the case; each case filled the form and tapped the main button on fake accounts (B50). Only the states the spec decides were drawn; an undecided part showed "Not decided" (B51). They followed the VI/EN switch (B53). They were removed once the Lead chose (B50); their code stays in the history of PR #60.

| Direction | Layout | Errors |
|---|---|---|
| **A "Leaf parcel" (chosen)** | One leaf-parcel card under the band, with Sign in / Sign up tabs | Red text right under the field and a red field border; a message about the whole action is a Notice at the top of the card |
| B "Big leaf band" | A tall leaf band with the title and a drawing; the form straight on the paper; two columns on a computer | A chili-soft label with an icon under the field, and a summary box at the top of the form whose items jump to their field |
| C "Step by step" | One question per step (phone or email first, then the password), with progress dots | The error under the field; a message about the whole action in a box right above the main button |

### Direction A, as the mockup drew it

- **Layout.** One column, at most 28rem wide, centred on the page, with its content left aligned. One leaf-parcel card (`.parcel`, card colour, a thin steel ring) holds the whole screen. On Sign in and Sign up the card starts with two tabs, "Sign in" and "Sign up", the current one underlined in leaf green; the other screens have no tabs. Then the page title (Bricolage Grotesque, 26 px, extra bold) and the intro in muted text.
- **Fields.** Label above the input (14 px, muted); inputs at least 48 px high, 16 px text, rounded, with a steel ring that turns leaf green on focus; a hint (for example the password rule) in muted 13 px under the field while it has no error.
- **Errors.** A field's message is chili text (13 px) right under the field, and the field's ring turns chili and thicker; the input carries `aria-invalid` and points to the message. A message about the whole action (for example "Wrong password", "You have not confirmed your email" with "Send the confirmation link again" under it, "Too many attempts…") is a Notice at the top of the card, under the title, with `role="alert"`; chili for a refusal, leaf for "Your email is already confirmed, please sign in" with a "Sign in" link.
- **Actions.** The main button fills the card width (leaf green, at least 48 px high). On Sign in and Sign up, "or" between two thin lines, then "Continue with Google" as a secondary button. Under it, links in leaf green: "Forgot password?" on Sign in; Forgot password and the expired-link page link back to "Sign in".
- **Sent.** Once a link is sent, the card shows the sent title (for example "Check your email to confirm"), one sentence, and "Send again", disabled with "Send again in N s" during the 60 seconds.
- **Profile.** The same card: "Complete your profile" with its intro when the profile is incomplete, "Profile" otherwise; the declined-building notice (BR-16) as a chili Notice at the top; fields name, phone number, email (read-only with a note for a Google account; "Waiting for confirmation of <new email>" in turmeric under it, with "Send again"), the default building with the prototype's existing link to propose one (`m.cart.propose` and the other `m.cart.propose…` texts of `src/domain/i18n.ts`, not part of the UI18 table), the language, then "Save".

### Texts approved by the Lead (UI18)

The texts of the account screens, as listed in PR #60. "Spec" means the English is the spec's own; "Drafted" means Claude drafted both languages.

| Vietnamese | English | Source |
|---|---|---|
| Đăng nhập | Sign in | Spec |
| Đăng ký | Sign up | Spec |
| Đăng nhập để đặt cơm | Sign in to order lunch | Drafted |
| Tạo tài khoản | Create an account | Drafted |
| Chỉ cần số điện thoại, email và mật khẩu. Tên và tòa nhà bạn điền sau khi xác nhận email. | Only a phone number, an email and a password. You add your name and building after confirming the email. | Drafted |
| Số điện thoại hoặc email | Phone number or email | Drafted |
| Số điện thoại / Email / Mật khẩu / Mật khẩu mới | Phone number / Email / Password / New password | Drafted |
| Tiếp tục với Google | Continue with Google | Drafted |
| hoặc | or | Drafted |
| Quên mật khẩu? | Forgot password? | Spec ("Forgot password") |
| Chưa có tài khoản? / Đã có tài khoản? | No account yet? / Already have an account? | Drafted |
| Tiếp tục / Quay lại / Bước {i} trên {n} | Continue / Back / Step {i} of {n} | Drafted (direction C) |
| Bắt buộc | Required | Spec |
| Số điện thoại không hợp lệ | Phone number is not valid | Spec |
| Email không hợp lệ | Email is not valid | Spec |
| Ít nhất 8 ký tự, có cả chữ và số | At least 8 characters, with both letters and digits | Spec |
| Sai mật khẩu | Wrong password | Spec |
| Không có tài khoản nào với số điện thoại hoặc email này | No account with this phone number or email | Spec |
| Tài khoản này đăng nhập bằng Google | This account signs in with Google | Spec |
| Bạn chưa xác nhận email | You have not confirmed your email | Spec |
| Gửi lại link xác nhận | Send the confirmation link again | Spec |
| Thử quá nhiều lần, vui lòng thử lại sau vài phút | Too many attempts, please try again in a few minutes | Spec |
| Kiểm tra email để xác nhận | Check your email to confirm | Spec |
| Bấm vào link trong email để xác nhận tài khoản. Link dùng được một lần, trong 1 giờ. | Tap the link in the email to confirm the account. The link works once, for 1 hour. | Drafted |
| Gửi lại | Send again | Spec |
| Gửi lại sau {s} giây | Send again in {s} s | Drafted |
| Email này đã có tài khoản (đăng nhập bằng Google) | This email already has an account (signs in with Google) | Spec |
| Email này đã có tài khoản (đăng nhập bằng số điện thoại) | This email already has an account (signs in with a phone number) | Spec |
| Số điện thoại này đã có tài khoản. Nếu là của bạn, hãy gọi cho shop | This phone number already has an account. If it is yours, call the shop | Spec |
| Số điện thoại này đang chờ xác nhận email | This phone number is waiting for its email to be confirmed | Spec |
| Email này đã có tài khoản đăng nhập bằng số điện thoại; hãy đăng nhập bằng số điện thoại và mật khẩu | This email already has an account that signs in with a phone number; sign in with phone + password | Spec |
| Email này có tài khoản đăng nhập bằng số điện thoại và chưa được xác nhận | This email has an account that signs in with a phone number and is not confirmed yet | Spec |
| Email này đã có tài khoản | This email already has an account | Spec |
| Email này dành cho tài khoản của shop | This email is for a shop account | Spec |
| Email này đang chờ xác nhận | This email is waiting for its confirmation | Spec |
| Đang chờ xác nhận {email} | Waiting for confirmation of {email} | Spec |
| Quên mật khẩu | Forgot password | Spec |
| Nhập số điện thoại hoặc email của tài khoản. Link đặt lại mật khẩu được gửi tới email của tài khoản. | Enter the phone number or email of your account. The reset link goes to the email of the account. | Drafted |
| Gửi link đặt lại mật khẩu | Send the reset link | Drafted |
| Đã gửi link đặt lại mật khẩu | The reset link is sent | Drafted |
| Mở email của tài khoản và bấm vào link. Link dùng được một lần, trong 1 giờ. | Open the email of your account and tap the link. The link works once, for 1 hour. | Drafted |
| Đặt mật khẩu mới | Set a new password | Drafted |
| Sau khi lưu, bạn được đăng nhập trên máy này và đăng xuất trên mọi máy khác. | Once it is saved, you are signed in on this device and signed out on every other device. | Drafted |
| Lưu mật khẩu mới | Save the new password | Drafted |
| Link đã hết hạn | The link has expired | Spec |
| Nhập số điện thoại hoặc email của tài khoản để nhận link mới. | Enter the phone number or email of your account to get a new link. | Drafted |
| Gửi link mới | Send a new link | Drafted |
| Email của bạn đã được xác nhận, vui lòng đăng nhập | Your email is already confirmed, please sign in | Spec |
| Hồ sơ / Hoàn tất hồ sơ | Profile / Complete your profile | Drafted |
| Cho shop biết tên bạn và tòa nhà giao cơm trước khi đặt món. | Tell the shop your name and the building to deliver to before you order. | Drafted |
| Tên / Tòa nhà mặc định / Chọn tòa nhà / Ngôn ngữ / Lưu | Name / Default building / Pick a building / Language / Save | Drafted |
| Tối đa 80 ký tự | At most 80 characters | Drafted |
| Email của tài khoản Google không đổi được. | The email of a Google account cannot be changed. | Drafted |
| Email mới chỉ có hiệu lực sau khi bạn bấm link gửi tới email đó. | The new email takes effect only after you tap the link sent to it. | Drafted |
| Shop không giao tới {tòa}; hãy chọn tòa khác | The shop does not deliver to {building}; pick another building | Spec |
| Kiểm tra lại {n} chỗ bên dưới | Check {n} fields below | Drafted (direction B) |

The rows marked "direction B" or "direction C" belong to directions that were not chosen; they are kept so the approved list stays as the Lead saw it. Messages that M1-2 to M1-5 need and this table does not have are drafted by Claude and listed in their PR for the Lead to review (CN-64).
