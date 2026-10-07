import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AuditInput = {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  request?: NextRequest;
};

export async function writeAuditLog(input: AuditInput) {
  const ipAddress =
    input.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    input.request?.headers.get("x-real-ip") ||
    null;

  await prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      ipAddress,
      metadata: input.metadata || undefined,
    },
  });
}
