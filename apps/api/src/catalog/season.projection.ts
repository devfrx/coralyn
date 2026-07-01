import type { Season } from '@prisma/client';
import type { SeasonDTO } from '@coralyn/contracts';
import { formatDbDate } from '../common/dates';

/** Proietta una riga Season nel DTO (Date @db.Date → ISO yyyy-mm-dd). */
export function toSeasonDTO(s: Season): SeasonDTO {
  return {
    id: s.id,
    name: s.name,
    startDate: formatDbDate(s.startDate),
    endDate: formatDbDate(s.endDate),
  };
}
