import React from 'react'
import { asset } from '../../core/assets'
import { placeholderImage } from '../../utils/placeholder'

/**
 * Image.jsx
 * Config-driven image: resolves asset keys via the media system and
 * falls back to an inline SVG placeholder (with theme-aware colors)
 * when the source is missing or fails to load.
 */
export default function Image({
  src,
  alt = '',
  fallbackText = '',
  themeBg = '122a20',
  themeFg = 'd4af37',
  className = '',
  ...rest
}) {
  const [failed, setFailed] = React.useState(false)
  const resolved = asset(src)
  const fallback = placeholderImage(600, 600, fallbackText || alt || 'Image', themeBg, themeFg)

  const handleError = () => setFailed(true)

  if (!resolved || failed) {
    return <img src={fallback} alt={alt} className={className} {...rest} />
  }

  return (
    <img
      src={resolved}
      alt={alt}
      className={className}
      onError={handleError}
      {...rest}
    />
  )
}
