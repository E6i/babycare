type ChatRuleResult = {
  directReply: string | null;
  extraSystemHints: string[];
  detectedTopics: string[];
};

function normalizeText(input: string) {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function includesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function analyzeChatMessage(message: string): ChatRuleResult {
  const normalized = normalizeText(message);
  const extraSystemHints: string[] = [];
  const detectedTopics: string[] = [];

  const emergencyPatterns = [
    /\b(can'?t breathe|not breathing|breathing problem|blue lips|seizure|unconscious|passed out)\b/i,
    /\b(dehydrated|no wet diaper|no urine|very sleepy|won't wake up)\b/i,
    /\b(high fever|fever for \d+ days|persistent fever)\b/i,
    /(مش بيتنفس|صعوبة في التنفس|زرقة|تشنج|فاقد الوعي|جفاف شديد|حرارة عالية مستمرة)/i,
  ];
  if (includesAny(message, emergencyPatterns)) {
    return {
      directReply:
        "قد تكون هذه حالة طارئة. توجهي للطوارئ أو تواصلي مع إسعاف فورًا، خاصة إذا كان الطفل لديه صعوبة في التنفس أو زرقة أو تشنجات أو جفاف شديد أو صعوبة واضحة في الاستيقاظ.",
      extraSystemHints,
      detectedTopics: ["emergency"],
    };
  }

  const greetingPatterns = [
    /^(hi|hello|hey|good morning|good evening)\b/i,
    /^(السلام عليكم|اهلا|أهلا|مرحبا|هاي)/i,
  ];
  if (includesAny(message, greetingPatterns) && normalized.length < 40) {
    return {
      directReply:
        "أهلًا. أقدر أساعدك في البكاء، النوم، الرضاعة، الحرارة، الحفاضات، وأعراض الطفل اليومية. اكتبي عمر الطفل وما الذي يحدث الآن.",
      extraSystemHints,
      detectedTopics: ["greeting"],
    };
  }

  const thanksPatterns = [/\b(thanks|thank you|thx)\b/i, /(شكرا|شكرًا|متشكر|تسلم)/i];
  if (includesAny(message, thanksPatterns) && normalized.length < 40) {
    return {
      directReply: "على الرحب والسعة. لو تحبي، ابعتي الأعراض أو عمر الطفل أو تسجيل البكاء وأنا أساعدك خطوة بخطوة.",
      extraSystemHints,
      detectedTopics: ["thanks"],
    };
  }

  const audioUploadPatterns = [
    /\b(send|upload|record|recording|voice|voice note|audio clip|audio file|mic|microphone)\b/i,
    /(ابعت|هبعت|هرفع|ارفع|ارسل|أرسل|تسجيل|ريكورد|ملف صوت|مقطع صوت|فويس|صوت العياط|مايك|ميكروفون)/i,
  ];
  const cryingAudioContextPatterns = [/\b(cry|crying|baby cry|colic)\b/i, /(عيط|بكاء|عياط|بكا|مغص)/i];
  if (includesAny(message, audioUploadPatterns) && includesAny(message, cryingAudioContextPatterns)) {
    return {
      directReply:
        "نعم، تقدري تبعتي تسجيل بكاء الطفل هنا عادي. ارفعي الملف الصوتي أو استخدمي زر الميكروفون للتسجيل، وبعدها اضغطي `تحليل الصوت` وأنا سأعتمد نتيجة التحليل الصوتي في المتابعة.",
      extraSystemHints,
      detectedTopics: ["audio_upload", "crying"],
    };
  }

  const feedingPatterns = [/\b(feed|feeding|breastfeed|formula|milk|hungry|latch)\b/i, /(رضاع|رضاعة|لبن|حليب|يجوع|جوعان|يمص)/i];
  if (includesAny(message, feedingPatterns)) {
    detectedTopics.push("feeding");
    extraSystemHints.push(
      "المستخدم يسأل عن الرضاعة. قدمي ردًا عربيًا عمليًا ومختصرًا يراعي العمر، ويغطي الرضاعة الطبيعية أو الصناعية، التجشؤ، الترطيب، وعلامات الخطر بشكل مرتب.",
    );
  }

  const sleepPatterns = [/\b(sleep|nap|wake|waking|bedtime)\b/i, /(نوم|ينام|صحى|تصحى|سهران|قيلولة)/i];
  if (includesAny(message, sleepPatterns)) {
    detectedTopics.push("sleep");
    extraSystemHints.push(
      "المستخدم يسأل عن النوم. اقترحي روتينًا هادئًا، وإرشادات نوم آمن، والأسباب الشائعة للاستيقاظ، وخطوات بسيطة قابلة للتطبيق فورًا.",
    );
  }

  const feverPatterns = [/\b(fever|temperature|temp)\b/i, /(حرارة|سخونية|حمى|ترمومتر)/i];
  if (includesAny(message, feverPatterns)) {
    detectedTopics.push("fever");
    extraSystemHints.push(
      "المستخدم يسأل عن الحرارة. اطلبي عمر الطفل ودرجة الحرارة إن كانت ناقصة، واشرحي متى يلزم الطبيب أو الطوارئ، بدون ادعاء تشخيص نهائي.",
    );
  }

  const diaperPatterns = [/\b(diaper|poop|stool|constipation|wet diaper)\b/i, /(حفاض|براز|إمساك|بول|حفاضة)/i];
  if (includesAny(message, diaperPatterns)) {
    detectedTopics.push("diaper");
    extraSystemHints.push(
      "المستخدم يسأل عن الحفاض أو الإخراج. قدمي إرشادًا عمليًا عن الطبيعي وغير الطبيعي، الترطيب، علامات الخطر، ومتى يلزم الفحص الطبي.",
    );
  }

  const cryPatterns = [/\b(cry|crying|colic|fussy|won't stop crying)\b/i, /(عيط|بكاء|مغص|زن|مش بيبطل عياط)/i];
  if (includesAny(message, cryPatterns)) {
    detectedTopics.push("crying");
    extraSystemHints.push(
      "المستخدم يسأل عن البكاء. استخدمي checklist هادئ: الجوع، الحفاض، النوم، الحرارة، الغازات، التحفيز الزائد، وطرق التهدئة، مع ذكر العلامات المقلقة عند الحاجة.",
    );
  }

  const painPatterns = [
    /\b(pain|colic|tummy pain|stomach pain|ear pain|teething|gas pain)\b/i,
    /(ألم|وجع|مغص|معدته|بطنه|بطنها|وجع ودن|تسنين|غازات|بيصرخ من الوجع|ألم شديد)/i,
  ];
  if (includesAny(message, painPatterns)) {
    detectedTopics.push("pain");
    extraSystemHints.push(
      "المستخدم يصف ألمًا أو مغصًا. ابدئي برد فوري مطمئن من 3 أجزاء: السبب المحتمل الأقرب، خطوات آمنة الآن لتخفيف الألم، ومتى يصبح الأمر مقلقًا ويحتاج طبيبًا. اجعلي الرد مباشرًا وسريعًا بدون مقدمات طويلة.",
    );
  }

  const vomitingPatterns = [/\b(vomit|vomiting|throwing up|spit up)\b/i, /(ترجيع|قيء|استفراغ|يرجع|بيقئ)/i];
  if (includesAny(message, vomitingPatterns)) {
    detectedTopics.push("vomiting");
    extraSystemHints.push(
      "المستخدم يصف قيئًا أو ترجيعًا. فرّقي بين الترجيع البسيط والقيء المتكرر، واسألي عن عدد المرات، لون القيء، الرضاعة، والخمول، ثم قدمي خطوات آمنة للسوائل والمتابعة ومتى يلزم الطبيب.",
    );
  }

  const diarrheaPatterns = [/\b(diarrhea|diarrhoea|loose stool|watery stool)\b/i, /(إسهال|براز سائل|براز مائي|يعمل كتير)/i];
  if (includesAny(message, diarrheaPatterns)) {
    detectedTopics.push("diarrhea");
    extraSystemHints.push(
      "المستخدم يصف إسهالًا. ركّزي على الترطيب، عدد مرات الإخراج، وجود دم أو مخاط، الحرارة، وعدد الحفاضات المبللة، ثم اذكري علامات الجفاف بوضوح.",
    );
  }

  const coughPatterns = [/\b(cough|coughing|cold|runny nose|blocked nose)\b/i, /(كحة|سعال|برد|رشح|زكام|انسداد الانف|الأنف)/i];
  if (includesAny(message, coughPatterns)) {
    detectedTopics.push("cough");
    extraSystemHints.push(
      "المستخدم يصف كحة أو بردًا. أعطي خطوات منزلية آمنة مثل تنظيف الأنف والترطيب وتقليل المهيجات، واسألي عن صعوبة التنفس أو الحرارة أو العمر إذا لزم.",
    );
  }

  const breathingPatterns = [/\b(wheezing|fast breathing|breathing hard|shortness of breath)\b/i, /(نهجان|صفير|تنفس سريع|بيتنفس بصعوبة|صدره|كتمة)/i];
  if (includesAny(message, breathingPatterns)) {
    detectedTopics.push("breathing");
    extraSystemHints.push(
      "المستخدم يصف عرضًا تنفسيًا. ابدئي سريعًا بتقدير الشدة، واذكري بوضوح علامات الخطر التنفسي التي تستلزم تقييمًا عاجلًا.",
    );
  }

  const rashPatterns = [/\b(rash|spots|redness|allergy|hives)\b/i, /(طفح|حساسية|حبوب|بقع|احمرار|ارتكاريا)/i];
  if (includesAny(message, rashPatterns)) {
    detectedTopics.push("rash");
    extraSystemHints.push(
      "المستخدم يصف طفحًا أو حساسية. اطلبي وصف الشكل والمكان ووجود حرارة أو حكة أو تورم، مع التنبيه إذا كان الطفح منتشرًا بسرعة أو مصحوبًا بصعوبة تنفس.",
    );
  }

  const dehydrationPatterns = [/\b(dehydration|dry mouth|sunken eyes|few wet diapers)\b/i, /(جفاف|فمه ناشف|عينه غائرة|حفاضات قليلة|مفيش بول)/i];
  if (includesAny(message, dehydrationPatterns)) {
    detectedTopics.push("dehydration");
    extraSystemHints.push(
      "المستخدم يذكر علامات جفاف. تحدثي بوضوح عن الترطيب، عدد الحفاضات، الخمول، وجفاف الفم، وارفعي مستوى التحذير إذا كانت العلامات متعددة أو الطفل صغيرًا.",
    );
  }

  const teethingPatterns = [/\b(teething|teeth|gum pain)\b/i, /(تسنين|اسنان|أسنان|لثة|اللثة)/i];
  if (includesAny(message, teethingPatterns)) {
    detectedTopics.push("teething");
    extraSystemHints.push(
      "المستخدم يتحدث عن التسنين. وضحي أعراض التسنين الشائعة، وما لا يُنسب له عادة، وقدمي وسائل تهدئة آمنة ومختصرة.",
    );
  }

  const medicationPatterns = [/\b(paracetamol|acetaminophen|ibuprofen|medicine|dose|dosage)\b/i, /(دواء|جرعة|باراسيتامول|سيتال|بروفين|خافض حرارة)/i];
  if (includesAny(message, medicationPatterns)) {
    detectedTopics.push("medication");
    extraSystemHints.push(
      "المستخدم يسأل عن دواء أو جرعة. لا تعطي جرعة رقمية إلا إذا كانت معطاة من طبيب أو كانت البيانات واضحة جدًا، وفضلي طلب العمر والوزن واسم الدواء والتنبيه لضرورة مراجعة النشرة أو الطبيب.",
    );
  }

  const agePattern = /\b(\d+)\s*(day|days|week|weeks|month|months|year|years)\b/i;
  const arabicAgePattern = /(\d+)\s*(يوم|ايام|أيام|أسبوع|اسبوع|أسابيع|شهر|شهور|سنة|سنين)/i;
  if (!agePattern.test(message) && !arabicAgePattern.test(message)) {
    extraSystemHints.push(
      "إذا كان العمر مهمًا للقرار، اسألي سؤال متابعة واحدًا قصيرًا عن عمر الطفل قبل التفاصيل الدقيقة.",
    );
  }

  return {
    directReply: null,
    extraSystemHints,
    detectedTopics,
  };
}

export function buildLocalFallbackReply(message: string, detectedTopics: string[]) {
  const normalized = normalizeText(message);

  if (detectedTopics.includes("pain")) {
    return "لو الطفل عنده ألم أو مغص، ابدئي بفحص سريع: آخر رضعة، التجشؤ، الحفاض، وجود انتفاخ أو غازات، والحرارة. جرّبي حمله في وضع مستقيم، تدليكًا خفيفًا للبطن، وتقليل التحفيز حوله. لو الألم شديد جدًا أو معه قيء متكرر أو حرارة أو خمول أو البطن منتفخة بشكل واضح، يلزم مراجعة طبية بسرعة.";
  }

  if (detectedTopics.includes("vomiting")) {
    return "إذا كان الطفل يرجع أو يقيء، اكتبي عمره وعدد مرات القيء وهل يستطيع الاحتفاظ بالرضاعة. الترجيع البسيط بعد الرضعة يختلف عن القيء المتكرر. لو القيء متكرر أو أخضر أو مصحوب بخمول أو جفاف أو رفض رضاعة، يلزم تقييم طبي سريع.";
  }

  if (detectedTopics.includes("diarrhea")) {
    return "في الإسهال، أهم شيء الآن هو الترطيب ومتابعة عدد الحفاضات المبللة. اكتبي عمر الطفل وعدد مرات الإخراج وهل يوجد حرارة أو دم أو قيء. لو ظهرت علامات جفاف أو خمول أو قلة بول، يحتاج الأمر مراجعة طبية.";
  }

  if (detectedTopics.includes("breathing")) {
    return "إذا كان هناك صعوبة تنفس أو تنفس سريع أو صفير، راقبي هل يوجد زرقة أو انكماش بالصدر أو صعوبة في الرضاعة أو خمول. هذه الأعراض قد تحتاج تقييمًا عاجلًا، خاصة عند الأطفال الصغار.";
  }

  if (detectedTopics.includes("cough")) {
    return "للكحة أو البرد، جرّبي تنظيف الأنف بمحلول ملحي، ترطيب الجو، والرضعات الصغيرة المتكررة. اكتبي عمر الطفل وهل توجد حرارة أو صعوبة تنفس أو كحة شديدة مستمرة حتى أوجّهك أدق.";
  }

  if (detectedTopics.includes("rash")) {
    return "في الطفح أو الحساسية، اكتبي شكل الطفح ومكانه وهل معه حرارة أو حكة أو تورم. إذا كان ينتشر بسرعة أو معه صعوبة تنفس أو تورم في الوجه، فهذا يحتاج تقييمًا عاجلًا.";
  }

  if (detectedTopics.includes("dehydration")) {
    return "إذا كنت تشكين في الجفاف، راقبي الحفاضات المبللة، نشاط الطفل، رطوبة الفم، والدموع عند البكاء. قلة البول مع خمول أو جفاف الفم أو رفض الرضاعة علامات مقلقة وتحتاج مراجعة طبية بسرعة.";
  }

  if (detectedTopics.includes("teething")) {
    return "أعراض التسنين غالبًا تشمل انزعاجًا خفيفًا، عضّ الأشياء، وزيادة اللعاب. يمكن تهدئة اللثة بعضاضة آمنة باردة أو تدليك لطيف. إذا كانت الأعراض شديدة جدًا أو معها حرارة عالية أو خمول، فغالبًا هناك سبب آخر ويحتاج تقييم.";
  }

  if (detectedTopics.includes("medication")) {
    return "قبل أي دواء، اكتبي عمر الطفل ووزنه واسم الدواء بالتحديد والسبب الذي تريدين إعطاءه من أجله. في الأطفال، الجرعات تحتاج دقة ولا يفضّل التخمين أو استخدام دواء بدون بيانات واضحة.";
  }

  if (detectedTopics.includes("feeding")) {
    return "في الرضاعة، ابدئي بعمر الطفل، آخر رضعة، كمية الرضاعة أو جودة الالتقام، التجشؤ، وعدد الحفاضات المبللة. إذا كان الطفل ضعيفًا أو يرفض الرضاعة أو يتقيأ كثيرًا أو الحفاضات قليلة جدًا، فهذه تحتاج مراجعة طبية.";
  }

  if (detectedTopics.includes("sleep")) {
    return "للنوم، جرّبي روتينًا هادئًا: رضعة إذا لزم، تجشؤ، إضاءة منخفضة، هز خفيف، وغرفة هادئة. احرصي على نوم الطفل على ظهره فوق سطح ثابت، واكتبي لي عمره ووقت الاستيقاظ المتكرر حتى أوجّهك بدقة أكبر.";
  }

  if (detectedTopics.includes("fever")) {
    return "اكتبي عمر الطفل ودرجة الحرارة الدقيقة. عمومًا إذا كان الطفل صغيرًا جدًا أو لديه صعوبة تنفس أو رفض رضاعة أو قيء متكرر أو خمول غير معتاد أو علامات جفاف، فهذه تحتاج تقييمًا طبيًا سريعًا.";
  }

  if (detectedTopics.includes("diaper")) {
    return "اكتبي عمر الطفل وهل المشكلة في البول أو البراز أو الإمساك أو الإسهال. عدد الحفاضات، نشاط الطفل، الرضاعة، ولون البراز كلها مهمة لتحديد إن كان هذا طبيعيًا أو يحتاج متابعة.";
  }

  if (detectedTopics.includes("crying")) {
    return "ابدئي بفحص سريع لأسباب البكاء: الجوع، الحفاض، التجشؤ، الغازات، الحرارة، النوم، أو التحفيز الزائد. إذا لم يهدأ الطفل إطلاقًا أو عنده حرارة أو صعوبة تنفس أو قيء أو رفض رضاعة أو خمول، فهذه تحتاج مراجعة طبية.";
  }

  if (normalized.length < 50) {
    return "أقدر أساعدك في البكاء، الرضاعة، النوم، الحفاضات، وعلامات الخطر الأساسية. اكتبي عمر الطفل وما الذي يحدث بالتحديد وسأرشدك خطوة بخطوة.";
  }

  return "أقدر أساعدك حتى لو الخدمة الذكية غير متاحة الآن. اكتبي عمر الطفل، العَرَض الأساسي، متى بدأ، حالة الرضاعة، عدد الحفاضات، درجة الحرارة إن وجدت، وهل يوجد صعوبة تنفس أو خمول غير معتاد.";
}
