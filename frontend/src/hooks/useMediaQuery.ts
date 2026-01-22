import { useEffect, useState } from 'react'

export function useMediaQuery(query: string) {
  const getMatch = () => typeof window !== 'undefined' && window.matchMedia(query).matches
  const [matches, setMatches] = useState<boolean>(getMatch())

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    if (mql.addEventListener) mql.addEventListener('change', onChange)
    else // Safari <14 fallback
      mql.addListener(onChange)
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange)
      else
        mql.removeListener(onChange)
    }
  }, [query])

  return matches
}
