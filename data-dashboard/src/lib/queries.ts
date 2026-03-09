import { createServerFn } from '@tanstack/react-start'
import { env as cloudflareEnv } from 'cloudflare:workers'

export interface OverviewStats {
  total: number
  forSale: number
  forRent: number
  withImages: number
  withAmenities: number
  uniqueCities: number
}

export interface CountRow {
  label: string
  count: number
}

export interface PriceStatRow {
  listing_type: string
  count: number
  median_price: number
  mean_price: number
  min_price: number
  max_price: number
}

export interface CityPriceRow {
  city: string
  median_price: number
  count: number
}

export interface BedroomRow {
  bedrooms: number
  for_sale: number
  for_rent: number
}

export interface AmenityRow {
  amenity: string
  count: number
}

export interface DashboardData {
  overview: OverviewStats
  listingTypes: CountRow[]
  adTiers: CountRow[]
  sellerTypes: CountRow[]
  propertyTypes: CountRow[]
  priceStats: PriceStatRow[]
  cityMedianPrices: CityPriceRow[]
  cityPricePerSqm: CityPriceRow[]
  bedroomDistribution: BedroomRow[]
  topAmenities: AmenityRow[]
}

async function getDB(): Promise<D1Database | null> {
  try {
    return (cloudflareEnv as Cloudflare.Env).DB ?? null
  } catch {
    return null
  }
}

