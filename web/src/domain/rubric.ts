// Rubric for the Grand Final: one rubric for the whole 5-minute slot (pitch and hands-on demo video),
// in the order of the five segments the teams were taught in the Showcase Prep workshop deck. The
// wording is the ToT UM rubric's, in plain words for executive judges who may not be technical. Keys
// and weights are the ToT UM ones, so scoring.ts is unchanged; the weight shown is each criterion's
// share of the final (D 50% ÷ 5, V × 50%).

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
          1: 'No clear problem',
          2: 'A problem, but unclear who has it',
          3: 'Clear problem and clear users',
          4: 'Clear problem and users, plus facts showing it is big or urgent',
        },
      },
    ],
  },
  {
    title: 'Solution', time: '0:45–1:30',
    criteria: [
      {
        key: 'd3', code: 'D3', name: 'Fresh idea', weight: '10%',
        question: 'How new or creative is the idea?',
        levels: {
          1: 'A copy of a common example, barely changed',
          2: 'A common idea, done fine',
          3: 'A common idea used in a smart new way',
          4: 'Truly original; I have not seen this before',
        },
      },
      {
        key: 'd2', code: 'D2', name: 'Works well', weight: '10%',
        question: 'Does the app work, using AI on AWS?',
        levels: {
          1: 'Did not work',
          2: 'Worked, but with problems',
          3: 'Worked smoothly from start to end',
          4: 'Worked smoothly and felt like a finished product',
        },
      },
    ],
  },
  {
    title: 'Demo', time: '1:30–3:30',
    criteria: [
      {
        key: 'v2', code: 'V2', name: 'Easy to use', weight: '12.5%',
        question: 'Could a new user use it without help?',
        levels: {
          1: 'Could not tell how to use it',
          2: 'Could follow it only because the presenter explained',
          3: 'A new user could follow it',
          4: 'So simple it needs no explaining',
        },
      },
      {
        key: 'v3', code: 'V3', name: 'Reliable', weight: '10%',
        question: 'Did it work well each time they tried it?',
        levels: {
          1: 'Failed or gave no result',
          2: 'Worked, but they tried it only once',
          3: 'Tried a few different ways, good answers each time',
          4: 'Also handled a tricky or unusual request well',
        },
      },
    ],
  },
  {
    title: 'Real-world impact', time: '3:30–4:15',
    criteria: [
      {
        key: 'v1', code: 'V1', name: 'Impact shown', weight: '17.5%',
        question: 'Did they show how it helps real people?',
        levels: {
          1: 'Only features, no real situation',
          2: 'Talked about a use, did not show it',
          3: 'Showed a real situation step by step',
          4: 'Showed it, plus who benefits and how much',
        },
      },
      {
        key: 'd4', code: 'D4', name: 'Usable in real life', weight: '10%',
        question: 'Could people really use this outside the competition?',
        levels: {
          1: 'Only a school exercise',
          2: 'Useful for a small group',
          3: 'Ready for a real organisation or community',
          4: 'Could grow to a whole sector or the country',
        },
      },
      {
        key: 'v4', code: 'V4', name: 'Can grow', weight: '10%',
        question: 'Could it serve many more people?',
        levels: {
          1: 'Not mentioned',
          2: 'Said it can grow, no reason given',
          3: 'Named who else would use it',
          4: 'A clear plan to grow: cost, data and users',
        },
      },
    ],
  },
  {
    title: 'Closing', time: '4:15–5:00',
    criteria: [
      {
        key: 'd5', code: 'D5', name: 'Clear pitch', weight: '10%',
        question: 'Did the team explain it clearly?',
        levels: {
          1: 'Hard to follow, or well over time',
          2: 'Said what it does, not why',
          3: 'Clear problem, users and solution',
          4: 'Clear and convincing, with facts or examples',
        },
      },
    ],
  },
]

/** All nine criteria in the order judges see them. */
export const ALL_CRITERIA: Criterion[] = SEGMENTS.flatMap((s) => s.criteria)
