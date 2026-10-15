// Rubric for the Grand Final: one rubric for the whole 5-minute slot (pitch and hands-on demo video),
// in the order of the five segments the teams were taught in the Showcase Prep workshop deck, with the
// deck's own wording. Criteria, keys and weights are the ToT UM ones, so scoring.ts is unchanged; the
// weight shown is each criterion's share of the final (D 50% ÷ 5, V × 50%).

import type { CriterionKey, Level } from './scoring'

export interface Criterion {
  key: CriterionKey
  code: string
  name: string
  weight: string
  /** The criterion as one plain question, for judges without a technical background. */
  question: string
  levels: Record<Level, string>
}

export const LEVEL_NAMES: Record<Level, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Excellent',
}

export interface Segment {
  title: string
  /** When in the 5 minutes this segment runs, as taught in the workshop deck. */
  time: string
  criteria: Criterion[]
}

export const SEGMENTS: Segment[] = [
  {
    title: 'Problem', time: '0:00–0:45',
    criteria: [
      {
        key: 'd1', code: 'D1', name: 'Real problem', weight: '10%',
        question: 'Did they name a specific user and show the problem is real?',
        levels: {
          1: 'Generic users ("everyone", "students"), no clear problem',
          2: 'A problem, but the user is generic or there is no evidence ("we believe…")',
          3: 'A named persona in a specific situation, plus one piece of evidence (a statistic, a real story or a user conversation)',
          4: 'Level 3, plus how people solve it today and the gap this app fills',
        },
      },
    ],
  },
  {
    title: 'Solution', time: '0:45–1:30',
    criteria: [
      {
        key: 'd3', code: 'D3', name: 'Why AI, and what is different', weight: '10%',
        question: 'Does it really need AI, and is it different from what already exists?',
        levels: {
          1: 'A tutorial or template; a form or search engine would do the same',
          2: '"AI is powerful / modern" without saying what it does; no clear difference',
          3: 'Names what the AI does for this user (e.g. understands free text) and one clear difference from existing solutions',
          4: 'Level 3, plus a local edge big players will not copy (BM or dialect, Malaysian systems, a niche)',
        },
      },
      {
        key: 'd2', code: 'D2', name: 'Works on AWS', weight: '10%',
        question: 'Does the app run on AWS with Amazon Bedrock, and can the team explain how?',
        levels: {
          1: 'Not deployed, or did not work',
          2: 'Worked with problems, or the team could not explain how it is built',
          3: 'The deployed app worked end to end, and they explained the architecture (user → Lambda → Bedrock, model named)',
          4: 'Level 3, felt like a finished product, with a reason for the model they chose',
        },
      },
    ],
  },
  {
    title: 'Demo', time: '1:30–3:30',
    criteria: [
      {
        key: 'v2', code: 'V2', name: 'Easy to use', weight: '12.5%',
        question: 'Could their user use it without help?',
        levels: {
          1: 'Could not tell how to use it',
          2: 'Could follow it only because the presenter explained',
          3: 'Their user could follow it',
          4: 'So simple it needs no explaining',
        },
      },
      {
        key: 'v3', code: 'V3', name: 'Reliable', weight: '10%',
        question: 'Did it give meaningful answers with different inputs?',
        levels: {
          1: 'Failed or gave no result',
          2: 'Worked, but with only one input',
          3: '2–3 real inputs, all with meaningful outputs',
          4: 'Also handled an unusual or harmful input well, or showed its limits and guardrails honestly',
        },
      },
    ],
  },
  {
    title: 'Real-world impact', time: '3:30–4:15',
    criteria: [
      {
        key: 'v1', code: 'V1', name: 'Impact shown', weight: '17.5%',
        question: 'Did they show how it helps their user, and how much?',
        levels: {
          1: 'Only features, no real situation',
          2: 'Talked about a use, did not show it',
          3: "Showed the user's real situation step by step",
          4: 'Level 3, plus who benefits and how much (a number or a named organisation)',
        },
      },
      {
        key: 'd4', code: 'D4', name: 'Real organisation', weight: '10%',
        question: 'Could a real organisation use this outside the competition?',
        levels: {
          1: 'Only a school exercise',
          2: 'Useful for a small group; "maybe someone would be interested"',
          3: 'Names one real Malaysian organisation that could pilot it (school, clinic, NGO, agency, GLC)',
          4: 'Level 3, plus a plan to roll it out and who might be left out (device, internet, digital skills)',
        },
      },
      {
        key: 'v4', code: 'V4', name: 'Can grow on AWS', weight: '10%',
        question: 'Do they know what it takes to serve many more users on AWS?',
        levels: {
          1: 'Not mentioned',
          2: '"It can scale / AWS is scalable", no reason given',
          3: 'Who else would use it, plus a rough AWS cost per user per month',
          4: 'Level 3, plus what breaks first at scale (e.g. Lambda concurrency, Bedrock limits) and how they would handle it',
        },
      },
    ],
  },
  {
    title: 'Closing', time: 'whole 5 minutes',
    criteria: [
      {
        key: 'd5', code: 'D5', name: 'Clear pitch', weight: '10%',
        question: 'Was the 5-minute story clear and convincing?',
        levels: {
          1: 'Hard to follow, or ran well over time',
          2: 'Said what it does, not why; one person carried everything',
          3: 'Clear problem → solution → demo → impact within 5 minutes',
          4: 'Level 3, plus a one-sentence pitch anyone understands, ending on impact, with smooth hand-offs',
        },
      },
    ],
  },
]

/** All nine criteria in the order judges see them. */
export const ALL_CRITERIA: Criterion[] = SEGMENTS.flatMap((s) => s.criteria)
