// One judge per category group (rundown UM, "Judges" column). Groups 3 and 4 have
// no name yet; the operator fills them in on the morning of the event.
export interface Judge {
  id: string
  group: number
  name: string
}

export const JUDGES: Judge[] = [
  { id: 'g1', group: 1, name: 'Mba Yashinta' },
  { id: 'g2', group: 2, name: 'Pak Kresna' },
  { id: 'g3', group: 3, name: 'Judge Group 3' },
  { id: 'g4', group: 4, name: 'Judge Group 4' },
  { id: 'g5', group: 5, name: 'Pak Ruslan' },
]
