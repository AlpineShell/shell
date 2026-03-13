import { createContext, useContext } from "react";

const TopBarThemeContext = createContext(false);

export function useTopBarDarkText() {
    return useContext(TopBarThemeContext);
}

export const TopBarThemeProvider = TopBarThemeContext.Provider;
