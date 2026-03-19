import { createContext, useContext } from "react";

const ThemeContext = createContext(false);

export function useDarkText() {
    return useContext(ThemeContext);
}

export const ThemeProvider = ThemeContext.Provider;
