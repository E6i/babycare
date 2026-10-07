import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createTimelineEvent } from "@/lib/timeline";
import { TimelineEventType } from "@prisma/client";
import { formatAgeLabel, monthsBetween, normalizePhone } from "@/lib/baby-utils";
import { getFamilyProfiles } from "@/lib/active-baby";

const profileSchema = z.object({
  id: z.string().optional().nullable(),
  babyName: z.string().trim().max(120).optional().nullable(),
  avatarUrl: z.string().trim().max(1200).optional().nullable(),
  birthDate: z.string().optional().nullable(),
  gender: z.string().trim().max(40).optional().nullable(),
  weightKg: z.number().min(0).max(50).optional().nullable(),
  heightCm: z.number().min(0).max(180).optional().nullable(),
  headCircumferenceCm: z.number().min(0).max(80).optional().nullable(),
  feedingStyle: z.string().trim().max(120).optional().nullable(),
  allergies: z.string().trim().max(800).optional().nullable(),
  pediatricianName: z.string().trim().max(120).optional().nullable(),
  pediatricianPhone: z.string().trim().max(40).optional().nullable(),
  medicalNotes: z.string().trim().max(1000).optional().nullable(),
  emergencyPhone: z.string().trim().max(40).optional().nullable(),
  preferredLanguage: z.string().trim().max(10).optional().nullable(),
  parentAvatarUrl: z.string().trim().max(1200).optional().nullable(),
  createNew: z.boolean().optional(),
});

const patchSchema = z.object({
  activeBabyProfileId: z.string().optional().nullable(),
  parentAvatarUrl: z.string().trim().max(1200).optional().nullable(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const family = await getFamilyProfiles(user.id);

  return NextResponse.json({
    user: family.user,
    children: family.profiles,
    profile: family.activeProfile,
    activeBabyProfileId: family.activeProfile?.id ?? null,
  });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid profile update." }, { status: 400 });
  }

  if (parsed.data.activeBabyProfileId) {
    const owned = await prisma.babyProfile.findFirst({
      where: { id: parsed.data.activeBabyProfileId, userId: user.id },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: "Child profile not found." }, { status: 404 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      activeBabyProfileId: parsed.data.activeBabyProfileId || undefined,
      avatarUrl: parsed.data.parentAvatarUrl ?? undefined,
    },
  });

  const family = await getFamilyProfiles(user.id);
  return NextResponse.json({ user: family.user, children: family.profiles, profile: family.activeProfile });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid profile input." }, { status: 400 });
  }

  const data = parsed.data;
  if (data.parentAvatarUrl !== undefined) {
    await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: data.parentAvatarUrl || null },
    });
  }

  const currentFamily = await getFamilyProfiles(user.id);
  const existingProfileId = data.createNew ? null : data.id || currentFamily.activeProfile?.id || null;
  if (existingProfileId) {
    const owned = await prisma.babyProfile.findFirst({ where: { id: existingProfileId, userId: user.id }, select: { id: true } });
    if (!owned) return NextResponse.json({ error: "Child profile not found." }, { status: 404 });
  }
  const profile = existingProfileId
    ? await prisma.babyProfile.update({
        where: { id: existingProfileId },
        data: {
          babyName: data.babyName !== undefined ? data.babyName || null : undefined,
          avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl || null : undefined,
          birthDate: data.birthDate !== undefined ? (data.birthDate ? new Date(data.birthDate) : null) : undefined,
          gender: data.gender !== undefined ? data.gender || null : undefined,
          weightKg: data.weightKg !== undefined ? data.weightKg ?? null : undefined,
          heightCm: data.heightCm !== undefined ? data.heightCm ?? null : undefined,
          headCircumferenceCm: data.headCircumferenceCm !== undefined ? data.headCircumferenceCm ?? null : undefined,
          feedingStyle: data.feedingStyle !== undefined ? data.feedingStyle || null : undefined,
          allergies: data.allergies !== undefined ? data.allergies || null : undefined,
          pediatricianName: data.pediatricianName !== undefined ? data.pediatricianName || null : undefined,
          pediatricianPhone: data.pediatricianPhone !== undefined ? normalizePhone(data.pediatricianPhone) || null : undefined,
          medicalNotes: data.medicalNotes !== undefined ? data.medicalNotes || null : undefined,
          emergencyPhone: data.emergencyPhone !== undefined ? normalizePhone(data.emergencyPhone) || null : undefined,
          preferredLanguage: data.preferredLanguage !== undefined ? data.preferredLanguage || "ar" : undefined,
        },
      })
    : await prisma.babyProfile.create({
      data: {
      userId: user.id,
      babyName: data.babyName || null,
      avatarUrl: data.avatarUrl || null,
      birthDate: data.birthDate ? new Date(data.birthDate) : null,
      gender: data.gender || null,
      weightKg: data.weightKg ?? null,
      heightCm: data.heightCm ?? null,
      headCircumferenceCm: data.headCircumferenceCm ?? null,
      feedingStyle: data.feedingStyle || null,
      allergies: data.allergies || null,
      pediatricianName: data.pediatricianName || null,
      pediatricianPhone: normalizePhone(data.pediatricianPhone) || null,
      medicalNotes: data.medicalNotes || null,
      emergencyPhone: normalizePhone(data.emergencyPhone) || null,
      preferredLanguage: data.preferredLanguage || "ar",
    },
    });

  await prisma.user.update({
    where: { id: user.id },
    data: { activeBabyProfileId: profile.id },
  });

  await createTimelineEvent({
    userId: user.id,
    babyProfileId: profile.id,
    type: TimelineEventType.PROFILE_UPDATED,
    title: "تحديث ملف الطفل",
    summary: `تم تحديث بيانات ${profile.babyName || "الطفل"} بنجاح.`,
    metadata: {
      babyName: profile.babyName,
      feedingStyle: profile.feedingStyle,
      emergencyPhone: profile.emergencyPhone,
      pediatricianName: profile.pediatricianName,
    },
  });

  return NextResponse.json({
    profile: {
      ...profile,
      ageMonths: monthsBetween(profile.birthDate),
      ageLabel: formatAgeLabel(profile.birthDate),
    },
  });
}
