// NOTE: This is a machine-draft translation. Per spec §16, a native-speaker
// review pass is required before public launch. Keys that were uncertain are
// listed in the translator note at the bottom of this file.
import type { Dict } from "./en";

export const mm: Dict = {
  appName: "WorldBet2026",
  login: "ဝင်မည်",
  register: "စာရင်းသွင်းမည်",
  logout: "ထွက်မည်",
  phone: "ဖုန်းနံပါတ်",
  pin: "PIN ၆ လုံး",
  pinConfirm: "PIN အတည်ပြုပါ",
  currentPin: "လက်ရှိ PIN",
  newPin: "PIN အသစ်",
  changePin: "PIN ပြောင်းမည်",
  inviteCode: "ဖိတ်ကြားကုဒ်",
  displayName: "သင့်နာမည်",
  tabMatches: "ပွဲများ",
  tabBets: "ကျွန်ုပ်၏လောင်းကြေးများ",
  tabBalance: "လက်ကျန်ငွေ",
  live: "တိုက်ရိုက်",
  suspended: "ခေတ္တရပ်ဆိုင်းထားသည် — လိုင်းအပ်ဒိတ်လုပ်နေသည်",
  finished: "ပြီးဆုံး",
  betSlip: "လောင်းကြေးဖောင်",
  stake: "လောင်းငွေ (ကျပ်)",
  confirmBet: "လောင်းကြေးအတည်ပြုမည်",
  scoreNow: "လက်ရှိဂိုးရလဒ်",
  liveNote: "ဤလောင်းကြေးနောက်ပိုင်း ဂိုးများသာ ရေတွက်သည်",
  outWin: "နိုင်",
  outHalfWin: "တစ်ဝက်နိုင်",
  outOnLine: "လိုင်းပေါ်ကျ",
  outPush: "ညီမျှ",
  outHalfLose: "တစ်ဝက်ရှုံး",
  outLose: "ရှုံး",
  lineMoved: "လိုင်းပြောင်းသွားသည် — စျေးနှုန်းအသစ်အတည်ပြုပါ",
  ticket: "လောင်းကြေးလက်မှတ်",
  saveTicket: "လက်မှတ်ပုံသိမ်းမည်",
  scanToVerify: "စစ်ဆေးရန် စကင်ဖတ်ပါ",
  player: "ကစားသမား",
  match: "ပွဲစဉ်",
  pick: "ရွေးချယ်မှု",
  placed: "ထည့်သွင်းသည့်ရက်",
  statusLbl: "အခြေအနေ",
  scoreAtBet: "လောင်းချိန်ဂိုးရလဒ်",
  net: "အသားတင်",
  stPending: "စောင့်ဆိုင်းဆဲ",
  stWon: "နိုင်သည်",
  stHalfWon: "တစ်ဝက်နိုင်သည်",
  stPush: "ဆုံးခြေမဲ့",
  stHalfLost: "တစ်ဝက်ရှုံးသည်",
  stLost: "ရှုံးသည်",
  stVoid: "ပျက်ပြယ်",
  youPay: "သင်ပေးရမည်",
  housePays: "ကုမ္ပဏီပေးရမည်",
  evenDay: "ညီမျှသည်",
  unsettled: "မရှင်းမလင်းသေး",
  settledRef: "ရှင်းလင်းပြီး",
  dayOpen: "ဖွင့်ထားသည်",
  dayClosed: "ပိတ်သည် — ယနေ့ ရှင်းလင်းပါ",
  daySettled: "ရှင်းလင်းပြီး",
  errLocked:
    "အကောင့်သော့ခတ်ထားသည် — နောက်မှထပ်ကြိုးစားပါ သို့မဟုတ် အက်ဒမင်အား ဆက်သွယ်ပါ",
  errWrong: "ဖုန်းနံပါတ် သို့မဟုတ် PIN မှားသည်",
  errLimit: "ကုမ္ပဏီ {n} ကျပ်သာ ထပ်လက်ခံနိုင်သည်",
  errMatchFinished: "ပွဲစဉ်ပြီးဆုံးသွားပြီ",
  errBettingClosed: "လောင်းကြေးပိတ်သည်",
  language: "ဘာသာစကား",
  sideFav: "ပေး",
  sideDog: "ယူ",
  close: "ပိတ်မည်",
  noBets: "လောင်းကြေးမရှိသေးပါ",
  noDays: "ရှင်းလင်းရန်မရှိသေးပါ",
  pinFormat: "PIN သည် ဂဏန်း ၆ လုံးတိတိ ဖြစ်ရမည်",
  over: "ဂိုးပေါ်",
  under: "ဂိုးအောက်",
  inviteFriends: "သူငယ်ချင်းများကို ဖိတ်ကြားပါ",
  inviteLink: "သင့်ဖိတ်ကြားလင့်ခ်",
  copy: "ကူးယူပါ",
  copied: "ကူးယူပြီး!",
  invitesUsed: "ဖိတ်ကြားမှု {max} ခုမှ {used} ခု သုံးပြီး",
  friendsInvited: "သင် {n} ယောက်ကို ဖိတ်ကြားပြီး",
  outNarrowMiss: "နည်းနည်းလွဲ",
  outNarrowMissRange: "−¼ မှ −¾ လောင်းငွေ",
  outClearMiss: "လုံးဝလွဲ",
  commission: "ကော်မရှင်",
  discount: "လျှော့စျေး",
} as const;

/*
 * Translator note — keys reviewed but uncertain; flag for native-speaker pass:
 *
 * - outPush / stPush: "ညီမျှ" (even/level) used for a push bet outcome;
 *   common betting term in Burmese may differ — verify.
 * - evenDay: "ညီမျှသည်" (balance is even); confirm this reads naturally on the
 *   balance/settlement screen.
 * - housePays / youPay: straightforward but the possessive framing may need
 *   adjustment per house style.
 * - liveNote: wording around "ဂိုးများ" (goals) and live-bet context — confirm
 *   this is the standard phrase used by local bookies.
 * - dayClosed: "ယနေ့ ရှင်းလင်းပါ" (settle today) — imperative tone; verify
 *   it matches the intended admin-facing register.
 */
