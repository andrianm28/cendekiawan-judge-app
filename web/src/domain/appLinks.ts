// Link to each team's live app, shown as a QR code on the stage screen while the team presents,
// so the audience can try it and see the app is real. Not part of the judging.
// Seeded from the decks and submissions (17 Oct 2026); teams send the rest in the finalists' WhatsApp group.

export const APP_LINKS: Partial<Record<string, string>> = {
  t09: 'https://d2u4k6rtsz1kn9.cloudfront.net/', // EcoLens, submission brief
  t10: 'http://agroshield-ai-frontend-162663625909.s3-website.ap-southeast-5.amazonaws.com', // AgroShield AI, Website Link.docx
  t11: 'https://d3f173je1qvblr.cloudfront.net/', // Smart Waste, QR in the deck
  t16: 'https://futuresight.my', // Malaysia Business Launchpad, closing slide
  t20: 'https://dewanai.my', // Dewan AI, slide 1
}

/** The link as people would type it: no scheme, no trailing slash. */
export const shortUrl = (url: string): string => url.replace(/^https?:\/\//, '').replace(/\/$/, '')
