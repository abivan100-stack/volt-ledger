import './SectionHeading.css'

interface SectionHeadingProps {
  kicker: string
  label: string
}

/** Numbered kicker row (e.g. "01 / The Spread") above a section heading. */
function SectionHeading({ kicker, label }: SectionHeadingProps) {
  return (
    <div data-reveal className="section-heading">
      <span className="mono section-heading-kicker">{kicker}</span>
      <span className="eyebrow">{label}</span>
    </div>
  )
}

export default SectionHeading
