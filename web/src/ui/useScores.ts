import { useCallback, useEffect, useState } from 'react'
import { ScoreStore, type ScoreRecord } from '../storage/scoreStore'

let storePromise: Promise<ScoreStore> | undefined
export const getStore = () => (storePromise ??= ScoreStore.open())

/** All score records on this device, refreshed after every save. */
export function useScores() {
  const [records, setRecords] = useState<ScoreRecord[]>([])
  /** The tablet's records have been read at least once. */
  const [loaded, setLoaded] = useState(false)
  const refresh = useCallback(async () => {
    setRecords(await (await getStore()).listAll())
    setLoaded(true)
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])
  const save = useCallback(
    async (...args: Parameters<ScoreStore['save']>) => {
      const r = await (await getStore()).save(...args)
      await refresh()
      return r
    },
    [refresh],
  )
  return { records, loaded, save, refresh }
}
