// Five judges; each scores every team and owns one category for tie-breaks
// (list confirmed by the committee on 15 Oct 2026; group 1 changed 18 Oct, group 3 on 19 Oct;
// full names from the committee rundown, 19 Oct).
export interface Judge {
  id: string
  group: number
  name: string
  /** Role and organisation, shown on the judge's tablet so tablets are not swapped. */
  title?: string
}

export const JUDGES: Judge[] = [
  { id: 'g1', group: 1, name: 'Mr. Mohamad Afiif Mohd Kameel', title: 'AWS' },
  { id: 'g2', group: 2, name: 'Mr. Kresna Adiprawira', title: 'President Director, Elitery' },
  { id: 'g3', group: 3, name: 'Mr. Haikal Rashidi', title: 'AWS' },
  { id: 'g4', group: 4, name: 'Mr. Aizek Zulkifli', title: 'AWS' },
  { id: 'g5', group: 5, name: 'Mr. Mohd Ruslan Wagiman', title: 'IlokenElitery' },
]
