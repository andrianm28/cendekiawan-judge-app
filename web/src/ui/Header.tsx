import type { ReactNode } from 'react'

/**
 * Navy brand header used on every screen, laid out like the Grand Final key visuals:
 * AWS CendekiAwan on the left, Elitery and AWS on the right.
 */
export function Header({ children, hero }: { children?: ReactNode; hero?: ReactNode }) {
  return (
    <header className="header">
      <div className="brand">
        <img src="/brand/cendekiawan-white.png" alt="AWS CendekiAwan" className="logo-cendekiawan" />
        <span className="partners">
          <img src="/brand/elitery-white.png" alt="Elitery" className="logo-elitery" />
          <img src="/brand/aws-white.png" alt="AWS" className="logo-aws" />
        </span>
      </div>
      {hero}
      {children && <div className="header-row">{children}</div>}
    </header>
  )
}
