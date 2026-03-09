import type { PriceStatRow } from '../lib/queries'

interface PriceStatsTableProps {
  data: PriceStatRow[]
}

function fmt(val: number, type: string) {
  if (type === 'for_rent') {
    if (val >= 1_000) return `EGP ${(val / 1_000).toFixed(0)}K/mo`
    return `EGP ${val.toLocaleString()}/mo`
  }
  if (val >= 1_000_000) return `EGP ${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `EGP ${(val / 1_000).toFixed(0)}K`
  return `EGP ${val.toLocaleString()}`
}

export default function PriceStatsTable({ data }: PriceStatsTableProps) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">
        Price Statistics
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-2 pr-4 text-gray-400 font-medium">
                Type
              </th>
              <th className="text-right py-2 px-2 text-gray-400 font-medium">
                Count
              </th>
              <th className="text-right py-2 px-2 text-gray-400 font-medium">
                Median
              </th>
              <th className="text-right py-2 px-2 text-gray-400 font-medium">
                Mean
              </th>
              <th className="text-right py-2 px-2 text-gray-400 font-medium">
                Min
              </th>
              <th className="text-right py-2 pl-2 text-gray-400 font-medium">
                Max
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={row.listing_type}
                className="border-b border-slate-700/50 hover:bg-slate-700/20"
              >
                <td className="py-3 pr-4">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                      row.listing_type === 'for_sale'
                        ? 'bg-blue-500/20 text-blue-300'
                        : 'bg-orange-500/20 text-orange-300'
                    }`}
                  >
                    {row.listing_type === 'for_sale' ? 'For Sale' : 'For Rent'}
                  </span>
                </td>
                <td className="text-right py-3 px-2 text-gray-300">
                  {row.count.toLocaleString()}
                </td>
                <td className="text-right py-3 px-2 text-white font-medium">
                  {fmt(row.median_price, row.listing_type)}
                </td>
                <td className="text-right py-3 px-2 text-gray-300">
                  {fmt(row.mean_price, row.listing_type)}
                </td>
                <td className="text-right py-3 px-2 text-gray-400">
                  {fmt(row.min_price, row.listing_type)}
                </td>
                <td className="text-right py-3 pl-2 text-gray-400">
                  {fmt(row.max_price, row.listing_type)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
