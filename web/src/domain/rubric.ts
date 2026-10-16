// Rubric for the Grand Final: one rubric for the whole 5-minute slot (pitch and hands-on demo video),
// in the order of the five segments the teams were taught in the Showcase Prep workshop deck. The
// wording is the ToT UM rubric's, in plain words for executive judges who may not be technical. Eight
// criteria (ADR 0006, 0007); the weight shown is each criterion's share of the final, from WEIGHTS in
// scoring.ts, rounded to one decimal. Codes are numbered 1–8 in the order judges see them; the keys
// (d1…v4) stay the ToT ones so stored sheets and the maths keep their meaning.

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
        key: 'd1', code: '1', name: 'Real problem', weight: '10.8%',
        question: 'Is it a real problem for real people?',
        levels: {
          1: 'No problem stated, only the app',
          2: 'A problem, but vague: unclear what it is or who has it',
          3: 'Clear problem and clear users',
          4: 'Clear problem and users, backed by evidence: a number, a real story, or what users said',
        },
      },
    ],
  },
  {
    title: 'Solution', time: '0:45–1:30',
    criteria: [
      {
        key: 'd3', code: '2', name: 'Fresh idea', weight: '10.8%',
        question: 'Does it really need AI, and is it different from what people use today?',
        levels: {
          1: 'A generic chatbot or sample app; nothing specific to their user',
          2: 'A common idea, done fine, but unclear why it needs AI',
          3: "Clear why AI is needed for this user's problem (not just a form or a search)",
          4: 'Clearly needs AI, and they say what people use today and what their app does that it cannot',
        },
      },
      {
        key: 'd2', code: '3', name: 'Built on AWS', weight: '13.5%',
        question: 'How well does the app use AWS, with Amazon Bedrock at its core?',
        levels: {
          1: 'Amazon Bedrock not shown or explained',
          2: 'Names AWS services, but unclear what each does',
          3: 'Clear what Amazon Bedrock does in the app and how any other AWS services connect to it',
          4: 'Clear how Amazon Bedrock and AWS fit, and they explain why this Bedrock model or how they keep its answers safe and correct',
        },
      },
    ],
  },
  {
    title: 'Demo video', time: '1:30–3:30',
    criteria: [
      {
        key: 'v2', code: '4', name: 'Easy to use', weight: '13.5%',
        question: 'Could its intended user use it without help?',
        levels: {
          1: 'Could not tell how to use it',
          2: 'Hard to follow; without the team talking I could not tell what to do on screen',
          3: 'Easy to follow; each step is clear on screen',
          4: 'Clear at a glance: few steps, nothing confusing',
        },
      },
    ],
  },
  {
    title: 'Real-world impact', time: '3:30–4:15',
    criteria: [
      {
        key: 'v1', code: '5', name: 'Clear impact', weight: '18.9%',
        question: 'Did they explain how it helps real people?',
        levels: {
          1: 'Only features, no real situation',
          2: 'Mentioned a use, but vague',
          3: "Described a specific user's situation (a persona is fine) and how the app helps them",
          4: "A specific user's situation, plus how much it helps as a number (an estimate is fine: people helped, time or money saved)",
        },
      },
      {
        key: 'd4', code: '6', name: 'Usable in real life', weight: '10.8%',
        question: 'Could a real organisation or community start using it?',
        levels: {
          1: 'Only a classroom demo; no real setting in mind',
          2: 'Useful, but key parts are missing or only planned',
          3: 'The main task works end to end in the video, and they say who would use it first (an organisation or community)',
          4: 'Works end to end, and they name a real organisation that could pilot it (no agreement needed) and why it fits them',
        },
      },
      {
        key: 'v4', code: '7', name: 'Can grow', weight: '10.8%',
        question: 'Could it serve many more people?',
        levels: {
          1: 'Not mentioned',
          2: 'Said it can grow, with no reason (e.g. only "AWS scales")',
          3: 'Named one of: who or where else could use it, how many users, or a rough cost',
          4: 'A clear plan to grow, covering at least two of: who or where else, how many users, rough cost per user',
        },
      },
    ],
  },
  {
    title: 'Closing', time: '4:15–5:00',
    criteria: [
      {
        key: 'd5', code: '8', name: 'Clear pitch', weight: '10.8%',
        question: 'Was the pitch clear and easy to follow?',
        levels: {
          1: 'Hard to follow',
          2: 'Could follow, but jumped around or was cut off at 5:00',
          3: 'Easy to follow from start to end, within 5 minutes (any order is fine)',
          4: 'Easy to follow, within 5 minutes, and memorable: I could repeat their main point',
        },
      },
    ],
  },
]

/** All eight criteria in the order judges see them. */
export const ALL_CRITERIA: Criterion[] = SEGMENTS.flatMap((s) => s.criteria)
