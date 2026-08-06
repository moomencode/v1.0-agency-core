import React, { createContext, useContext, useEffect, useState } from 'react'
import { readStoredTheme, writeStoredTheme, defaultTheme } from '../core/theme'

const ThemeContext = createContext()

/**
 * ThemeProvider
 * Wraps the app, stores the current theme ('dark' | 'light') in state,
 * syncs it to localStorage, and toggles the "light" class on <html>
 * (CSS custom properties in index.css react to that class).
 * Theme behavior is config-driven via config/theme.json (defaultMode).
 */
export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => {
        if (typeof window === 'undefined') return defaultTheme()
        return readStoredTheme()
    })

    useEffect(() => {
        const root = document.documentElement
        if (theme === 'light') {
            root.classList.add('light')
            root.classList.remove('dark')
        } else {
            root.classList.remove('light')
            root.classList.add('dark')
        }
        writeStoredTheme(theme)
    }, [theme])

    const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    return useContext(ThemeContext)
}
