import qrcode from 'qrcode-generator'

/** Black-on-white QR code drawn as one SVG path, with the standard 4-module quiet zone. */
export function QrCode({ value, className }: { value: string; className?: string }) {
  const qr = qrcode(0, 'M')
  qr.addData(value)
  qr.make()
  const n = qr.getModuleCount()
  const quiet = 4
  let d = ''
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`
  }
  const size = n + quiet * 2
  return (
    <svg className={className} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`QR code: ${value}`} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  )
}
