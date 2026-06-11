import { createContext, useContext } from "react";

interface ThemeValue {
    darkText: boolean;
    bg: string;
    fullscreenWindow: boolean;
    onMenuOpenChange: (open: boolean, gap?: { left: number; right: number }) => void;
}

const ThemeContext = createContext<ThemeValue>({ darkText: false, bg: "rgb(31,32,32)", fullscreenWindow: false, onMenuOpenChange: () => {} });

export function useDarkText() {
    return useContext(ThemeContext).darkText;
}

export function useTopbarBg() {
    return useContext(ThemeContext).bg;
}

export function useFullscreenWindow() {
    return useContext(ThemeContext).fullscreenWindow;
}

export function useMenuOpenChange() {
    return useContext(ThemeContext).onMenuOpenChange;
}

export const ThemeProvider = ThemeContext.Provider;
