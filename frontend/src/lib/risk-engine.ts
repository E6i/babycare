import { SeverityLevel, TriageLevel } from "@prisma/client";
import { formatCryClassLabel } from "@/lib/cry-classification";

type RiskInput = {
  babyAgeMonths?: number | null;
  message?: string | null;
  predictedClass?: string | null;
  confidence?: number | null;
  temperatureC?: number | null;
  poorFeeding?: boolean;
  sleepIssue?: boolean;
  wetDiapers24h?: number | null;
  cryingHours?: number | null;
};

export type RiskAssessment = {
  riskScore: number;
  severity: SeverityLevel;
  triage: TriageLevel;
  headline: string;
  reasons: string[];
  actions: string[];
  explainability: string[];
};

function hasPattern(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function triageLabel(triage: TriageLevel) {
  switch (triage) {
    case TriageLevel.HOME_CARE:
      return "رعاية منزلية";
    case TriageLevel.WATCH_CLOSELY:
      return "مراقبة قريبة";
    case TriageLevel.PEDIATRICIAN_SOON:
      return "مراجعة طبيب قريبًا";
    case TriageLevel.URGENT_NOW:
      return "طوارئ الآن";
  }
}

export function assessRisk(input: RiskInput): RiskAssessment {
  const text = (input.message ?? "").toLowerCase();
  let score = 8;
  const reasons: string[] = [];
  const actions: string[] = [];
  const explainability: string[] = [];

  const emergencyPatterns = [
    /\b(can'?t breathe|not breathing|blue lips|seizure|unconscious|dehydrated)\b/i,
    /(مش بيتنفس|زرقة|تشنج|فاقد الوعي|جفاف)/i,
  ];
  if (hasPattern(text, emergencyPatterns)) {
    score += 70;
    reasons.push("تم رصد كلمات قد تدل على حالة طارئة مثل صعوبة التنفس أو التشنجات أو الجفاف.");
    actions.push("اطلبي المساعدة الطبية العاجلة أو اذهبي للطوارئ فورًا.");
    explainability.push("الـ risk engine رفع الخطورة بقوة لأن النص احتوى مؤشرات طبية عالية الحساسية.");
  }

  if (typeof input.temperatureC === "number") {
    if (input.temperatureC >= 38) {
      score += 20;
      reasons.push(`درجة الحرارة ${input.temperatureC.toFixed(1)}°C وتعتبر مرتفعة.`);
      explainability.push("الحرارة المرتفعة من أهم المدخلات المؤثرة في تقييم الخطورة.");
    }
    if ((input.babyAgeMonths ?? 99) < 3 && input.temperatureC >= 38) {
      score += 35;
      reasons.push("وجود حرارة في رضيع أصغر من 3 شهور يحتاج حذرًا أعلى.");
      actions.push("يفضّل التواصل مع طبيب أطفال أو الطوارئ في أقرب وقت.");
      explainability.push("العمر الصغير مع الحرارة يرفع مستوى التوصية الطبية.");
    }
  }

  if (input.poorFeeding) {
    score += 18;
    reasons.push("تم الإشارة إلى ضعف الرضاعة أو رفض الأكل.");
    actions.push("راقبي عدد الرضعات والبلل في الحفاضات خلال اليوم.");
    explainability.push("ضعف الرضاعة قد يكون علامة على إجهاد أو مرض ويؤثر في التقييم.");
  }

  if (input.sleepIssue) {
    score += 8;
    reasons.push("هناك اضطراب واضح في النوم أو الاستيقاظ المتكرر.");
    actions.push("جرّبي روتين تهدئة ثابت وإضاءة هادئة وتقليل المثيرات.");
  }

  if (typeof input.wetDiapers24h === "number") {
    if (input.wetDiapers24h <= 2) {
      score += 28;
      reasons.push("عدد الحفاضات المبللة قليل جدًا وقد يشير إلى جفاف.");
      actions.push("إذا استمر قلة البول أو كان الطفل خاملًا، اطلبي تقييمًا طبيًا.");
      explainability.push("قلة البول خلال 24 ساعة تدخل مباشر في حساب خطر الجفاف.");
    } else if (input.wetDiapers24h <= 4) {
      score += 14;
      reasons.push("عدد الحفاضات المبللة أقل من المتوقع.");
    }
  }

  if (typeof input.cryingHours === "number") {
    if (input.cryingHours >= 3) {
      score += 14;
      reasons.push("البكاء مستمر لساعات طويلة.");
      actions.push("تحققي من الجوع والحفاض والتجشؤ والغازات والحرارة.");
    } else if (input.cryingHours >= 1) {
      score += 6;
      reasons.push("البكاء مستمر لفترة ملحوظة.");
    }
  }

  if (input.predictedClass) {
    if (input.predictedClass === "belly_pain") {
      score += 12;
      reasons.push("النموذج الصوتي رجّح مغص أو ألم بطني.");
      actions.push("جرّبي التجشؤ، تغيير الوضعية، وتدليك البطن بلطف.");
    }
    if (input.predictedClass === "discomfort") {
      score += 8;
      reasons.push("النموذج الصوتي رجّح وجود انزعاج عام.");
      actions.push("افحصي الحفاض والملابس ودرجة الحرارة ووضعية النوم.");
    }
    if (input.predictedClass === "hungry") {
      score += 4;
      reasons.push("النموذج الصوتي رجّح الجوع.");
      actions.push("قدّمي رضعة هادئة ثم راقبي التحسن.");
    }
    if (input.predictedClass === "tired") {
      score += 4;
      reasons.push("النموذج الصوتي رجّح التعب أو النعاس.");
      actions.push("قللي الضوء والضوضاء واستخدمي روتين تهدئة.");
    }
    explainability.push(
      `النموذج الصوتي صنّف الحالة الأقرب بأنها ${formatCryClassLabel(input.predictedClass)} بدرجة ثقة ${Math.round((input.confidence ?? 0) * 100)}%.`,
    );
  }


  if (input.confidence !== null && input.confidence !== undefined && input.confidence < 0.6) {
    reasons.push("ثقة النموذج ليست عالية، لذلك تم الاعتماد أكثر على عوامل الخطورة العامة.");
    explainability.push("عندما تكون ثقة النموذج منخفضة، لا نعتمد عليه وحده ونزيد وزن مؤشرات السلامة.");
  }

  if (score < 20) {
    actions.push("استمري في المراقبة المنزلية وتابعي إذا ظهرت حرارة أو ضعف رضاعة أو خمول.");
  } else if (score < 50) {
    actions.push("تابعي الطفل خلال الساعات القادمة وسجلي أي تغيّر في الرضاعة أو الحرارة أو الحفاضات.");
  } else if (score < 75) {
    actions.push("يُفضّل مراجعة طبيب أطفال قريبًا مع تجهيز ملخص الأعراض والتوقيت.");
  }

  const boundedScore = Math.max(0, Math.min(100, score));

  let severity: SeverityLevel = SeverityLevel.LOW;
  let triage: TriageLevel = TriageLevel.HOME_CARE;
  if (boundedScore >= 75) {
    severity = SeverityLevel.CRITICAL;
    triage = TriageLevel.URGENT_NOW;
  } else if (boundedScore >= 50) {
    severity = SeverityLevel.HIGH;
    triage = TriageLevel.PEDIATRICIAN_SOON;
  } else if (boundedScore >= 25) {
    severity = SeverityLevel.MEDIUM;
    triage = TriageLevel.WATCH_CLOSELY;
  }

  if (reasons.length === 0) {
    reasons.push("لا توجد إشارات خطورة قوية من المدخلات الحالية.");
  }

  return {
    riskScore: boundedScore,
    severity,
    triage,
    headline: `التقييم الحالي: ${triageLabel(triage)}`,
    reasons,
    actions,
    explainability,
  };
}
