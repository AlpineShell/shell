import { useLayoutEffect, useRef } from "react";

const ENTER_MS = 300;
const EXIT_MS = 280;
const SLIDE_FACTOR = 1.1;

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function readOffset(element: HTMLElement) {
  const match = /translateY\((-?[\d.]+)px\)/.exec(element.style.transform);
  return match ? parseFloat(match[1]) : null;
}

export function useFlyUnderBar(
  bodyRef: React.RefObject<HTMLElement | null>,
  cornerRefs: React.RefObject<HTMLElement | SVGElement | null>[],
  cornerSize: number,
  active: boolean,
  closing: boolean,
  instantEnter = false
) {
  const frameRef = useRef(0);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!active || !body) return;
    const corners = cornerRefs
      .map((ref) => ref.current)
      .filter((element): element is HTMLElement | SVGElement => element !== null);

    const height = body.offsetHeight;
    const distance = height * SLIDE_FACTOR;
    const cornerHold = height - cornerSize;
    const target = closing ? -distance : 0;
    const from = readOffset(body) ?? (closing ? 0 : -distance);
    const duration = closing ? EXIT_MS : ENTER_MS;
    const ease = closing ? easeInOutCubic : easeOutExpo;

    const apply = (bodyOffset: number) => {
      const cornerOffset = Math.min(0, bodyOffset + cornerHold);
      body.style.transform = `translateY(${bodyOffset}px)`;
      for (const corner of corners) corner.style.transform = `translateY(${cornerOffset}px)`;
    };

    if (!closing && instantEnter) {
      apply(0);
      return;
    }

    apply(from);

    let startTime = 0;
    const step = (now: number) => {
      if (!startTime) startTime = now;
      const progress = Math.min(1, (now - startTime) / duration);
      apply(from + (target - from) * ease(progress));
      if (progress < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frameRef.current);
  }, [active, closing]);
}
