function rgbToOklab(r, g, b) {
  const lr = (r / 255) ** 2.2
  const lg = (g / 255) ** 2.2
  const lb = (b / 255) ** 2.2
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ]
}

function oklabToRgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  return [
    Math.max(0, Math.min(255, Math.round((Math.max(0, lr) ** (1 / 2.2)) * 255))),
    Math.max(0, Math.min(255, Math.round((Math.max(0, lg) ** (1 / 2.2)) * 255))),
    Math.max(0, Math.min(255, Math.round((Math.max(0, lb) ** (1 / 2.2)) * 255))),
  ]
}

module.exports = { rgbToOklab, oklabToRgb }
