import React, { memo } from 'react'

const STATUS_COLORS: Record<string, string> = {
  working: 'rgb(74, 194, 100)',
  not_working: 'rgb(200, 30, 30)',
  unknown: 'rgb(166, 166, 166)'
}

export const libraryGridIconCss = `
.protondb-grid-host { display: contents; }
.protondb-grid-dot {
  width: 20px;
  height: 20px;
  padding: 2px;
  border-radius: 20px;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  opacity: 1;
}
.protondb-grid-dot--bl { flex-shrink: 0; }
.protondb-grid-dot--tl { position: absolute; top: 4px; left: 4px; }
.protondb-grid-dot--tr { position: absolute; top: 4px; right: 4px; }
.protondb-grid-dot--focus-only { opacity: 0; }
.WYgDg9NyCcMIVuMyZ_NBC.gpfocus .protondb-grid-dot--focus-only,
._1pwP4eeP1zQD7PEgmsep0W.gpfocuswithin .protondb-grid-dot--focus-only,
._1pwP4eeP1zQD7PEgmsep0W:focus-within .protondb-grid-dot--focus-only,
._1pwP4eeP1zQD7PEgmsep0W:hover .protondb-grid-dot--focus-only {
  opacity: 1;
  transition: opacity 0.6s cubic-bezier(0,0.73,0.48,1);
}
`

export default memo(function LibraryGridIcon({
  appId,
  status,
  position,
  focusOnly
}: {
  appId: string
  status?: string
  position: 'bl' | 'tl' | 'tr'
  focusOnly: boolean
}) {
  if (!status) return null
  const color = STATUS_COLORS[status] || STATUS_COLORS.unknown
  return (
    <div
      className={`protondb-grid-dot protondb-grid-dot--${position}${focusOnly ? ' protondb-grid-dot--focus-only' : ''}`}
      data-appid={appId}
      data-status={status}
      aria-hidden="true"
    >
      <svg viewBox="0 0 512 512" width="16" height="16">
        <circle cx="256" cy="256" r="36" fill={color} />
        <ellipse
          cx="256"
          cy="256"
          rx="220"
          ry="88"
          fill="none"
          stroke={color}
          strokeWidth="28"
        />
        <ellipse
          cx="256"
          cy="256"
          rx="220"
          ry="88"
          fill="none"
          stroke={color}
          strokeWidth="28"
          transform="rotate(60 256 256)"
        />
        <ellipse
          cx="256"
          cy="256"
          rx="220"
          ry="88"
          fill="none"
          stroke={color}
          strokeWidth="28"
          transform="rotate(120 256 256)"
        />
      </svg>
    </div>
  )
})
