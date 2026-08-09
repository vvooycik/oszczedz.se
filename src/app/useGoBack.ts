import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router'

/**
 * Closing a screen should return where you came from — unless there is no
 * "came from".
 *
 * A PWA opened straight onto /add or /tx/:id (a deep link, a shortcut, a
 * refresh) has that route as its first history entry, and navigate(-1) would
 * either leave the app or bounce back onto the same screen. React Router marks
 * that first entry with key 'default', which is the reliable way to tell.
 */
export function useGoBack(fallback = '/') {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(() => {
    if (location.key === 'default') navigate(fallback, { replace: true })
    else navigate(-1)
  }, [navigate, location.key, fallback])
}
