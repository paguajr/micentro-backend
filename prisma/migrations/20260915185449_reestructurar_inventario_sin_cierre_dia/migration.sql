/*
  Warnings:

  - You are about to drop the column `cierreDiaId` on the `InsumoUsado` table. All the data in the column will be lost.
  - You are about to drop the `CierreDia` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `negocioId` to the `InsumoUsado` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "CierreDia" DROP CONSTRAINT "CierreDia_negocioId_fkey";

-- DropForeignKey
ALTER TABLE "InsumoUsado" DROP CONSTRAINT "InsumoUsado_cierreDiaId_fkey";

-- AlterTable
ALTER TABLE "InsumoUsado" DROP COLUMN "cierreDiaId",
ADD COLUMN     "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "negocioId" INTEGER NOT NULL;

-- DropTable
DROP TABLE "CierreDia";

-- CreateTable
CREATE TABLE "CompraStock" (
    "id" SERIAL NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "costoTotal" DECIMAL(65,30),
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "negocioId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,

    CONSTRAINT "CompraStock_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InsumoUsado" ADD CONSTRAINT "InsumoUsado_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraStock" ADD CONSTRAINT "CompraStock_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraStock" ADD CONSTRAINT "CompraStock_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
