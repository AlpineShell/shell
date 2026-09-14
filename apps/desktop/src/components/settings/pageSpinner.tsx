import { Spinner } from '@alpine/ui'

export default function PageSpinner({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex justify-center py-16">
      <Spinner size={20} />
    </div>
  )
}
