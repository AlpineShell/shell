import { useImperativeHandle, type Ref } from 'react'
import { useAnimation } from 'motion/react'

export function useIconAnimation(ref: Ref<AnimatedIconHandle> | undefined) {
  const controls = useAnimation()

  useImperativeHandle(ref, () => ({
    startAnimation: () => {
      controls.set('normal')
      controls.start('animate')
    },
  }), [controls])

  return controls
}
