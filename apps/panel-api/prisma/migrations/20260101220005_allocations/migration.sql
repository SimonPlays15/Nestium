-- CreateEnum
CREATE TYPE "PortProtocol" AS ENUM ('TCP', 'UDP');

-- CreateTable
CREATE TABLE "Allocation" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "ip" TEXT NOT NULL DEFAULT '0.0.0.0',
    "port" INTEGER NOT NULL,
    "protocol" "PortProtocol" NOT NULL DEFAULT 'TCP',
    "assignedServerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Allocation_assignedServerId_key" ON "Allocation"("assignedServerId");

-- CreateIndex
CREATE INDEX "Allocation_nodeId_assignedServerId_idx" ON "Allocation"("nodeId", "assignedServerId");

-- CreateIndex
CREATE UNIQUE INDEX "Allocation_nodeId_ip_port_protocol_key" ON "Allocation"("nodeId", "ip", "port", "protocol");

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
