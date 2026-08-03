import { useEffect } from 'react'

/**
 * Ported from the original prototype's `[data-reveal]` IntersectionObserver
 * set up once per page in componentDidMount. Scoped to one section's own
 * subtree instead of the whole document, since sections are now independent
 * components — each section observes only its own [data-reveal] elements,
 * which produces the same one-shot fade-in-on-scroll behaviour per element.
 */
export function useScrollReveal(containerRef: { current: HTMLElement | null }, threshold: number): void {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const elements = container.querySelectorAll<HTMLElement>('[data-reveal]')
    if (!elements.length) return

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('rv-in')
          observer.unobserve(entry.target)
        }
      }
    }, { threshold })

    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [containerRef, threshold])
}
