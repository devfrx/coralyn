-- AddForeignKey
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_enrollmentTokenId_fkey" FOREIGN KEY ("enrollmentTokenId") REFERENCES "CustomerEnrollmentToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_rotatedFromId_fkey" FOREIGN KEY ("rotatedFromId") REFERENCES "CustomerSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
