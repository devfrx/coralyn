import { http, HttpResponse } from 'msw';
import { mappaSeed } from './data/seed';

export const handlers = [http.get('/api/mappa', () => HttpResponse.json(mappaSeed))];
