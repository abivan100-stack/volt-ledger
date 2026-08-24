import { describe, it, expect, beforeEach } from 'vitest'
import { useTourStore, TOTAL_TOUR_SECONDS } from '../useTourStore'

describe('useTourStore', () => {
  beforeEach(() => {
    useTourStore.getState().stopTour()
  })

  it('initializes with inactive tour', () => {
    const state = useTourStore.getState()
    expect(state.isActive).toBe(false)
    expect(state.currentStepIndex).toBe(0)
    expect(state.totalRemainingSec).toBe(TOTAL_TOUR_SECONDS)
  })

  it('starts and stops tour', () => {
    useTourStore.getState().startTour()
    expect(useTourStore.getState().isActive).toBe(true)
    expect(useTourStore.getState().currentStepIndex).toBe(0)

    useTourStore.getState().stopTour()
    expect(useTourStore.getState().isActive).toBe(false)
  })

  it('navigates through steps with nextStep and prevStep', () => {
    useTourStore.getState().startTour()
    useTourStore.getState().nextStep()
    expect(useTourStore.getState().currentStepIndex).toBe(1)

    useTourStore.getState().prevStep()
    expect(useTourStore.getState().currentStepIndex).toBe(0)
  })

  it('jumps directly to a specific step with goToStep', () => {
    useTourStore.getState().startTour()
    useTourStore.getState().goToStep(3)
    expect(useTourStore.getState().currentStepIndex).toBe(3)
  })

  it('ticks seconds and advances steps automatically', () => {
    useTourStore.getState().startTour()
    useTourStore.setState({ stepRemainingSec: 1, totalRemainingSec: 50, currentStepIndex: 0 })

    useTourStore.getState().tickSecond()
    expect(useTourStore.getState().currentStepIndex).toBe(1)
    expect(useTourStore.getState().totalRemainingSec).toBe(49)
  })

  it('stops tour when total remaining seconds reach zero', () => {
    useTourStore.getState().startTour()
    useTourStore.setState({ totalRemainingSec: 1 })

    useTourStore.getState().tickSecond()
    expect(useTourStore.getState().isActive).toBe(false)
  })
})
