import { Loader2 } from 'lucide-react'

export default function Spinner({ size = 14 }: SpinnerProps) {
  return <Loader2 size={size} className="shrink-0 animate-spin" />
}
