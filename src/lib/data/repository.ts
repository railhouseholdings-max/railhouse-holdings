import 'server-only';
import { mockDeals, mockProperties } from './mock';
import { cloudConfig, dataMode, UUID_PATTERN } from '../config/cloud';
import { requireOwner } from '../cloud/session';
import { restRequest } from '../cloud/http';
import { fromDealRow, type DbRow } from '../persistence/deal-records';
import { fromPropertyRow } from '../persistence/property-records';
const propertySelect = '*,property_financials(*),property_operations(*),property_loans(*),property_leases(*),property_valuations(*)';
const dealSelect = '*,deal_adjustments(*),deal_tax_assumptions(*)';
export async function listProperties() {
  if (dataMode() === 'demo') return mockProperties;
  const rows = await restRequest<DbRow[]>(cloudConfig(),await requireOwner(),`properties?${new URLSearchParams({select:propertySelect,order:'created_at.desc'})}`);
  return rows.map(fromPropertyRow);
}
export async function getProperty(id: string) {
  if (dataMode() === 'demo') return mockProperties.find(property=>property.id===id) ?? null;
  const session = await requireOwner();
  if (!UUID_PATTERN.test(id)) return null;
  const rows = await restRequest<DbRow[]>(cloudConfig(),session,`properties?${new URLSearchParams({select:propertySelect,id:`eq.${id}`,limit:'1'})}`);
  return rows[0] ? fromPropertyRow(rows[0]) : null;
}
export async function listDeals() {
  if (dataMode() === 'demo') return mockDeals;
  const rows = await restRequest<DbRow[]>(cloudConfig(),await requireOwner(),`deals?${new URLSearchParams({select:dealSelect,order:'updated_at.desc'})}`);
  return rows.map(fromDealRow);
}
export async function getDeal(id: string) {
  if (dataMode() === 'demo') return mockDeals.find(deal=>deal.id===id) ?? null;
  const session = await requireOwner();
  if (!UUID_PATTERN.test(id)) return null;
  const rows = await restRequest<DbRow[]>(cloudConfig(),session,`deals?${new URLSearchParams({select:dealSelect,id:`eq.${id}`,limit:'1'})}`);
  return rows[0] ? fromDealRow(rows[0]) : null;
}
