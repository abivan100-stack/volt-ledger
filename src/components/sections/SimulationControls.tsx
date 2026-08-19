import { useEnergyStore } from '../../store/useEnergyStore'
import { SIM_SPEEDS } from '../../store/simSlice'
import './SimulationControls.css'

function SimulationControls() {
  const running = useEnergyStore((state) => state.running)
  const simSpeed = useEnergyStore((state) => state.config.simSpeed)
  const simDay = useEnergyStore((state) => state.simDay)
  const start = useEnergyStore((state) => state.start)
  const stop = useEnergyStore((state) => state.stop)
  const setSimSpeed = useEnergyStore((state) => state.setSimSpeed)
  const resetScenario = useEnergyStore((state) => state.resetScenario)

  return (
    <section data-reveal className="simulation-controls" aria-label="Simulation controls">
      <div className="simulation-controls-summary">
        <div className="eyebrow simulation-controls-label">Simulation controls</div>
        <div className="mono simulation-controls-state" aria-live="polite">
          <span className={`simulation-controls-dot${running ? '' : ' simulation-controls-dot-paused'}`} />
          SIM DAY {String(simDay).padStart(2, '0')} · {running ? 'RUNNING' : 'PAUSED'}
        </div>
      </div>
      <div className="simulation-controls-actions">
        <button
          type="button"
          onClick={running ? stop : start}
          className="mono simulation-controls-primary"
          aria-pressed={running}
        >
          {running ? 'PAUSE SIMULATION' : 'RESUME SIMULATION'}
        </button>
        <div className="simulation-speed" role="group" aria-label="Simulation speed">
          <span className="mono simulation-speed-label">SPEED</span>
          {SIM_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => setSimSpeed(speed)}
              aria-pressed={speed === simSpeed}
              className={`mono simulation-speed-button${speed === simSpeed ? ' simulation-speed-button-active' : ''}`}
            >
              ×{speed}
            </button>
          ))}
        </div>
        <button type="button" onClick={resetScenario} className="mono simulation-controls-reset">
          RESET SCENARIO
        </button>
      </div>
      <p className="simulation-controls-note">
        Reset clears this browser session&apos;s simulated settlements and returns to the selected day type and start hour.
      </p>
    </section>
  )
}

export default SimulationControls
