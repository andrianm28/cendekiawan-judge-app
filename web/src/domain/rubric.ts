// Live-demo rubric for the Grand Final: the ToT UM rubric with the same criteria,
// weights and 1–4 scale, in plain words for executive judges who may not be technical.

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

export const SOLUTION: Criterion[] = [
  {
    key: 'd1', code: 'D1', name: 'Real problem', weight: '20%',
    question: 'Does it solve a real problem for real people?',
    levels: {
      1: 'No clear problem',
      2: 'A problem, but unclear who has it',
      3: 'Clear problem and clear users',
      4: 'Clear users, facts on how big the problem is, and why now',
    },
  },
  {
    key: 'd2', code: 'D2', name: 'Works well', weight: '20%',
    question: 'Does the app work and make sense to use?',
    levels: {
      1: 'Did not work',
      2: 'Worked, but with problems',
      3: 'Worked smoothly from start to end',
      4: 'Worked smoothly and needs no explaining at all',
    },
  },
  {
    key: 'd3', code: 'D3', name: 'Fresh idea', weight: '20%',
    question: 'How new or creative is the idea?',
    levels: {
      1: 'A tutorial or template, barely changed',
      2: 'Common idea, done fine',
      3: 'Common idea used in a smart new way',
      4: 'Truly original; I have not seen this before',
    },
  },
  {
    key: 'd4', code: 'D4', name: 'Usable in real life', weight: '20%',
    question: 'Could people really use this outside the competition?',
    levels: {
      1: 'Only a school exercise',
      2: 'Useful for a small group',
      3: 'Ready for a real organisation or community',
      4: 'Could grow to a whole sector or the country',
    },
  },
  {
    key: 'd5', code: 'D5', name: 'Clear pitch', weight: '20%',
    question: 'Did the team explain it clearly?',
    levels: {
      1: 'Hard to follow',
      2: 'Said what it does, not why',
      3: 'Clear problem, users and solution',
      4: 'Clear and convincing, with facts or examples',
    },
  },
]

export const DEMO: Criterion[] = [
  {
    key: 'v1', code: 'V1', name: 'Impact shown', weight: '35%',
    question: 'Did the demo show how it helps real people?',
    levels: {
      1: 'Only features, no real situation',
      2: 'Talked about a use, did not show it',
      3: 'Showed a real situation step by step',
      4: 'Showed it, plus who benefits and how much',
    },
  },
  {
    key: 'v2', code: 'V2', name: 'Easy to use', weight: '25%',
    question: 'Could a new user use it without help?',
    levels: {
      1: 'Could not tell how to use it',
      2: 'Could follow it only because the presenter explained',
      3: 'A new user could follow it',
      4: 'So simple it needs no explaining',
    },
  },
  {
    key: 'v3', code: 'V3', name: 'Reliable', weight: '20%',
    question: 'Did it work well each time they tried it?',
    levels: {
      1: 'Failed or gave no result',
      2: 'Worked, but they only tried it once',
      3: 'Tried with different inputs, all good answers',
      4: 'Also handled a tricky question well',
    },
  },
  {
    key: 'v4', code: 'V4', name: 'Can grow', weight: '20%',
    question: 'Could it serve many more people?',
    levels: {
      1: 'Not mentioned',
      2: 'Said it can grow, no reason given',
      3: 'Named who else would use it',
      4: 'Clear plan to grow (cost, data, users)',
    },
  },
]
