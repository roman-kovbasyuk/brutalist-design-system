const staticImageCost = 0.12
const videoCost = 1.8

export const campaignHistory = [
  {
    id: 'campaign-oslo-intensive',
    date: 'Sep 2, 2026',
    status: 'In review',
    name: 'Oslo intensive launch',
    bannerCount: 16,
    totalGenerations: 12,
    staticVisualCount: 8,
    videoCount: 4,
    productionCost: 8.16,
  },
  {
    id: 'campaign-first-week',
    date: 'Aug 28, 2026',
    status: 'Ready for approval',
    name: 'First week in Norway',
    bannerCount: 12,
    totalGenerations: 9,
    staticVisualCount: 7,
    videoCount: 2,
    productionCost: 4.44,
  },
  {
    id: 'campaign-conversation-club',
    date: 'Aug 19, 2026',
    status: 'Approved',
    name: 'Conversation club enrollment',
    bannerCount: 10,
    totalGenerations: 8,
    staticVisualCount: 6,
    videoCount: 2,
    productionCost: 4.32,
  },
  {
    id: 'campaign-autumn-arrivals',
    date: 'Aug 7, 2026',
    status: 'Delivered',
    name: 'Autumn arrivals course',
    bannerCount: 8,
    totalGenerations: 10,
    staticVisualCount: 8,
    videoCount: 2,
    productionCost: 4.56,
  },
]

const campaignTotals = campaignHistory.reduce(
  (totals, campaign) => ({
    totalBanners: totals.totalBanners + campaign.bannerCount,
    totalReviews: totals.totalReviews + 1,
    totalGenerations: totals.totalGenerations + campaign.totalGenerations,
    totalStaticVisuals: totals.totalStaticVisuals + campaign.staticVisualCount,
    totalVideos: totals.totalVideos + campaign.videoCount,
    productionCost: Number((totals.productionCost + campaign.productionCost).toFixed(2)),
  }),
  {
    totalBanners: 0,
    totalReviews: 0,
    totalGenerations: 0,
    totalStaticVisuals: 0,
    totalVideos: 0,
    productionCost: 0,
  },
)

export const productionTotals = {
  ...campaignTotals,
}

export const dashboardMetrics = {
  totalBannersCreated: productionTotals.totalBanners,
  totalImages: productionTotals.totalStaticVisuals,
  totalVideos: productionTotals.totalVideos,
  totalReviews: productionTotals.totalReviews,
  genAiProductionCost: productionTotals.productionCost,
}

export const generationCosts = { staticImageCost, videoCost }