export const fetchDashboardData = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DashboardData> => {
    const db = await getDB()

    if (!db) {
      return getMockData()
    }

    try {
      const [
        totalRow,
        forSaleRow,
        forRentRow,
        withImagesRow,
        withAmenitiesRow,
        uniqueCitiesRow,
        listingTypeRows,
        adTierRows,
        sellerTypeRows,
        propertyTypeRows,
        priceStatRows,
        cityPriceRows,
        cityPpsmRows,
        bedroomRows,
        amenityRows,
      ] = await Promise.all([
        db
          .prepare('SELECT COUNT(*) as c FROM listings')
          .first<{ c: number }>(),
        db
          .prepare(
            "SELECT COUNT(*) as c FROM listings WHERE listing_type='for_sale'",
          )
          .first<{ c: number }>(),
        db
          .prepare(
            "SELECT COUNT(*) as c FROM listings WHERE listing_type='for_rent'",
          )
          .first<{ c: number }>(),
        db
          .prepare(
            'SELECT COUNT(DISTINCT listing_id) as c FROM listing_images',
          )
          .first<{ c: number }>(),
        db
          .prepare(
            'SELECT COUNT(DISTINCT listing_id) as c FROM listing_amenities',
          )
          .first<{ c: number }>(),
        db
          .prepare(
            "SELECT COUNT(DISTINCT city) as c FROM listings WHERE city IS NOT NULL AND city != ''",
          )
          .first<{ c: number }>(),
        db
          .prepare(
            "SELECT COALESCE(listing_type,'unknown') as label, COUNT(*) as count FROM listings GROUP BY listing_type ORDER BY count DESC",
          )
          .all<{ label: string; count: number }>(),
        db
          .prepare(
            "SELECT COALESCE(ad_tier,'unknown') as label, COUNT(*) as count FROM listings GROUP BY ad_tier ORDER BY count DESC",
          )
          .all<{ label: string; count: number }>(),
        db
          .prepare(
            "SELECT COALESCE(seller_type,'unknown') as label, COUNT(*) as count FROM listings GROUP BY seller_type ORDER BY count DESC",
          )
          .all<{ label: string; count: number }>(),
        db
          .prepare(
            "SELECT COALESCE(property_type,'Unknown') as label, COUNT(*) as count FROM listings GROUP BY property_type ORDER BY count DESC LIMIT 12",
          )
          .all<{ label: string; count: number }>(),
        db
          .prepare(
            `SELECT listing_type,
              COUNT(*) as count,
              CAST(AVG(price) AS INTEGER) as mean_price,
              MIN(price) as min_price,
              MAX(price) as max_price,
              (SELECT price FROM listings l2 WHERE l2.listing_type = l1.listing_type AND l2.price IS NOT NULL ORDER BY l2.price LIMIT 1 OFFSET (SELECT COUNT(*)/2 FROM listings l3 WHERE l3.listing_type=l1.listing_type AND l3.price IS NOT NULL)) as median_price
             FROM listings l1 WHERE listing_type IN ('for_sale','for_rent') AND price IS NOT NULL GROUP BY listing_type`,
          )
          .all<{
            listing_type: string
            count: number
            mean_price: number
            min_price: number
            max_price: number
            median_price: number
          }>(),
        db
          .prepare(
            `SELECT city,
              COUNT(*) as count,
              (SELECT price FROM listings l2 WHERE l2.city=l1.city AND l2.listing_type='for_sale' AND l2.price IS NOT NULL ORDER BY l2.price LIMIT 1 OFFSET (SELECT COUNT(*)/2 FROM listings l3 WHERE l3.city=l1.city AND l3.listing_type='for_sale' AND l3.price IS NOT NULL)) as median_price
             FROM listings l1
             WHERE listing_type='for_sale' AND city IS NOT NULL AND city != ''
             GROUP BY city HAVING count >= 3 ORDER BY median_price DESC LIMIT 12`,
          )
          .all<{ city: string; count: number; median_price: number }>(),
        db
          .prepare(
            `SELECT city,
              COUNT(*) as count,
              (SELECT price/area_sqm FROM listings l2 WHERE l2.city=l1.city AND l2.listing_type='for_sale' AND l2.price IS NOT NULL AND l2.area_sqm > 0 ORDER BY l2.price/l2.area_sqm LIMIT 1 OFFSET (SELECT COUNT(*)/2 FROM listings l3 WHERE l3.city=l1.city AND l3.listing_type='for_sale' AND l3.price IS NOT NULL AND l3.area_sqm > 0)) as median_price
             FROM listings l1
             WHERE listing_type='for_sale' AND city IS NOT NULL AND city != '' AND price IS NOT NULL AND area_sqm > 0
             GROUP BY city HAVING count >= 3 ORDER BY median_price DESC LIMIT 12`,
          )
          .all<{ city: string; count: number; median_price: number }>(),
        db
          .prepare(
            `SELECT bedrooms,
              SUM(CASE WHEN listing_type='for_sale' THEN 1 ELSE 0 END) as for_sale,
              SUM(CASE WHEN listing_type='for_rent' THEN 1 ELSE 0 END) as for_rent
             FROM listings WHERE bedrooms BETWEEN 0 AND 8 GROUP BY bedrooms ORDER BY bedrooms`,
          )
          .all<{ bedrooms: number; for_sale: number; for_rent: number }>(),
        db
          .prepare(
            'SELECT amenity, COUNT(*) as count FROM listing_amenities GROUP BY amenity ORDER BY count DESC LIMIT 15',
          )
          .all<{ amenity: string; count: number }>(),
      ])

      return {
        overview: {
          total: totalRow?.c ?? 0,
          forSale: forSaleRow?.c ?? 0,
          forRent: forRentRow?.c ?? 0,
          withImages: withImagesRow?.c ?? 0,
          withAmenities: withAmenitiesRow?.c ?? 0,
          uniqueCities: uniqueCitiesRow?.c ?? 0,
        },
        listingTypes: listingTypeRows.results,
        adTiers: adTierRows.results,
        sellerTypes: sellerTypeRows.results,
        propertyTypes: propertyTypeRows.results,
        priceStats: priceStatRows.results.map((r) => ({
          listing_type: r.listing_type,
          count: r.count,
          median_price: r.median_price,
          mean_price: r.mean_price,
          min_price: r.min_price,
          max_price: r.max_price,
        })),
        cityMedianPrices: cityPriceRows.results,
        cityPricePerSqm: cityPpsmRows.results,
        bedroomDistribution: bedroomRows.results,
        topAmenities: amenityRows.results,
      }
    } catch {
      return getMockData()
    }
  },
)

