'use client'

import { useEffect, useRef } from 'react'

export function Confetti({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight

    const colors = ['#7B6EF6', '#F472B6', '#34D399', '#FBBF24', '#60A5FA', '#F87171']
    const particles = Array.from({ length: 80 }, () => ({
      x:  Math.random() * canvas.width,
      y: -20 - Math.random() * 100,
      vx: (Math.random() - 0.5) * 4,
      vy:  2 + Math.random() * 4,
      rot: Math.random() * 360,
      rotV: (Math.random() - 0.5) * 8,
      w:   6 + Math.random() * 8,
      h:   3 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: 1,
    }))

    let frame = 0
    let raf: number

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let alive = 0
      for (const p of particles) {
        p.x   += p.vx
        p.y   += p.vy
        p.rot += p.rotV
        p.vy  += 0.08
        if (frame > 60) p.opacity -= 0.018
        if (p.opacity <= 0 || p.y > canvas.height + 20) continue
        alive++
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rot * Math.PI) / 180)
        ctx.globalAlpha = Math.max(0, p.opacity)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      }
      frame++
      if (alive > 0) {
        raf = requestAnimationFrame(draw)
      } else {
        onDone()
      }
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[200] pointer-events-none"
    />
  )
}
