import type { Ref } from 'vue';
import type { ReportSummaryDTO, ReportPeriod } from '@coralyn/contracts';
import { Permission } from '@coralyn/contracts';
import { queryResource } from '@coralyn/data-layer';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

export function useReportSummary(period: Ref<ReportPeriod>) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.reportSummary(session.establishmentId, period.value),
    queryFn: () => apiFetch<ReportSummaryDTO>(`/reports/summary?period=${period.value}`),
    enabled: () => session.hasPermission(Permission.ReportsRead),
  });
}
