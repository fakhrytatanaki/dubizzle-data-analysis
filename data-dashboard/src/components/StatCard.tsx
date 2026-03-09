interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  color?: 'blue' | 'green' | 'orange' | 'purple' | 'teal' | 'rose'
  icon?: React.ReactNode
}

const colorMap = {
  blue: 'border-blue-500/40 bg-blue-500/10 text-blue-400',
  green: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  orange: 'border-orange-500/40 bg-orange-500/10 text-orange-400',
  purple: 'border-purple-500/40 bg-purple-500/10 text-purple-400',
  teal: 'border-teal-500/40 bg-teal-500/10 text-teal-400',
  rose: 'border-rose-500/40 bg-rose-500/10 text-rose-400',
}

export default function StatCard({
  title,
  value,
  subtitle,
  color = 'blue',
  icon,
}: StatCardProps) {
  return (
    <div
      className={`rounded-xl border p-5 flex flex-col gap-2 ${colorMap[color]}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-400">{title}</span>
        {icon && <span className="opacity-80">{icon}</span>}
      </div>
      <span className="text-3xl font-bold text-white">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
    </div>
  )
}
