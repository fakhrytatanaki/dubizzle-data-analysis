import type { BedroomRow } from '../lib/queries'

interface BedroomChartProps {
  data: BedroomRow[]
}

const SALE_COLOR = '#38bdf8'
const RENT_COLOR = '#fb923c'

export default function BedroomChart({ data }: BedroomChartProps) {
  const max = Math.max(...data.flatMap((d) => [d.for_sale, d.for_rent]), 1)

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">
        Bedroom Count Distribution
      </h3>
      <div className="flex items-end gap-3 h-40">
        {data.map((row) => {
          const saleH = (row.for_sale / max) * 100
          const rentH = (row.for_rent / max) * 100
          return (
            <div key={row.bedrooms} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex items-end gap-0.5 h-32">
                <div
                  className="flex-1 rounded-t-sm transition-all duration-500"
                  style={{ height: `${saleH}%`, backgroundColor: SALE_COLOR }}
                  title={`For Sale: ${row.for_sale}`}
                />
                <div
                  className="flex-1 rounded-t-sm transition-all duration-500"
                  style={{ height: `${rentH}%`, backgroundColor: RENT_COLOR }}
                  title={`For Rent: ${row.for_rent}`}
                />
              </div>
              <span className="text-xs text-gray-400">
                {row.bedrooms === 0 ? 'Studio' : `${row.bedrooms}BR`}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded-sm inline-block"
            style={{ backgroundColor: SALE_COLOR }}
          />
          <span className="text-xs text-gray-400">For Sale</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded-sm inline-block"
            style={{ backgroundColor: RENT_COLOR }}
          />
          <span className="text-xs text-gray-400">For Rent</span>
        </div>
      </div>
    </div>
  )
}
