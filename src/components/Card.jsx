import React from 'react'
import { useTheme } from '../Context/ThemeContext'

/**
 * Card.jsx
 * Reusable category/promo card: background image, gradient overlay,
 * optional badge, title, subtitle and an active state with a primary
 * underline. Renders only the data it receives — no hardcoded content.
 */
export default function CategoryCard({
  image,
  title,
  subtitle,
  badge,
  active = false,
  onClick,
  className = '',
}) {
  const { theme } = useTheme()

  return (
    <div
      onClick={onClick}
      className={`group relative rounded-xl overflow-hidden cursor-pointer w-full transition-all duration-500 ease-premium select-none border flex flex-col justify-end min-h-[140px] md:min-h-[160px] p-4 bg-surface ${
          active
            ? 'border-primary shadow-[0_0_20px_rgb(var(--c-primary)/0.25)] ring-1 ring-primary/40 scale-[1.02]'
            : 'border-ink/10 hover:border-primary/40 hover:shadow-elevated hover:-translate-y-0.5'
        } ${className}`}
    >
      {/* 1. Background image */}
      {image ? (
        <img
          src={image}
          alt={title}
          loading="lazy"
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 ease-premium group-hover:scale-110 ${
            active
              ? 'opacity-85'
              : 'opacity-70 group-hover:opacity-90'
          }`}
        />
      ) : (
        <div className="absolute inset-0 bg-base-deep" />
      )}

      {/* 2. Dark gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent group-hover:from-black/50 transition-opacity duration-300 z-10" />

      {/* 3. Top badge */}
      {badge && (
        <span className="absolute top-3 right-3 z-20 bg-primary text-base-deep text-[10px] font-bold px-2 py-0.5 rounded-md shadow-md uppercase tracking-wider">
          {badge}
        </span>
      )}

      {/* 4. Text layer */}
      <div className="relative z-20 text-left">
        {title && (
          <h3
            className={`font-serif font-bold text-sm md:text-base leading-tight transition-colors duration-300 line-clamp-2 ${
              active
                ? 'text-primary'
                : 'text-ink group-hover:text-primary'
            }`}
          >
            {title}
          </h3>
        )}

        {subtitle && (
          <p className="text-white/80 text-[11px] font-sans mt-1 tracking-widest uppercase font-medium">
            {subtitle}
          </p>
        )}
      </div>

      {/* 5. Primary underline */}
      <div
        className={`absolute bottom-0 left-0 right-0 h-1 bg-primary z-20 transition-all duration-300 ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  )
}
