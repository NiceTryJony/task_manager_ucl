export function SkeletonList() {
  return (
    <div className="space-y-3 mt-2">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="card p-4 flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl skeleton flex-shrink-0" />
          <div className="flex-1 space-y-2.5">
            <div className="h-4 skeleton rounded-lg w-3/4" />
            <div className="h-3 skeleton rounded-lg w-1/3" />
            <div className="h-1.5 skeleton rounded-full w-full mt-2" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {[...Array(lines)].map((_, i) => (
        <div
          key={i}
          className="h-3.5 skeleton rounded-lg"
          style={{ width: `${100 - (i * 15)}%` }}
        />
      ))}
    </div>
  )
}
