-- CreateEnum
CREATE TYPE "DiaSemana" AS ENUM ('LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO');

-- CreateTable
CREATE TABLE "HorarioNegocio" (
    "id" SERIAL NOT NULL,
    "diaSemana" "DiaSemana" NOT NULL,
    "horaInicio" INTEGER NOT NULL,
    "horaFin" INTEGER NOT NULL,
    "negocioId" INTEGER NOT NULL,

    CONSTRAINT "HorarioNegocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorarioRecurso" (
    "id" SERIAL NOT NULL,
    "diaSemana" "DiaSemana" NOT NULL,
    "horaInicio" INTEGER NOT NULL,
    "horaFin" INTEGER NOT NULL,
    "recursoId" INTEGER NOT NULL,

    CONSTRAINT "HorarioRecurso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PausaRecurso" (
    "id" SERIAL NOT NULL,
    "diaSemana" "DiaSemana" NOT NULL,
    "horaInicio" INTEGER NOT NULL,
    "horaFin" INTEGER NOT NULL,
    "recursoId" INTEGER NOT NULL,

    CONSTRAINT "PausaRecurso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HorarioNegocio_negocioId_diaSemana_key" ON "HorarioNegocio"("negocioId", "diaSemana");

-- CreateIndex
CREATE UNIQUE INDEX "HorarioRecurso_recursoId_diaSemana_key" ON "HorarioRecurso"("recursoId", "diaSemana");

-- AddForeignKey
ALTER TABLE "HorarioNegocio" ADD CONSTRAINT "HorarioNegocio_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioRecurso" ADD CONSTRAINT "HorarioRecurso_recursoId_fkey" FOREIGN KEY ("recursoId") REFERENCES "Recurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PausaRecurso" ADD CONSTRAINT "PausaRecurso_recursoId_fkey" FOREIGN KEY ("recursoId") REFERENCES "Recurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
