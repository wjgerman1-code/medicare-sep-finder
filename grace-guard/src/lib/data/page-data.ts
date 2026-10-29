import "server-only";
import { todayInTimeZone } from "@/lib/dates";
import { buildSnapshot } from "@/lib/kpi/snapshot";
import { parseFilters, type SearchParams } from "./filters";
import { getWorkspace, loadCampaignData, resolveCampaign } from "./queries";

/** Common loader for dashboard pages: workspace, campaign, data, filters and the KPI snapshot. */
export async function loadPage(searchParams: Promise<SearchParams>) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const ws = await getWorkspace();
  const campaign = resolveCampaign(ws, filters.campaign);
  if (!campaign) return { ws, filters, campaign: null, data: null, snapshot: null, asOf: todayInTimeZone(ws.profile.timezone) } as const;
  const productId = filters.product && ws.products.some((p) => p.id === filters.product) ? filters.product : null;
  const data = await loadCampaignData(ws, campaign);
  const asOf = todayInTimeZone(ws.profile.timezone);
  const snapshot = buildSnapshot(data, { asOf, from: filters.from, to: filters.to, productId });
  return { ws, filters: { ...filters, campaign: campaign.slug, product: productId }, campaign, data, snapshot, asOf } as const;
}
