-- CreateTable
CREATE TABLE "WsToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WsToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WsToken_tokenHash_key" ON "WsToken"("tokenHash");

-- CreateIndex
CREATE INDEX "WsToken_serverId_userId_idx" ON "WsToken"("serverId", "userId");
