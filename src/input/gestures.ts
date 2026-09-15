export interface Pt { x: number; y: number }

export interface GestureHandlers {
  onTap?(p: Pt): void
  onDragStart?(p: Pt): void
  onDragMove?(p: Pt, delta: Pt): void
  onDragEnd?(p: Pt): void
  onPinch?(scale: number, twist: number): void
  onPinchEnd?(): void
}

const TAP_SLOP = 10
const TAP_MS = 400

/**
 * Pointer Events cover mouse and touch with one path. Two-finger pinch gives
 * zoom and twist; a single pointer is a tap or a drag depending on slop.
 */
export class Gestures {
  private pointers = new Map<number, Pt>()
  private start: Pt = { x: 0, y: 0 }
  private last: Pt = { x: 0, y: 0 }
  private startTime = 0
  private dragging = false
  private pinching = false
  private pinchDist = 0
  private pinchAngle = 0

  constructor(private el: HTMLElement, private h: GestureHandlers) {
    el.style.touchAction = 'none'
    el.addEventListener('pointerdown', this.down)
    el.addEventListener('pointermove', this.move)
    el.addEventListener('pointerup', this.up)
    el.addEventListener('pointercancel', this.up)
    el.addEventListener('pointerleave', this.up)
    el.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  private local(e: PointerEvent): Pt {
    const r = this.el.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  private down = (e: PointerEvent) => {
    this.el.setPointerCapture(e.pointerId)
    const p = this.local(e)
    this.pointers.set(e.pointerId, p)
    if (this.pointers.size === 1) {
      this.start = p
      this.last = p
      this.startTime = performance.now()
      this.dragging = false
    } else if (this.pointers.size === 2) {
      if (this.dragging) this.h.onDragEnd?.(this.last)
      this.dragging = false
      this.pinching = true
      const [a, b] = [...this.pointers.values()]
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      this.pinchAngle = Math.atan2(b.y - a.y, b.x - a.x)
    }
  }

  private move = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return
    const p = this.local(e)
    this.pointers.set(e.pointerId, p)

    if (this.pinching && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const ang = Math.atan2(b.y - a.y, b.x - a.x)
      let twist = ang - this.pinchAngle
      while (twist > Math.PI) twist -= Math.PI * 2
      while (twist < -Math.PI) twist += Math.PI * 2
      this.h.onPinch?.(d / this.pinchDist, twist)
      this.pinchDist = d
      this.pinchAngle = ang
      return
    }

    if (this.pointers.size !== 1) return
    if (!this.dragging && Math.hypot(p.x - this.start.x, p.y - this.start.y) > TAP_SLOP) {
      this.dragging = true
      this.h.onDragStart?.(this.start)
    }
    if (this.dragging) {
      this.h.onDragMove?.(p, { x: p.x - this.last.x, y: p.y - this.last.y })
    }
    this.last = p
  }

  private up = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return
    const p = this.pointers.get(e.pointerId)!
    this.pointers.delete(e.pointerId)

    if (this.pinching) {
      if (this.pointers.size < 2) {
        this.pinching = false
        this.h.onPinchEnd?.()
      }
      return
    }
    if (this.dragging) {
      this.dragging = false
      this.h.onDragEnd?.(p)
    } else if (performance.now() - this.startTime < TAP_MS) {
      this.h.onTap?.(p)
    }
  }
}
