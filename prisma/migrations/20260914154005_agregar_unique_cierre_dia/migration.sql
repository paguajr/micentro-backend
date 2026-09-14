/*
  Warnings:

  - A unique constraint covering the columns `[negocioId,fecha]` on the table `CierreDia` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "CierreDia_negocioId_fecha_key" ON "CierreDia"("negocioId", "fecha");
