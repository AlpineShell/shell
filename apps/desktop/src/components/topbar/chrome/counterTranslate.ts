export function counterTranslate(translate: string | null | undefined): string {
    const [x = 0, y = 0] = (translate ?? "").trim().split(/\s+/).filter(Boolean).map((part) => parseFloat(part) || 0);
    return `${-x || 0}px ${-y || 0}px`;
}
