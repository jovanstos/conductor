import { create } from 'zustand'

export type LoopSlot = 'worker' | 'reviewer'

interface DragStore {
  dropTarget: { loopId: string; slot: LoopSlot } | null
  setDropTarget: (t: { loopId: string; slot: LoopSlot } | null) => void
}

export const useDragStore = create<DragStore>()((set) => ({
  dropTarget: null,
  setDropTarget: (t) => set({ dropTarget: t }),
}))
