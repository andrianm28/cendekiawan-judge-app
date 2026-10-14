// Live-demo rubric for the Grand Final: the ToT UM rubric with the same weights and
// 1–4 scale; descriptors reworded from "PartyRock app / video" to "pitch / live demo".

import type { CriterionKey, Level } from './scoring'

export interface Criterion {
  key: CriterionKey
  code: string
  name: string
  weight: string
  levels: Record<Level, string>
}

export const LEVEL_NAMES: Record<Level, string> = {
  1: 'Weak',
  2: 'Acceptable',
  3: 'Strong',
  4: 'Exceptional',
}

export const SOLUTION: Criterion[] = [
  {
    key: 'd1', code: 'D1', name: 'Problem Relevance & Impact', weight: '20%',
    levels: {
      1: 'No real problem named; generic "AI helps with X" framing',
      2: 'A problem is named, but no specific user or setting',
      3: 'Specific user and setting; the pain is evident from the app',
      4: 'Named user segment + measurable gap + why it matters now',
    },
  },
  {
    key: 'd2', code: 'D2', name: 'Functionality & UX', weight: '20%',
    levels: {
      1: 'Does not run, or output unrelated to what was asked',
      2: 'Runs, but output is inconsistent or the flow confuses',
      3: 'Bedrock app runs reliably; flow is logical end to end',
      4: 'Runs reliably and needs no explanation at all to use',
    },
  },
  {
    key: 'd3', code: 'D3', name: 'Creativity & Innovation', weight: '20%',
    levels: {
      1: 'A tutorial or template with the names changed',
      2: 'Common pattern (chatbot, summariser) done competently',
      3: 'A familiar pattern applied to an unexpected domain',
      4: 'Framing or combination not seen elsewhere in the cohort',
    },
  },
  {
    key: 'd4', code: 'D4', name: 'Real-World Application', weight: '20%',
    levels: {
      1: 'Classroom exercise only; no plausible user outside it',
      2: 'Would serve one class or one small group',
      3: 'Usable by a real institution or community as built',
      4: 'Clear path to sector, state, or national scale',
    },
  },
  {
    key: 'd5', code: 'D5', name: 'Presentation (pitch)', weight: '20%',
    levels: {
      1: 'No clear message; problem and solution not stated',
      2: 'Says what it does, not who it is for or why',
      3: 'Problem, user and solution all stated clearly',
      4: 'Adds evidence: data, a quote, or a named context',
    },
  },
]

export const DEMO: Criterion[] = [
  {
    key: 'v1', code: 'V1', name: 'Real-World Impact', weight: '35%',
    levels: {
      1: 'Features are shown; no user and no situation',
      2: 'A use case is described but never demonstrated',
      3: 'A real scenario is walked through live',
      4: 'Scenario shown, plus who benefits and by how much',
    },
  },
  {
    key: 'v2', code: 'V2', name: 'Ease of Use', weight: '25%',
    levels: {
      1: 'Cannot tell from the demo how the app is operated',
      2: 'Operation is shown but needs narration to follow',
      3: 'A first-time user could repeat what is shown',
      4: 'Obvious without narration; no instruction needed',
    },
  },
  {
    key: 'v3', code: 'V3', name: 'Reliability', weight: '20%',
    levels: {
      1: 'No output shown, or the output visibly fails',
      2: 'One successful run; no variation attempted',
      3: 'Several inputs shown producing sensible output',
      4: 'An awkward or edge input is shown and handled well',
    },
  },
  {
    key: 'v4', code: 'V4', name: 'Scalability', weight: '20%',
    levels: {
      1: 'No mention of any use beyond the demo itself',
      2: 'Claims it "could scale" with no reasoning given',
      3: 'Names who else would use it and what would change',
      4: 'Addresses cost, data, or volume (e.g. AWS architecture) concretely',
    },
  },
]
