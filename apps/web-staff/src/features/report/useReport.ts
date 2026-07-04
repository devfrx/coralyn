import type { Ref } from 'vue';
import type { ReportSummaryDTO, ReportPeriod } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource } from '@/lib/useQueryResource';

export function useReportSummary(period: Ref<ReportPeriod>) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.reportSummary(session.establishmentId, period.value),
    queryFn: () => apiFetch<ReportSummaryDTO>(`/reports/summary?period=${period.value}`),
  });
}
