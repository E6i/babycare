export type CryClassInfo = {
  label: string;
  meaning: string;
  guidance: string;
};

const CRY_CLASS_INFO: Record<string, CryClassInfo> = {
  belly_pain: {
    label: "مغص / ألم بطني",
    meaning: "البكاء قد يرتبط بغازات أو شد في البطن، وليس تشخيصًا طبيًا.",
    guidance: "جرّبي التجشؤ، حمل الطفل بوضعية مريحة، وتدليك البطن بلطف مع متابعة الحرارة والرضاعة.",
  },
  hungry: {
    label: "جوع",
    meaning: "النمط الصوتي يشبه بكاء الاحتياج للرضاعة أو عدم الشبع.",
    guidance: "قدّمي رضعة هادئة، راقبي الالتقام والبلع، وسجلي إذا هدأ البكاء بعدها.",
  },
  discomfort: {
    label: "انزعاج",
    meaning: "قد يكون السبب حفاضًا، ملابس غير مريحة، حرارة المكان، أو وضعية غير مريحة.",
    guidance: "افحصي الحفاض والملابس وحرارة الجسم والغرفة، ثم غيّري الوضعية بهدوء.",
  },
  tired: {
    label: "نعاس / تعب",
    meaning: "البكاء قد يشير إلى إرهاق أو احتياج لروتين نوم أهدأ.",
    guidance: "قللي الضوء والضوضاء، واستخدمي تهدئة قصيرة مثل حمل هادئ أو صوت أبيض منخفض.",
  },
  burping: {
    label: "احتياج للتجشؤ",
    meaning: "قد يكون هناك هواء بعد الرضاعة يسبب ضيقًا مؤقتًا.",
    guidance: "ارفعي الطفل على الكتف أو في وضعية جلوس مدعومة لبضع دقائق مع تربيت لطيف.",
  },
  background: {
    label: "ضوضاء خلفية",
    meaning: "التسجيل لا يحتوي إشارة بكاء واضحة بما يكفي.",
    guidance: "أعيدي التسجيل في مكان أهدأ وقربي الهاتف من الطفل بدون ملامسة مباشرة.",
  },
  uncertain: {
    label: "غير مؤكد",
    meaning: "النموذج لم يجد نمطًا واضحًا كافيًا للاعتماد عليه وحده.",
    guidance: "راجعي الجوع والحفاض والحرارة والغازات، وتواصلي مع الطبيب عند الخمول أو صعوبة التنفس أو حرارة مرتفعة.",
  },
};

export function getCryClassInfo(label?: string | null): CryClassInfo {
  if (!label) return CRY_CLASS_INFO.uncertain;
  return CRY_CLASS_INFO[label] ?? {
    label: label.replace(/_/g, " "),
    meaning: "الفئة الصوتية غير معروفة في قاموس التصنيف، لذلك نعرضها كما رجّحها النموذج.",
    guidance: "استخدمي النتيجة كإشارة مساعدة فقط، وركزي على الأعراض الظاهرة وسلوك الطفل العام.",
  };
}

export function formatCryClassLabel(label?: string | null) {
  return getCryClassInfo(label).label;
}
