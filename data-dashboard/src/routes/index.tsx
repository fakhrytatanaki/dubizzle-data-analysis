import { createFileRoute } from '@tanstack/react-router'
import {
  Building2,
  TrendingUp,
  MapPin,
  ImageIcon,
  Layers,
} from 'lucide-react'
import StatCard from '../components/StatCard'
import HBarChart from '../components/HBarChart'
import BedroomChart from '../components/BedroomChart'
import PriceStatsTable from '../components/PriceStatsTable'
import { fetchDashboardData } from '../lib/queries'

export const Route = createFileRoute('/')({
  loader: () => fetchDashboardData(),
  component: Dashboard,
})

function fmtPrice(val: number, isRent = false) {
  if (isRent) {
    if (val >= 1_000) return `EGP ${(val / 1_000).toFixed(0)}K`
    return `EGP ${val.toLocaleString()}`
  }
  if (val >= 1_000_000) return `EGP ${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `EGP ${(val / 1_000).toFixed(0)}K`
  return `EGP ${val.toLocaleString()}`
}

function formatLabel(label: string): string {
  if (label === 'for_sale') return 'For Sale'
  if (label === 'for_rent') return 'For Rent'
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function Dashboard() {
  const data = Route.useLoaderData()

  const cityPriceData = data.cityMedianPrices.map((r) => ({
    label: r.city,
    count: r.median_price,
  }))

  const cityPpsmData = data.cityPricePerSqm.map((r) => ({
    label: r.city,
    count: r.median_price,
  }))

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-12">
      {/* Page header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700/50 px-6 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <Building2 size={28} className="text-cyan-400" />
            <h1 className="text-2xl md:text-3xl font-bold">
              Real Estate Analytics
            </h1>
          </div>
          <p className="text-gray-400 text-sm md:text-base">
            Statistics and insights from Dubizzle Egypt property listings
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-8 space-y-8">
        {/* Overview Stats */}
        <section>
          <h2 className="text-lg font-semibold text-gray-200 mb-4">
            Overview
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard
              title="Total Listings"
              value={data.overview.total}
              color="blue"
              icon={<Layers size={18} />}
            />
            <StatCard
              title="For Sale"
              value={data.overview.forSale}
              color="teal"
              icon={<TrendingUp size={18} />}
            />
            <StatCard
              title="For Rent"
              value={data.overview.forRent}
              color="orange"
              icon={<Building2 size={18} />}
            />
            <StatCard
              title="With Photos"
              value={data.overview.withImages}
              color="purple"
              icon={<ImageIcon size={18} />}
            />
            <StatCard
              title="With Amenities"
              value={data.overview.withAmenities}
              color="green"
              icon={<Layers size={18} />}
            />
            <StatCard
              title="Unique Cities"
              value={data.overview.uniqueCities}
              color="rose"
              icon={<MapPin size={18} />}
            />
          </div>
        </section>

        {/* Price Stats */}
        <section>
          <h2 className="text-lg font-semibold text-gray-200 mb-4">
            Price Statistics
          </h2>
          <PriceStatsTable data={data.priceStats} />
        </section>

        {/* Distribution Charts */}
        <section>
          <h2 className="text-lg font-semibold text-gray-200 mb-4">
            Listing Distribution
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <HBarChart
              title="Listing Type"
              data={data.listingTypes.map((r) => ({
                label: formatLabel(r.label),
                count: r.count,
              }))}
              color="#22d3ee"
            />
            <HBarChart
              title="Ad Tier"
              data={data.adTiers.map((r) => ({
                label: formatLabel(r.label),
                count: r.count,
              }))}
              color="#a78bfa"
            />
            <HBarChart
              title="Seller Type"
              data={data.sellerTypes.map((r) => ({
                label: formatLabel(r.label),
                count: r.count,
              }))}
              color="#34d399"
            />
          </div>
        </section>

        {/* Property Types */}
        <section>
          <h2 className="text-lg font-semibold text-gray-200 mb-4">
            Property Types
          </h2>
          <HBarChart
            title="Property Type Distribution (top 12)"
            data={data.propertyTypes}
            color="#f59e0b"
          />
        </section>

        {/* City Charts */}
        <section>
          <h2 className="text-lg font-semibold text-gray-200 mb-4">
            City Insights
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <HBarChart
              title="Median Sale Price by City (top 12)"
              data={cityPriceData}
              color="#38bdf8"
              formatValue={(v) => fmtPrice(v)}
            />
            <HBarChart
              title="Median Price per m² by City (top 12)"
              data={cityPpsmData}
              color="#f472b6"
              formatValue={(v) => `EGP ${(v / 1_000).toFixed(0)}K`}
            />
          </div>
        </section>

        {/* Bedroom + Amenities */}
        <section>
          <h2 className="text-lg font-semibold text-gray-200 mb-4">
            Property Details
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BedroomChart data={data.bedroomDistribution} />
            <HBarChart
              title="Top 15 Amenities"
              data={data.topAmenities.map((r) => ({
                label: r.amenity,
                count: r.count,
              }))}
              color="#4ade80"
            />
          </div>
        </section>
      </div>
    </div>
  )
}

