import type { BabyProfile } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatAgeLabel, monthsBetween } from "@/lib/baby-utils";

export type BabyProfileWithAge = BabyProfile & {
  ageMonths: number | null;
  ageLabel: string;
};

export function withBabyAge(profile: BabyProfile): BabyProfileWithAge {
  return {
    ...profile,
    ageMonths: monthsBetween(profile.birthDate),
    ageLabel: formatAgeLabel(profile.birthDate),
  };
}

export async function getFamilyProfiles(userId: string) {
  const [account, profiles] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, avatarUrl: true, activeBabyProfileId: true },
    }),
    prisma.babyProfile.findMany({
      where: { userId },
      orderBy: [{ createdAt: "asc" }, { updatedAt: "desc" }],
    }),
  ]);

  const activeProfile =
    profiles.find((profile) => profile.id === account?.activeBabyProfileId) ||
    profiles[0] ||
    null;

  if (activeProfile && account?.activeBabyProfileId !== activeProfile.id) {
    await prisma.user.update({
      where: { id: userId },
      data: { activeBabyProfileId: activeProfile.id },
    });
  }

  return {
    user: account,
    profiles: profiles.map(withBabyAge),
    activeProfile: activeProfile ? withBabyAge(activeProfile) : null,
  };
}

export async function getActiveBabyProfile(userId: string) {
  const family = await getFamilyProfiles(userId);
  return family.activeProfile;
}

export function scopedBabyWhere(userId: string, babyProfileId?: string | null) {
  return babyProfileId
    ? {
        userId,
        OR: [{ babyProfileId }, { babyProfileId: null }],
      }
    : { userId };
}
