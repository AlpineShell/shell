export default function Card({ className, children }: CardProps) {
  return (
    <div className={`rounded-card border border-line-hairline bg-surface-2 ${className ?? ''}`}>
      {children}
    </div>
  )
}
