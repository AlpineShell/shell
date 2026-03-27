import { createContext, useContext } from "react";

interface ThemeValue {
    darkText: boolean;
    bg: string;
}

const ThemeContext = createContext<ThemeValue>({ darkText: false, bg: "rgb(31,32,32)" });

export function useDarkText() {
    return useContext(ThemeContext).darkText;
}

export function useTopbarBg() {
    return useContext(ThemeContext).bg;
}

export const ThemeProvider = ThemeContext.Provider;
