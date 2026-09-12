const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
}

export default function Avatar({ src, alt, fallback, size = 'md' }: AvatarProps) {
  if (src) {
    return <img src={src} alt={alt} draggable={false} className={`shrink-0 rounded-field object-contain ${SIZE_CLASSES[size]}`} />
  }
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-field bg-surface-3 text-ink-faint ${SIZE_CLASSES[size]}`}>
      {fallback}
    </div>
  )
}
