export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => { /* offline support is an enhancement, not a requirement */ })
  })
}

/**
 * iOS evicts storage for apps left unused for long stretches. Requesting
 * persistence is best effort and may be refused, which is exactly why the
 * manual save export exists.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist()
  } catch { /* not supported */ }
  return false
}
