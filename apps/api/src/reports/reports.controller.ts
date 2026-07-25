import { Controller, Get, Query } from '@nestjs/common';
import type { ReportSummaryDTO } from '@coralyn/contracts';
import { ReportsService } from './reports.service';
import { ReportSummaryQueryDto } from './dto/report-summary-query.dto';
import { Permission } from '../identity/permission';
import { RequiresPermission } from '../identity/permission.decorator';

@Controller('reports')
@RequiresPermission(Permission.ReportsRead)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  summary(@Query() query: ReportSummaryQueryDto): Promise<ReportSummaryDTO> {
    return this.reports.getSummary(query.period ?? 'week');
  }
}
