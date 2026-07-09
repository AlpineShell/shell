import { getHost, type AlpineHostStore } from './host'

export interface StoreApi<T> {
  getState: () => T
  getInitialState: () => T
  setState: (partial: T | Partial<T> | ((state: T) => T | Partial<T>), replace?: boolean) => void
  subscribe: (listener: (state: T, prevState: T) => void) => () => void
}

export type StateCreator<T> = (
  set: StoreApi<T>['setState'],
  get: StoreApi<T>['getState'],
  api: StoreApi<T>,
) => T

function requireStore(): AlpineHostStore {
  const store = getHost().store
  if (!store) throw new Error('[alpine-plugin-sdk] store requires Alpine Shell runtime v3')
  return store
}

export function createStore<T>(initializer: StateCreator<T>): StoreApi<T> {
  return requireStore().createStore(initializer) as StoreApi<T>
}

export function useStore<T, U = T>(store: StoreApi<T>, selector?: (state: T) => U): U {
  return requireStore().useStore(store, selector) as U
}

export function useShallow<S, U>(selector: (state: S) => U): (state: S) => U {
  return requireStore().useShallow(selector) as (state: S) => U
}
