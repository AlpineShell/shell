export default function RidgeAnnouncer({ message }: RidgeAnnouncerProps) {
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {message}
    </p>
  )
}
