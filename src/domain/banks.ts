// The banks of the Settings screen, S-S4 (CN-60, CN-83, B73): the NAPAS list of banks that take
// VietQR, with their BIN, short name and full name, taken once on 2026-11-27 from the free public
// list https://api.vietqr.io/v2/banks and kept as this fixed file; the app never calls that
// service. Update it by hand when a bank is added or renamed. One full name had a broken
// character in the source ("IBKHN") and is written here as it should read.

export type Bank = { bin: string; short: string; name: string }

const LIST: Bank[] = [
  { bin: '970415', short: 'VietinBank', name: 'Ngân hàng TMCP Công thương Việt Nam' },
  { bin: '970436', short: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại Thương Việt Nam' },
  { bin: '970418', short: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam' },
  { bin: '970405', short: 'Agribank', name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam' },
  { bin: '970448', short: 'OCB', name: 'Ngân hàng TMCP Phương Đông' },
  { bin: '970422', short: 'MBBank', name: 'Ngân hàng TMCP Quân đội' },
  { bin: '970407', short: 'Techcombank', name: 'Ngân hàng TMCP Kỹ thương Việt Nam' },
  { bin: '970416', short: 'ACB', name: 'Ngân hàng TMCP Á Châu' },
  { bin: '970432', short: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng' },
  { bin: '970423', short: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong' },
  { bin: '970403', short: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Tài Lộc' },
  { bin: '970437', short: 'HDBank', name: 'Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh' },
  { bin: '970454', short: 'VietCapitalBank', name: 'Ngân hàng TMCP Bản Việt' },
  { bin: '970429', short: 'SCB', name: 'Ngân hàng TMCP Sài Gòn' },
  { bin: '970441', short: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam' },
  { bin: '970443', short: 'SHB', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội' },
  { bin: '970431', short: 'Eximbank', name: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam' },
  { bin: '970426', short: 'MSB', name: 'Ngân hàng TMCP Hàng Hải' },
  { bin: '546034', short: 'CAKE', name: 'TMCP Việt Nam Thịnh Vượng - Ngân hàng số CAKE by VPBank' },
  { bin: '546035', short: 'Ubank', name: 'TMCP Việt Nam Thịnh Vượng - Ngân hàng số Ubank by VPBank' },
  { bin: '963388', short: 'Timo', name: 'Ngân hàng số Timo by Ban Viet Bank (Timo by Ban Viet Bank)' },
  { bin: '971005', short: 'ViettelMoney', name: 'Tổng Công ty Dịch vụ số Viettel - Chi nhánh tập đoàn công nghiệp viễn thông Quân Đội' },
  { bin: '971011', short: 'VNPTMoney', name: 'Trung tâm dịch vụ tài chính số VNPT- Chi nhánh Tổng công ty truyền thông (VNPT Fintech)' },
  { bin: '970400', short: 'SaigonBank', name: 'Ngân hàng TMCP Sài Gòn Công Thương' },
  { bin: '970409', short: 'BacABank', name: 'Ngân hàng TMCP Bắc Á' },
  { bin: '971133', short: 'PVcomBank Pay', name: 'Ngân hàng số PVcomBank' },
  { bin: '971025', short: 'MoMo', name: 'CTCP Dịch Vụ Di Động Trực Tuyến' },
  { bin: '970412', short: 'PVcomBank', name: 'Ngân hàng TMCP Đại Chúng Việt Nam' },
  { bin: '970414', short: 'MBV', name: 'Ngân hàng TNHH MTV Việt Nam Hiện Đại' },
  { bin: '970419', short: 'NCB', name: 'Ngân hàng TMCP Quốc Dân' },
  { bin: '970424', short: 'ShinhanBank', name: 'Ngân hàng TNHH MTV Shinhan Việt Nam' },
  { bin: '970425', short: 'ABBANK', name: 'Ngân hàng TMCP An Bình' },
  { bin: '970427', short: 'VietABank', name: 'Ngân hàng TMCP Việt Á' },
  { bin: '970428', short: 'NamABank', name: 'Ngân hàng TMCP Nam Á' },
  { bin: '970430', short: 'PGBank', name: 'Ngân hàng TMCP Thịnh vượng và Phát triển' },
  { bin: '970433', short: 'VietBank', name: 'Ngân hàng TMCP Việt Nam Thương Tín' },
  { bin: '970438', short: 'BaoVietBank', name: 'Ngân hàng TMCP Bảo Việt' },
  { bin: '970440', short: 'SeABank', name: 'Ngân hàng TMCP Đông Nam Á' },
  { bin: '970446', short: 'COOPBANK', name: 'Ngân hàng Hợp tác xã Việt Nam' },
  { bin: '970449', short: 'LPBank', name: 'Ngân hàng TMCP Lộc Phát Việt Nam' },
  { bin: '970452', short: 'KienLongBank', name: 'Ngân hàng TMCP Kiên Long' },
  { bin: '668888', short: 'KBank', name: 'Ngân hàng Đại chúng TNHH Kasikornbank' },
  { bin: '970466', short: 'KEBHanaHCM', name: 'Ngân hàng KEB Hana – Chi nhánh Thành phố Hồ Chí Minh' },
  { bin: '970467', short: 'KEBHANAHN', name: 'Ngân hàng KEB Hana – Chi nhánh Hà Nội' },
  { bin: '977777', short: 'MAFC', name: 'Công ty Tài chính TNHH MTV Mirae Asset (Việt Nam)' },
  { bin: '999888', short: 'VBSP', name: 'Ngân hàng Chính sách Xã hội' },
  { bin: '963668', short: 'BNP HN', name: 'Ngân hàng BNP Paribas – Chi nhánh Hà Nội' },
  { bin: '555666', short: 'BIDC', name: 'Ngân hàng Đầu Tư Và Phát Triển Campuchia - Chi nhánh Hà Nội' },
  { bin: '963666', short: 'BNP HCM', name: 'Ngân hàng BNP Paribas – Chi nhánh Thành phố Hồ Chí Minh' },
  { bin: '971101', short: 'ZaloPay', name: 'Ví điện tử ZaloPay' },
  { bin: '963688', short: 'BOCHK', name: 'Ngân hàng Bank of China (Hong Kong) Limited – Chi nhánh Hồ Chí Minh' },
  { bin: '970465', short: 'BSP', name: 'Ngân hàng SinoPac - Chi nhánh Thành phố Hồ Chí Minh' },
  { bin: '168999', short: 'CUBHCM', name: 'Ngân hàng Cathay United Bank – Chi nhánh Hồ Chí Minh' },
  { bin: '963686', short: 'ESUN', name: 'Ngân hàng Thương mại TNHH E.SUN – Chi nhánh Đồng Nai (ESUNBANK)' },
  { bin: '963669', short: 'ICBC', name: 'Ngân hàng Công thương Trung Quốc – Chi nhánh thành phố Hà Nội' },
  { bin: '971032', short: 'MVAS', name: 'Trung tâm Dịch vụ số Mobifone – Chi nhánh Tổng Công ty viễn thông Mobifone' },
  { bin: '963326', short: 'TNEX', name: 'TNEX by MSB' },
  { bin: '458761', short: 'HSBC', name: 'Ngân hàng TNHH MTV HSBC (Việt Nam)' },
  { bin: '970442', short: 'HongLeong', name: 'Ngân hàng TNHH MTV Hong Leong Việt Nam' },
  { bin: '970455', short: 'IBKHN', name: 'Ngân hàng Công nghiệp Hàn Quốc - Chi nhánh Hà Nội' },
  { bin: '970456', short: 'IBKHCM', name: 'Ngân hàng Công nghiệp Hàn Quốc - Chi nhánh TP. Hồ Chí Minh' },
  { bin: '970434', short: 'IndovinaBank', name: 'Ngân hàng TNHH Indovina' },
  { bin: '970406', short: 'Vikki', name: 'Ngân hàng TNHH Một thành viên số Vikki' },
  { bin: '801011', short: 'Nonghyup', name: 'Ngân hàng Nonghyup - Chi nhánh Hà Nội' },
  { bin: '796500', short: 'DBSBank', name: 'DBS Bank Ltd - Chi nhánh Thành phố Hồ Chí Minh' },
  { bin: '970439', short: 'PublicBank', name: 'Ngân hàng TNHH MTV Public Việt Nam' },
  { bin: '970410', short: 'StandardChartered', name: 'Ngân hàng TNHH MTV Standard Chartered Bank Việt Nam' },
  { bin: '533948', short: 'Citibank', name: 'Ngân hàng Citibank, N.A. - Chi nhánh Hà Nội' },
  { bin: '422589', short: 'CIMB', name: 'Ngân hàng TNHH MTV CIMB Việt Nam' },
  { bin: '970458', short: 'UnitedOverseas', name: 'Ngân hàng United Overseas - Chi nhánh TP. Hồ Chí Minh' },
  {
    bin: '970444',
    short: 'CBBank',
    name: 'Ngân hàng Thương mại trách nhiệm hữu hạn một thành viên Ngoại thương Công nghệ số (Vietcombank Neo Limited)',
  },
  { bin: '970408', short: 'GPBank', name: 'Ngân hàng Thương mại TNHH MTV Dầu Khí Toàn Cầu' },
  { bin: '970421', short: 'VRB', name: 'Ngân hàng Liên doanh Việt - Nga' },
  { bin: '970457', short: 'Woori', name: 'Ngân hàng TNHH MTV Woori Việt Nam' },
  { bin: '970462', short: 'KookminHN', name: 'Ngân hàng Kookmin - Chi nhánh Hà Nội' },
  { bin: '970463', short: 'KookminHCM', name: 'Ngân hàng Kookmin - Chi nhánh Thành phố Hồ Chí Minh' },
]

/** Every bank A–Z by short name, upper and lower case ignored (CN-83, AC230). */
export const BANKS: readonly Bank[] = [...LIST].sort((a, b) => new Intl.Collator('vi', { sensitivity: 'base' }).compare(a.short, b.short))

export const findBank = (bin: string): Bank | undefined => BANKS.find((b) => b.bin === bin)

/** "Vietcombank – Ngân hàng TMCP Ngoại Thương Việt Nam", as the list shows a bank (CN-83). */
export const bankLabel = (b: Bank): string => `${b.short} – ${b.name}`

/** Text without accents, in lower case, with "đ" as "d": what the search compares (CN-83). */
export const plainText = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()

/** The banks whose short or full name holds the text typed, accents and case ignored (AC230). */
export function searchBanks(query: string): Bank[] {
  const q = plainText(query.trim())
  if (!q) return [...BANKS]
  return BANKS.filter((b) => plainText(b.short).includes(q) || plainText(b.name).includes(q))
}
