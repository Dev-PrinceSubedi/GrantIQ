'use client'
import { useState, useEffect } from 'react'

export function useBreakpoint() {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const update = () => setWidth(window.innerWidth)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  const isMobile  = width > 0 && width < 768
  const isTablet  = width >= 768 && width < 1100
  const isDesktop = width >= 1100
  return { isMobile, isTablet, isDesktop, width }
}
