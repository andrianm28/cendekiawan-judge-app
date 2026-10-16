// Rubric for the Grand Final: one rubric for the whole 5-minute slot (pitch and hands-on demo video),
// in the order of the five segments the teams were taught in the Showcase Prep workshop deck. The
// wording is the ToT UM rubric's, in plain words for executive judges who may not be technical. Eight
// criteria (ADR 0006, 0007); the weight shown is each criterion's share of the final, from WEIGHTS in
// scoring.ts, rounded to one decimal.

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
        question: 'Is it a real problem for real people?',
        levels: {
          1: 'No problem stated, only the app',
          2: 'A problem, but vague: unclear what it is or who has it',
          3: 'Clear problem and clear users',
          4: 'Level 3, plus evidence it matters now (a number, a real story, or what users said)',
        },
      },
    ],
  },
  {
    title: 'Solution', time: '0:45–1:30',
    criteria: [
      {
        key: 'd3', code: 'D3', name: 'Fresh idea', weight: '10%',
        question: 'How new is the idea, and does it really need AI?',
        levels: {
          1: 'A copy of a tutorial or sample app, little changed',
          2: 'A common idea, done fine',
          3: 'A common idea used in a smart new way, and AI is really needed',
          4: 'Original and clearly different from existing apps, with AI at its heart',
        },
      },
      {
        key: 'd2', code: 'D2', name: 'Built on AWS', weight: '10%',
        question: 'How well does the app use AWS, with Amazon Bedrock at its core?',
        levels: {
          1: 'AWS or Amazon Bedrock not shown or explained',
          2: 'Names AWS services, but unclear how they work together',
          3: 'Clear how Amazon Bedrock and the other AWS services make the app work',
          4: 'Level 3, plus a good reason for each choice (e.g. why this model)',
        },
      },
    ],
  },
  {
    title: 'Demo', time: '1:30–3:30',
    criteria: [
      {
        key: 'v2', code: 'V2', name: 'Easy to use', weight: '15.6%',
        question: 'Could a new user use it without help?',
        levels: {
          1: 'Could not tell how to use it',
          2: 'Hard to follow; needed a lot of explaining',
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
        key: 'v1', code: 'V1', name: 'Impact shown', weight: '21.9%',
        question: 'Did they show how it helps real people?',
        levels: {
          1: 'Only features, no real situation',
          2: 'Talked about a use, did not show it',
          3: "Showed a real user's situation, in the pitch or video",
          4: 'Level 3, plus who benefits and how much (people helped, time or money saved)',
        },
      },
      {
        key: 'd4', code: 'D4', name: 'Usable in real life', weight: '10%',
        question: 'Could a real organisation use this now?',
        levels: {
          1: 'Only a school exercise',
          2: 'Useful, but not ready for real use yet',
          3: 'Ready for a real organisation or community to use',
          4: 'Level 3, plus a named real organisation that could pilot it, and why it fits them',
        },
      },
      {
        key: 'v4', code: 'V4', name: 'Can grow', weight: '12.5%',
        question: 'Could it serve many more people?',
        levels: {
          1: 'Not mentioned',
          2: 'Said it can grow, no reason given',
          3: 'Named who else would use it, or a partial plan',
          4: 'A clear plan to grow, covering at least two of: rough cost, number of users, new places to use it',
        },
      },
    ],
  },
  {
    title: 'Closing', time: '4:15–5:00',
    criteria: [
      {
        key: 'd5', code: 'D5', name: 'Clear pitch', weight: '10%',
        question: 'Was the pitch clear and easy to follow?',
        levels: {
          1: 'Hard to follow',
          2: 'Could follow, but jumped around or ran over time',
          3: 'Easy to follow, in a logical order, within time',
          4: 'Level 3, and memorable: I could repeat their main point',
        },
      },
    ],
  },
]

/** All eight criteria in the order judges see them. */
export const ALL_CRITERIA: Criterion[] = SEGMENTS.flatMap((s) => s.criteria)
