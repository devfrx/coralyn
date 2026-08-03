import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateUmbrellaTypeDto } from './create-umbrella-type.dto';
import { UpdateUmbrellaTypeDto } from './update-umbrella-type.dto';

// I due DTO portavano lo stesso ICON_KEYS duplicato: il presidio deve valere su ENTRAMBI, o
// correggerne uno solo lascia l'altro indietro senza che nulla arrossi.
const erroriCreate = async (icon: unknown): Promise<string[]> =>
  (await validate(plainToInstance(CreateUmbrellaTypeDto, { name: 'Gazebo', icon }))).map((e) => e.property);
const erroriUpdate = async (icon: unknown): Promise<string[]> =>
  (await validate(plainToInstance(UpdateUmbrellaTypeDto, { icon }))).map((e) => e.property);

describe('icona della tipologia — stessa regola sui due DTO', () => {
  it.each([['create', erroriCreate], ['update', erroriUpdate]] as const)(
    '%s accetta un nome lucide e un alias, e rifiuta un nome inventato',
    async (_nome, errori) => {
      expect(await errori('anchor')).toEqual([]);
      expect(await errori('palmtree')).toEqual([]);
      expect(await errori('non-esiste-affatto')).toEqual(['icon']);
    },
  );
});
