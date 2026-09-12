import PageTitle from './pageTitle'

export default function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <PageTitle title={title} subtitle={subtitle} />
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  )
}
