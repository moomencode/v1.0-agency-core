import React from 'react'
import { icon } from '../core/icons'

/**
 * Button.jsx
 * Reusable CTA button with two visual variants matching the site theme:
 *  - "primary": solid primary background (main CTAs)
 *  - "outline": transparent with ink border (secondary CTAs)
 *
 * Props:
 *  - children: button label/content
 *  - variant: "primary" | "outline"
 *  - icon: Lucide icon component OR config icon name (e.g. "shopping-bag")
 *  - onClick: click handler
 *  - href: renders as <a> when provided
 *  - className: optional extra classes
 */
export default function Button({
  children,
  variant = 'primary',
  icon: Icon,
  onClick,
  href,
  className = '',
  ...rest
}) {
  const IconComponent = typeof Icon === 'string' ? icon(Icon) : Icon

  const base =
    'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md text-sm font-semibold tracking-wide transition-all duration-500 ease-premium whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base'

  const variants = {
    primary:
      'bg-primary text-base hover:bg-primary-light hover:shadow-primary active:scale-[0.97]',
    outline:
      'border border-ink/40 text-ink hover:border-primary hover:text-primary hover:shadow-primary/20 active:scale-[0.97]',
  }

  const classes = `${base} ${variants[variant] || variants.primary} ${className}`

  if (href) {
    return (
      <a href={href} className={classes} {...rest}>
        {IconComponent && <IconComponent size={16} />}
        {children}
      </a>
    )
  }

  return (
    <button onClick={onClick} className={classes} {...rest}>
      {IconComponent && <IconComponent size={16} />}
      {children}
    </button>
  )
}
