-- Presidio strutturale sull'invariante di intervallo della coverage (P1-001/AUD-007).
--
-- L'aritmetica del carve vive ora in src/bookings/coverage.carve.ts, in un'unica copia con i suoi
-- unit test. Questo CHECK e' il backstop che rende un range invertito impossibile per COSTRUZIONE
-- e non per disciplina del chiamante: la stessa classe di difetto era gia' stata corretta una volta
-- su `terminate` (audit 2026-07-09) ed e' rinata su `suspend` perche' nulla, nel database, vietava
-- di scriverla. Senza CHECK, un daterange(lower > upper) affiora come `data_exception`, che
-- PrismaExceptionFilter non mappa: 500 dove il contratto prevede un errore di dominio.
ALTER TABLE "BookingCoverage"
  ADD CONSTRAINT coverage_range_valid CHECK ("startDate" <= "endDate");
