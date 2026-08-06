import React from 'react'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../Context/ThemeContext'
import { t } from '../core/i18n'
import { SITE } from '../core/site'

/**
 * ThemeToggle.jsx
 * Small circular button that switches between dark and light mode.
 * Shows a Sun icon while in dark mode (click to go light) and a
 * Moon icon while in light mode (click to go dark).
 */
export default function ThemeToggle({ className = '' }) {
    const { theme, toggleTheme } = useTheme()

    return (
        <button
            onClick={toggleTheme}
            aria-label={t(SITE.i18n?.theme?.aria) || 'Toggle dark/light mode'}
            className={`w-9 h-9 rounded-full border border-ink/20 flex items-center justify-center text-ink-muted hover:text-primary hover:border-primary hover:shadow-primary/20 transition-all duration-500 ease-premium shrink-0 ${className}`}
        >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
    )
}
