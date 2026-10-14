import { createContext, useContext } from "react";

const RidgeBackdropContext = createContext<HTMLElement | null>(null);

export const RidgeBackdropProvider = RidgeBackdropContext.Provider;

export function useRidgeBackdrop() {
    return useContext(RidgeBackdropContext);
}
