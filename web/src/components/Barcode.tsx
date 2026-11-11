import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import { QRCodeSVG } from 'qrcode.react'

export function Barcode({
  value,
  format = 'CODE128',
  height = 42,
  displayValue = true,
  width = 1.6,
  className,
}: {
  value: string
  format?: string
  height?: number
  displayValue?: boolean
  width?: number
  className?: string
}) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!ref.current || !value) return
    try {
      JsBarcode(ref.current, value, {
        format,
        height,
        width,
        displayValue,
        margin: 2,
        fontSize: 11,
        font: 'monospace',
        lineColor: '#0f172a',
        background: 'transparent',
      })
    } catch {
      // Unsupported value for the chosen symbology; leave the SVG empty.
    }
  }, [value, format, height, displayValue, width])
  return <svg ref={ref} className={className} />
}

export function QrCode({
  value,
  size = 64,
  className,
}: {
  value: string
  size?: number
  className?: string
}) {
  return (
    <QRCodeSVG
      value={value}
      size={size}
      level="M"
      bgColor="transparent"
      fgColor="#0f172a"
      className={className}
    />
  )
}
