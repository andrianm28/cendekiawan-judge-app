import type { ReactNode } from 'react'

/** Navy brand header used on every screen: logos on top, the screen's own row below. */
export function Header({ children, hero }: { children?: ReactNode; hero?: ReactNode }) {
  return (
    <header className="header">
      <div className="brand">
        <img src="/brand/cendekiawan-white.png" alt="AWS CendekiAwan" className="logo-cendekiawan" />
        <img src="/brand/elitery-white.png" alt="Elitery" className="logo-elitery" />
      </div>
      {hero}
      {children && <div className="header-row">{children}</div>}
    </header>
  )
}
