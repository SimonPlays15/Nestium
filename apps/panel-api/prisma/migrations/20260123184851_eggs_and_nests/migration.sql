-- CreateTable
CREATE TABLE "Nests" (
    "id" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Nests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Eggs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "description" TEXT,
    "features" JSONB,
    "dockerImages" JSONB NOT NULL,
    "updateUrl" TEXT NOT NULL DEFAULT '',
    "configFiles" JSONB NOT NULL,
    "configStartup" JSONB NOT NULL,
    "configLogs" JSONB NOT NULL,
    "configStop" JSONB NOT NULL,
    "startup" TEXT NOT NULL,
    "scriptContainer" TEXT NOT NULL,
    "scriptEntry" TEXT NOT NULL DEFAULT '/bin/bash',
    "installScript" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nestsId" TEXT NOT NULL,

    CONSTRAINT "Eggs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EggVariables" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "envVariable" TEXT NOT NULL,
    "defaultValue" TEXT NOT NULL,
    "userCanView" BOOLEAN NOT NULL DEFAULT true,
    "userCanEdit" BOOLEAN NOT NULL DEFAULT true,
    "rules" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "eggsId" TEXT,

    CONSTRAINT "EggVariables_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Eggs" ADD CONSTRAINT "Eggs_nestsId_fkey" FOREIGN KEY ("nestsId") REFERENCES "Nests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EggVariables" ADD CONSTRAINT "EggVariables_eggsId_fkey" FOREIGN KEY ("eggsId") REFERENCES "Eggs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
