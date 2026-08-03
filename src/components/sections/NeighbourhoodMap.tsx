import { useEffect, useRef } from 'react'
import type { MouseEvent, PointerEvent } from 'react'
import { useEnergyStore } from '../../store/useEnergyStore'
import { startNeighbourhoodMap } from './canvas/neighbourhoodMapCanvas'
import { prefersReducedMotion } from '../../utils/prefersReducedMotion'
import './NeighbourhoodMap.css'

function NeighbourhoodMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pickRef = useRef<(x: number, y: number) => number>(() => -1)
  const selectHouse = useEnergyStore((state) => state.selectHouse)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const handle = startNeighbourhoodMap(canvas, { reducedMotion: prefersReducedMotion() })
    pickRef.current = handle.pick
    const observer = new IntersectionObserver(
      ([entry]) => handle.setPaused(!entry.isIntersecting),
      { threshold: 0 },
    )
    observer.observe(canvas)
    return () => {
      handle.stop()
      observer.disconnect()
    }
  }, [])

  function handleClick(event: MouseEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const index = pickRef.current(event.clientX - rect.left, event.clientY - rect.top)
    if (index >= 0) selectHouse(index)
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const index = pickRef.current(event.clientX - rect.left, event.clientY - rect.top)
    event.currentTarget.style.cursor = index >= 0 ? 'pointer' : 'default'
  }

  return (
    <div data-reveal className="map-block">
      <div className="map-header">
        <h2 className="serif map-title">
          The neighbourhood <span className="map-title-sub">· live energy map</span>
        </h2>
        <div className="map-legend">
          <span className="mono map-legend-item">
            <span className="map-legend-ring map-legend-ring-sun" />
            SURPLUS · FULLER RING = MORE GIVEN
          </span>
          <span className="mono map-legend-item">
            <span className="map-legend-ring map-legend-ring-settle" />
            DRAWING FROM THE STREET
          </span>
        </div>
      </div>
      <div className="map-frame">
        <canvas ref={canvasRef} onClick={handleClick} onPointerMove={handlePointerMove} className="map-canvas" />
        <div className="mono map-caption">NOLAMBUR MICROGRID · SITE PLAN · CLICK A HOUSE FOR ITS DOSSIER</div>
      </div>
    </div>
  )
}

export default NeighbourhoodMap
