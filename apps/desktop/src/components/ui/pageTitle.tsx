export default function PageTitle({ title, subtitle }: PageTitleProps) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-display text-2xl font-normal tracking-tight text-ink-primary">{title}</h1>
      {subtitle && <p className="text-sm text-ink-quiet">{subtitle}</p>}
    </div>
  )
}
