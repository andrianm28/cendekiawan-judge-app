// Link to each team's live app, shown as a QR code on the stage screen while the team presents,
// so the audience can try it and see the app is real. Not part of the judging.
// Seeded from the decks and submissions (17 Oct 2026); teams send the rest in the finalists' WhatsApp group.

export const APP_LINKS: Partial<Record<string, string>> = {
  t01: 'https://d2g644ovl6nvjj.cloudfront.net/welcome.html', // Virtual Science Lab Assistant, WhatsApp group
  t02: 'https://d36fqgpgmtueiw.cloudfront.net/', // Learning Steps for Autistic Kids, sent by the organiser (page title matches)
  t03: 'https://main.d26f4vdein3639.amplifyapp.com/', // LangHub, WhatsApp group
  t04: 'https://myrayunus.github.io/StudySnap/', // StudySnap, WhatsApp group (https link, replaces the S3 http one)
  t05: 'https://d1bgbvuupgcwqf.cloudfront.net/', // MediGuard, WhatsApp group
  t06: 'https://d3g8knvf98dqba.cloudfront.net/index.html', // Diabetes Control AI Expert, WhatsApp group
  t07: 'https://d250i0gcy6fvmo.cloudfront.net/', // SmartMed Cycle, WhatsApp group
  t08: 'https://d1utnzv9i3qham.cloudfront.net/', // UbatJelas, WhatsApp group (replaces the S3 link that went down)
  t09: 'https://d2u4k6rtsz1kn9.cloudfront.net/', // EcoLens, submission brief + WhatsApp group
  t10: 'https://d1br6fvdh14z6c.cloudfront.net/', // AgroShield AI, WhatsApp group (https link, replaces the S3 http one)
  t11: 'https://d3f173je1qvblr.cloudfront.net/', // Smart Waste, QR in the deck + WhatsApp group
  t12: 'https://d3q99mmcfta2ll.cloudfront.net/', // See You CO2, WhatsApp group (https link, replaces the S3 http one)
  t13: 'https://d2pokujznmgw1q.cloudfront.net/', // FinBot, WhatsApp group
  t14: 'https://deal-guard-ochre.vercel.app/', // SME DealGuard MY, WhatsApp group
  t15: 'https://df9kx3mn95m8a.cloudfront.net/', // SMEwise, sent by the organiser (page title matches)
  t16: 'https://futuresight.my', // Malaysia Business Launchpad, closing slide
  t18: 'https://jpj-traffic-advisor.vercel.app', // City Mind MY, WhatsApp group
  t19: 'https://opsjejak.dx7fxqronvpae.amplifyapp.com/', // OpsJejak, WhatsApp group
  t20: 'https://app.dewanai.my', // Dewan AI, WhatsApp group (landing page: dewanai.my)
}

/** The link as people would type it: no scheme, no trailing slash. */
export const shortUrl = (url: string): string => url.replace(/^https?:\/\//, '').replace(/\/$/, '')
