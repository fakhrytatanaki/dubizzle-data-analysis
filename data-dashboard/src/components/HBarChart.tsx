interface HBarChartProps {
  data: { label: string; count: number }[]
  title: string
  color?: string
  formatValue?: (v: number) => string
}

export default function HBarChart({
  data,
  title,
  color = '#22d3ee',
  formatValue,
}: HBarChartProps) {
  const max = Math.max(...data.map((d) => d.count), 1)
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">{title}</h3>
      <div className="space-y-2">
        {data.map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <span
              className="text-xs text-gray-400 w-36 shrink-0 truncate text-right"
              title={row.label}
            >
              {row.label}
            </span>
            <div className="flex-1 bg-slate-700/60 rounded-full h-4 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(row.count / max) * 100}%`,
                  backgroundColor: color,
                }}
              />
            </div>
            <span className="text-xs text-gray-300 w-20 shrink-0">
              {formatValue ? formatValue(row.count) : row.count.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
