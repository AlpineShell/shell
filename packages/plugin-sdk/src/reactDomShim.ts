import { getHost } from './host'

const reactDom = getHost().reactDom
if (!reactDom) throw new Error('[alpine-plugin-sdk] react-dom requires Alpine Shell runtime v3')

const dom = reactDom as typeof import('react-dom')

export const createPortal = dom.createPortal
export const flushSync = dom.flushSync
export const version = dom.version
export default dom
