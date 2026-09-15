const DB_NAME = 'bauda'
const STORE = 'state'
const KEY = 'save'
const MIRROR = 'bauda:save'

export const SAVE_VERSION = 1

export interface SaveData {
  v: number
  t: number
  tier: number
  phosphor: number
  seed: number
  rngState: number
  buildings: { defId: string; x: number; z: number; rot: number }[]
  cash: number
}

/**
 * IndexedDB primary with a localStorage mirror, plus manual export. iOS can
 * evict storage after long inactivity, so the export is not optional
 * (features.md section 13).
 */
function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function save(data: SaveData): Promise<void> {
  const json = JSON.stringify(data)
  try {
    localStorage.setItem(MIRROR, json)
  } catch {
    /* quota or private mode: the IndexedDB write below is still attempted */
  }
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(json, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
  db.close()
}

export async function load(): Promise<SaveData | null> {
  const db = await openDb()
  if (db) {
    const json = await new Promise<string | null>((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve((req.result as string) ?? null)
      req.onerror = () => resolve(null)
    })
    db.close()
    const parsed = parse(json)
    if (parsed) return parsed
  }
  try {
    return parse(localStorage.getItem(MIRROR))
  } catch {
    return null
  }
}

function parse(json: string | null): SaveData | null {
  if (!json) return null
  try {
    const d = JSON.parse(json) as SaveData
    return migrate(d)
  } catch {
    return null
  }
}

/** Versioned schema with forward migrations, in place from day one. */
function migrate(d: SaveData): SaveData | null {
  if (typeof d?.v !== 'number') return null
  if (d.v > SAVE_VERSION) return null
  return d
}

export function exportSave(d: SaveData): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(d))))
}

export function importSave(blob: string): SaveData | null {
  try {
    return migrate(JSON.parse(decodeURIComponent(escape(atob(blob.trim())))))
  } catch {
    return null
  }
}
