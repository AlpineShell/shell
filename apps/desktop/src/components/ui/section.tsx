export default function Section({ title, subtitle, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-ink-primary">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-ink-quiet">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}