function getMockData(): DashboardData {
  return {
    overview: {
      total: 1240,
      forSale: 820,
      forRent: 420,
      withImages: 1100,
      withAmenities: 680,
      uniqueCities: 34,
    },
    listingTypes: [
      { label: 'for_sale', count: 820 },
      { label: 'for_rent', count: 420 },
    ],
    adTiers: [
      { label: 'standard', count: 880 },
      { label: 'featured', count: 240 },
      { label: 'elite', count: 120 },
    ],
    sellerTypes: [
      { label: 'agency', count: 780 },
      { label: 'individual', count: 460 },
    ],
    propertyTypes: [
      { label: 'Apartment', count: 620 },
      { label: 'Villa', count: 180 },
      { label: 'Duplex', count: 120 },
      { label: 'Studio', count: 95 },
      { label: 'Townhouse', count: 80 },
      { label: 'Office', count: 65 },
      { label: 'Penthouse', count: 45 },
      { label: 'Chalet', count: 35 },
    ],
    priceStats: [
      {
        listing_type: 'for_sale',
        count: 820,
        median_price: 4_500_000,
        mean_price: 6_200_000,
        min_price: 500_000,
        max_price: 85_000_000,
      },
      {
        listing_type: 'for_rent',
        count: 420,
        median_price: 18_000,
        mean_price: 22_500,
        min_price: 3_500,
        max_price: 150_000,
      },
    ],
    cityMedianPrices: [
      { city: 'New Cairo', median_price: 8_200_000, count: 145 },
      { city: 'Sheikh Zayed', median_price: 7_400_000, count: 98 },
      { city: '6th of October', median_price: 5_600_000, count: 112 },
      { city: 'Nasr City', median_price: 4_800_000, count: 134 },
      { city: 'Heliopolis', median_price: 4_500_000, count: 87 },
      { city: 'Maadi', median_price: 4_100_000, count: 76 },
      { city: 'Zamalek', median_price: 3_900_000, count: 42 },
      { city: 'Dokki', median_price: 3_500_000, count: 55 },
    ],
    cityPricePerSqm: [
      { city: 'Zamalek', median_price: 42_000, count: 42 },
      { city: 'New Cairo', median_price: 38_000, count: 145 },
      { city: 'Sheikh Zayed', median_price: 35_000, count: 98 },
      { city: 'Heliopolis', median_price: 32_000, count: 87 },
      { city: 'Maadi', median_price: 30_000, count: 76 },
      { city: 'Nasr City', median_price: 28_000, count: 134 },
      { city: '6th of October', median_price: 22_000, count: 112 },
      { city: 'Dokki', median_price: 21_000, count: 55 },
    ],
    bedroomDistribution: [
      { bedrooms: 0, for_sale: 15, for_rent: 30 },
      { bedrooms: 1, for_sale: 80, for_rent: 120 },
      { bedrooms: 2, for_sale: 220, for_rent: 150 },
      { bedrooms: 3, for_sale: 310, for_rent: 80 },
      { bedrooms: 4, for_sale: 120, for_rent: 25 },
      { bedrooms: 5, for_sale: 55, for_rent: 10 },
      { bedrooms: 6, for_sale: 20, for_rent: 5 },
    ],
    topAmenities: [
      { amenity: 'Security', count: 420 },
      { amenity: 'Parking', count: 390 },
      { amenity: 'Swimming Pool', count: 280 },
      { amenity: 'Garden', count: 240 },
      { amenity: 'Gym', count: 195 },
      { amenity: 'Central A/C', count: 175 },
      { amenity: 'Elevator', count: 165 },
      { amenity: 'Balcony', count: 150 },
      { amenity: 'Concierge', count: 120 },
      { amenity: 'Storage Room', count: 95 },
    ],
  }
}
