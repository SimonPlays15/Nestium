/*
  Warnings:

  - Added the required column `serverId` to the `SubUser` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SubUser"
    ADD COLUMN "serverId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "SubUser"
    ADD CONSTRAINT "SubUser_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
