// lib/omikuji-content.ts
// 初詣おみくじの運勢コンテンツ（純粋データ＋抽選ロジック。Firestore には触れない）。
//
// - 運勢は神社のおみくじの本格的な12段階（大吉→大凶）。
//   配合は「吉系7割・凶系3割」で、実在の神社のおみくじ（凶が約3割）
//   に近い配分にしてある。
// - 各運勢に総合コメントと内訳（金運・恋愛運・健康運・仕事運。
//   各5段階の指数＋短文）、ラッキーアイテム、ラッキーカラーを持つ。
// - 文面は4言語（ja/en/zh/ko）をここで持ち、参拝者画面の言語で引く。
//   画面の固定文（ボタン等）は lib/ui-text.ts 側の担当。

import type { Locale } from './i18n';

/** 運勢の段階（良い順）。 */
export const OMIKUJI_GRADES = [
  'daikichi',
  'chukichi',
  'shokichi',
  'kichi',
  'hankichi',
  'suekichi',
  'sueshokichi',
  'kyo',
  'shokyo',
  'hankyo',
  'suekyo',
  'daikyo',
] as const;

export type OmikujiGrade = (typeof OMIKUJI_GRADES)[number];

export function isOmikujiGrade(value: unknown): value is OmikujiGrade {
  return (
    typeof value === 'string' &&
    (OMIKUJI_GRADES as readonly string[]).includes(value)
  );
}

/** 羊の反応の種類。運勢の帯ごとに決まる。 */
export type SheepReaction = 'rejoice' | 'happy' | 'calm' | 'solemn' | 'daikyo';

export type FortuneCategory = 'money' | 'love' | 'health' | 'work';

export const FORTUNE_CATEGORIES: readonly FortuneCategory[] = [
  'money',
  'love',
  'health',
  'work',
];

export interface CategoryFortune {
  /** 運気の指数（1〜5）。画面では星の数で出す。 */
  level: number;
  text: Record<Locale, string>;
}

export interface OmikujiGradeContent {
  name: Record<Locale, string>;
  /** 抽選の重み（全運勢の合計が100になるよう配分）。 */
  weight: number;
  reaction: SheepReaction;
  overall: Record<Locale, string>;
  categories: Record<FortuneCategory, CategoryFortune>;
  luckyItem: Record<Locale, string>;
  luckyColor: Record<Locale, string>;
}

export const OMIKUJI_CONTENT: Record<OmikujiGrade, OmikujiGradeContent> = {
  daikichi: {
    name: { ja: '大吉', en: 'Great Blessing', zh: '大吉', ko: '대길' },
    weight: 12,
    reaction: 'rejoice',
    overall: {
      ja: '何事も思いのままに進む一年。願いは叶い、努力は実を結びます。',
      en: 'A year when everything goes your way. Wishes come true and efforts bear fruit.',
      zh: '万事顺遂的一年。心愿可成，努力有果。',
      ko: '모든 일이 뜻대로 풀리는 한 해. 소원이 이루어지고 노력이 결실을 맺습니다.',
    },
    categories: {
      money: {
        level: 5,
        text: {
          ja: '思わぬ収入の予感。ただし浮かれての散財は禁物です。',
          en: 'Unexpected income may come. Just avoid splurging in your excitement.',
          zh: '或有意外之财。切忌得意忘形而挥霍。',
          ko: '뜻밖의 수입이 있을지도. 들떠서 낭비하지 않도록 주의하세요.',
        },
      },
      love: {
        level: 5,
        text: {
          ja: '良縁に恵まれます。素直な気持ちが相手の心を開きます。',
          en: 'Blessed with good connections. Honest feelings will open hearts.',
          zh: '良缘将至。真诚待人，自能打动对方。',
          ko: '좋은 인연을 만나는 운세. 솔직한 마음이 상대의 마음을 엽니다.',
        },
      },
      health: {
        level: 5,
        text: {
          ja: '心身ともに充実。無理のしすぎにだけ注意を。',
          en: 'Sound in body and mind. Just beware of overdoing it.',
          zh: '身心俱佳。唯需注意勿过度劳累。',
          ko: '몸과 마음 모두 충실합니다. 무리만 하지 않도록 주의하세요.',
        },
      },
      work: {
        level: 5,
        text: {
          ja: '大きな仕事を任されそう。自信を持って引き受けて吉。',
          en: 'You may be entrusted with something big. Accept with confidence.',
          zh: '或被委以重任。自信接受为吉。',
          ko: '큰 일을 맡을 수 있습니다. 자신감을 갖고 받아들이면 길합니다.',
        },
      },
    },
    luckyItem: { ja: '新しい財布', en: 'A new wallet', zh: '新钱包', ko: '새 지갑' },
    luckyColor: { ja: '金色', en: 'Gold', zh: '金色', ko: '금색' },
  },
  chukichi: {
    name: { ja: '中吉', en: 'Middle Blessing', zh: '中吉', ko: '중길' },
    weight: 10,
    reaction: 'happy',
    overall: {
      ja: '運気は上向き。焦らず進めば望みは叶います。',
      en: 'Fortune is rising. Move without haste and your hopes will be fulfilled.',
      zh: '运势上扬。不急不躁，心愿可达。',
      ko: '운이 상승하는 중. 서두르지 않으면 소원이 이루어집니다.',
    },
    categories: {
      money: {
        level: 4,
        text: {
          ja: '計画的な使い方で金運安定。臨時収入も期待できます。',
          en: 'Planned spending keeps finances steady. A windfall is possible.',
          zh: '用度有计划则财运稳。亦可期待临时收入。',
          ko: '계획적인 소비로 재물운 안정. 임시 수입도 기대할 수 있습니다.',
        },
      },
      love: {
        level: 4,
        text: {
          ja: '穏やかな進展あり。連絡をこまめにすると吉。',
          en: 'Gentle progress. Staying in touch brings luck.',
          zh: '进展平稳。多联系则更吉。',
          ko: '잔잔한 진전이 있습니다. 자주 연락하면 길합니다.',
        },
      },
      health: {
        level: 5,
        text: {
          ja: '体調は良好。規則正しい生活が運気を支えます。',
          en: 'In good shape. A regular rhythm supports your fortune.',
          zh: '身体状况良好。作息规律可助运势。',
          ko: '컨디션 양호. 규칙적인 생활이 운을 돕습니다.',
        },
      },
      work: {
        level: 4,
        text: {
          ja: '周囲との協力が成果に。謙虚さが評価されます。',
          en: 'Cooperation brings results. Humility will be valued.',
          zh: '与人合作易出成果。谦逊会受好评。',
          ko: '주변과의 협력이 성과로. 겸손함이 평가받습니다.',
        },
      },
    },
    luckyItem: { ja: '手帳', en: 'A planner', zh: '记事本', ko: '다이어리' },
    luckyColor: { ja: '紺色', en: 'Navy', zh: '藏青色', ko: '남색' },
  },
  shokichi: {
    name: { ja: '小吉', en: 'Small Blessing', zh: '小吉', ko: '소길' },
    weight: 10,
    reaction: 'happy',
    overall: {
      ja: '小さな幸運が積み重なる運勢。日々を大切に。',
      en: 'Small blessings pile up. Cherish each day.',
      zh: '小吉积累成福。珍惜每一天。',
      ko: '작은 행운이 쌓이는 운세. 하루하루를 소중히.',
    },
    categories: {
      money: {
        level: 4,
        text: {
          ja: '小さな得が続きます。貯める習慣が実を結びます。',
          en: 'Small gains continue. Saving habits will pay off.',
          zh: '小利不断。储蓄习惯终有回报。',
          ko: '작은 이득이 이어집니다. 저축 습관이 결실을 맺습니다.',
        },
      },
      love: {
        level: 3,
        text: {
          ja: '進展はゆっくり。焦らず相手を知る時間を持って。',
          en: 'Progress is slow. Take time to know each other.',
          zh: '进展缓慢。多花时间了解对方。',
          ko: '진전은 천천히. 서로를 알아가는 시간을 가지세요.',
        },
      },
      health: {
        level: 4,
        text: {
          ja: '概ね良好。冷えと睡眠不足に注意。',
          en: 'Mostly well. Watch out for chills and lack of sleep.',
          zh: '大体良好。注意保暖与睡眠。',
          ko: '대체로 양호. 추위와 수면 부족에 주의.',
        },
      },
      work: {
        level: 4,
        text: {
          ja: '地道な努力が認められます。基本を疎かにしないこと。',
          en: "Steady effort will be recognized. Don't neglect the basics.",
          zh: '踏实努力会被认可。勿忽视基础。',
          ko: '꾸준한 노력이 인정받습니다. 기본을 소홀히 하지 마세요.',
        },
      },
    },
    luckyItem: { ja: 'ハンカチ', en: 'A handkerchief', zh: '手帕', ko: '손수건' },
    luckyColor: { ja: '若草色', en: 'Light green', zh: '嫩绿色', ko: '연두색' },
  },
  kichi: {
    name: { ja: '吉', en: 'Blessing', zh: '吉', ko: '길' },
    weight: 18,
    reaction: 'happy',
    overall: {
      ja: '穏やかで安定した運気。平常心が幸運を呼びます。',
      en: 'Calm and stable fortune. A composed mind invites luck.',
      zh: '运势平稳。平常心可招福。',
      ko: '평온하고 안정된 운세. 평상심이 행운을 부릅니다.',
    },
    categories: {
      money: {
        level: 4,
        text: {
          ja: '収支は安定。無駄遣いを控えれば余裕が生まれます。',
          en: "Income and spending are balanced. Curb waste and you'll have room to breathe.",
          zh: '收支稳定。节制浪费则更宽裕。',
          ko: '수입과 지출이 안정. 낭비를 줄이면 여유가 생깁니다.',
        },
      },
      love: {
        level: 4,
        text: {
          ja: '良い出会いの気配。笑顔を忘れずに。',
          en: 'Signs of a good encounter. Keep smiling.',
          zh: '有良缘之兆。保持微笑。',
          ko: '좋은 만남의 기운. 미소를 잊지 마세요.',
        },
      },
      health: {
        level: 4,
        text: {
          ja: '大きな崩れなし。適度な運動が吉。',
          en: 'No major troubles. Moderate exercise helps.',
          zh: '无大碍。适度运动为吉。',
          ko: '큰 무리 없음. 적당한 운동이 길합니다.',
        },
      },
      work: {
        level: 3,
        text: {
          ja: '現状維持が無難。新しい挑戦は準備を整えてから。',
          en: 'Keeping steady is wise. Prepare well before new challenges.',
          zh: '维持现状为宜。新挑战先做好准备。',
          ko: '현상 유지가 무난. 새 도전은 준비를 갖추고 나서.',
        },
      },
    },
    luckyItem: { ja: 'ボールペン', en: 'A ballpoint pen', zh: '圆珠笔', ko: '볼펜' },
    luckyColor: { ja: '白色', en: 'White', zh: '白色', ko: '흰색' },
  },
  hankichi: {
    name: { ja: '半吉', en: 'Half Blessing', zh: '半吉', ko: '반길' },
    weight: 6,
    reaction: 'calm',
    overall: {
      ja: '吉と凶が半々。慎重に選べば道は開けます。',
      en: 'Half luck, half caution. Choose carefully and the path will open.',
      zh: '吉凶参半。谨慎选择，自有出路。',
      ko: '길과 흉이 반반. 신중히 고르면 길이 열립니다.',
    },
    categories: {
      money: {
        level: 3,
        text: {
          ja: '出費がかさみがち。契約ごとは内容をよく確認して。',
          en: 'Expenses tend to grow. Read contracts carefully before signing.',
          zh: '支出易增。签约前务必看清内容。',
          ko: '지출이 늘기 쉬움. 계약은 내용을 잘 확인하세요.',
        },
      },
      love: {
        level: 3,
        text: {
          ja: 'すれ違いに注意。言葉を選ぶことで円満に。',
          en: 'Mind misunderstandings. Choosing words with care keeps harmony.',
          zh: '注意言语摩擦。用词得当可保和气。',
          ko: '엇갈림에 주의. 말을 고르면 원만해집니다.',
        },
      },
      health: {
        level: 4,
        text: {
          ja: '体調は保てます。疲れを溜めない工夫を。',
          en: "You can stay well. Don't let fatigue build up.",
          zh: '体力可保。勿积劳成疾。',
          ko: '체력은 유지됩니다. 피로를 쌓지 마세요.',
        },
      },
      work: {
        level: 3,
        text: {
          ja: '判断に迷う場面あり。先輩の助言が助けになります。',
          en: 'Moments of doubt will come. Advice from seniors will help.',
          zh: '或有犹豫之时。前辈建议可作助力。',
          ko: '판단에 망설이는 장면이. 선배의 조언이 도움이 됩니다.',
        },
      },
    },
    luckyItem: { ja: '目覚まし時計', en: 'An alarm clock', zh: '闹钟', ko: '알람시계' },
    luckyColor: { ja: '灰色', en: 'Gray', zh: '灰色', ko: '회색' },
  },
  suekichi: {
    name: { ja: '末吉', en: 'Future Blessing', zh: '末吉', ko: '말길' },
    weight: 9,
    reaction: 'calm',
    overall: {
      ja: '今は控えめでも、後半に運が開ける運勢。辛抱が実ります。',
      en: 'Quiet now, but fortune opens later. Patience will be rewarded.',
      zh: '先抑后扬之势。忍耐终有回报。',
      ko: '지금은 조용해도 후반에 운이 트이는 운세. 인내가 열매를 맺습니다.',
    },
    categories: {
      money: {
        level: 3,
        text: {
          ja: '今は守りの時期。後半に思わぬ助けがあります。',
          en: 'A time to protect what you have. Help arrives later on.',
          zh: '现宜守成。后段或有助力。',
          ko: '지금은 지킬 때. 후반에 뜻밖의 도움이 있습니다.',
        },
      },
      love: {
        level: 4,
        text: {
          ja: '時間をかけた関係が深まります。告白は後半が吉。',
          en: 'Relationships deepen over time. Later is better for confessions.',
          zh: '感情需时日培养。表白宜在后段。',
          ko: '시간을 들인 관계가 깊어집니다. 고백은 후반이 길.',
        },
      },
      health: {
        level: 3,
        text: {
          ja: '無理は禁物。休むことも仕事のうちです。',
          en: "Don't push yourself. Rest is part of the work.",
          zh: '切勿勉强。休息也是要事。',
          ko: '무리는 금물. 쉬는 것도 일의 일부입니다.',
        },
      },
      work: {
        level: 3,
        text: {
          ja: '地道な下準備が後の成功に。焦らないこと。',
          en: "Quiet groundwork leads to later success. Don't rush.",
          zh: '默默打基础，后必有成。勿急。',
          ko: '조용한 준비가 후의 성공으로. 서두르지 마세요.',
        },
      },
    },
    luckyItem: { ja: '湯呑み', en: 'A teacup', zh: '茶杯', ko: '찻잔' },
    luckyColor: { ja: '茶色', en: 'Brown', zh: '茶色', ko: '갈색' },
  },
  sueshokichi: {
    name: { ja: '末小吉', en: 'Future Small Blessing', zh: '末小吉', ko: '말소길' },
    weight: 5,
    reaction: 'calm',
    overall: {
      ja: '小さな吉が終わりに待つ運勢。最後まで気を抜かずに。',
      en: 'A small blessing waits at the end. Stay focused to the finish.',
      zh: '小吉在末尾等候。坚持到底为要。',
      ko: '작은 길이 끝에 기다리는 운세. 마지막까지 방심하지 마세요.',
    },
    categories: {
      money: {
        level: 3,
        text: {
          ja: '大きな動きは避けて。少額の積み立てが吉。',
          en: 'Avoid big moves. Small, steady savings bring luck.',
          zh: '避免大额动作。小额积蓄为吉。',
          ko: '큰 움직임은 피하세요. 소액 적립이 길합니다.',
        },
      },
      love: {
        level: 3,
        text: {
          ja: '出会いは身近なところに。見落とさないで。',
          en: "An encounter may be closer than you think. Don't overlook it.",
          zh: '缘分或在身边。勿错过。',
          ko: '만남은 가까운 곳에. 놓치지 마세요.',
        },
      },
      health: {
        level: 3,
        text: {
          ja: '小さな不調のサインを見逃さないこと。',
          en: "Don't ignore small signs of trouble.",
          zh: '勿忽视小不适的信号。',
          ko: '작은 이상 신호를 놓치지 마세요.',
        },
      },
      work: {
        level: 2,
        text: {
          ja: '目立つ成果は先。基礎固めに集中を。',
          en: 'Big results come later. Focus on foundations.',
          zh: '成果尚需时日。专注打基础。',
          ko: '눈에 띄는 성과는 아직. 기초 다지기에 집중.',
        },
      },
    },
    luckyItem: { ja: '栞（しおり）', en: 'A bookmark', zh: '书签', ko: '책갈피' },
    luckyColor: { ja: '水色', en: 'Light blue', zh: '浅蓝色', ko: '하늘색' },
  },
  kyo: {
    name: { ja: '凶', en: 'Curse', zh: '凶', ko: '흉' },
    weight: 12,
    reaction: 'solemn',
    overall: {
      ja: '今は耐える時期。無理に動かず、静かに備えましょう。',
      en: "A time to endure. Don't force movement; prepare quietly.",
      zh: '宜忍耐之时。勿强行行动，静心准备。',
      ko: '지금은 견디는 시기. 무리하게 움직이지 말고 조용히 준비하세요.',
    },
    categories: {
      money: {
        level: 2,
        text: {
          ja: '思わぬ出費の暗示。財布の紐は固く。',
          en: 'Hints of unexpected expenses. Keep your purse strings tight.',
          zh: '或有意外支出。紧握钱袋。',
          ko: '뜻밖의 지출 암시. 지갑 끈을 단단히.',
        },
      },
      love: {
        level: 2,
        text: {
          ja: '言葉の行き違いに注意。聞き役に回ると吉。',
          en: 'Watch your words. Listening more brings luck.',
          zh: '注意言语分歧。多倾听为吉。',
          ko: '말의 엇갈림에 주의. 듣는 쪽에 서면 길합니다.',
        },
      },
      health: {
        level: 3,
        text: {
          ja: '休息を優先して。体からの合図を大切に。',
          en: "Prioritize rest. Heed your body's signals.",
          zh: '休息优先。倾听身体的信号。',
          ko: '휴식을 우선으로. 몸의 신호를 소중히.',
        },
      },
      work: {
        level: 2,
        text: {
          ja: '新規の話は慎重に。確認を怠らないこと。',
          en: 'Be careful with new ventures. Double-check everything.',
          zh: '新事务须慎重。反复确认。',
          ko: '새로운 일은 신중히. 확인을 게을리하지 마세요.',
        },
      },
    },
    luckyItem: { ja: 'お守り', en: 'A protective charm (omamori)', zh: '护身符', ko: '부적(오마모리)' },
    luckyColor: { ja: '深緑', en: 'Deep green', zh: '深绿色', ko: '짙은 녹색' },
  },
  shokyo: {
    name: { ja: '小凶', en: 'Small Curse', zh: '小凶', ko: '소흉' },
    weight: 6,
    reaction: 'solemn',
    overall: {
      ja: '小さなつまずきがある運勢。落ち着いて対処すれば大難は避けられます。',
      en: "Minor stumbles ahead. Stay calm and you'll avoid bigger trouble.",
      zh: '或有小挫折。冷静应对可避大难。',
      ko: '작은 걸림이 있는 운세. 침착히 대처하면 큰 화는 피할 수 있습니다.',
    },
    categories: {
      money: {
        level: 2,
        text: {
          ja: '細かい出費が重なりがち。家計の見直しを。',
          en: 'Small expenses add up. Review your household budget.',
          zh: '小额支出易累积。检视家计。',
          ko: '자잘한 지출이 쌓이기 쉬움. 가계 점검을.',
        },
      },
      love: {
        level: 3,
        text: {
          ja: '誤解が生じやすい時期。素直な一言が鍵。',
          en: 'Misunderstandings are likely. One honest word is the key.',
          zh: '易生误会。一句真心话是关键。',
          ko: '오해가 생기기 쉬운 시기. 솔직한 한마디가 열쇠.',
        },
      },
      health: {
        level: 2,
        text: {
          ja: '疲れが出やすい頃。早めの就寝を心がけて。',
          en: 'Fatigue comes easily. Try to sleep early.',
          zh: '易感疲劳。尽量早睡。',
          ko: '피로가 쌓이기 쉬운 때. 일찍 자도록 노력하세요.',
        },
      },
      work: {
        level: 2,
        text: {
          ja: 'ミスに注意。チェックは二重に。',
          en: 'Beware of mistakes. Check everything twice.',
          zh: '小心失误。双重检查。',
          ko: '실수에 주의. 확인은 두 번씩.',
        },
      },
    },
    luckyItem: { ja: '新しい靴下', en: 'New socks', zh: '新袜子', ko: '새 양말' },
    luckyColor: { ja: '橙色', en: 'Orange', zh: '橙色', ko: '주황색' },
  },
  hankyo: {
    name: { ja: '半凶', en: 'Half Curse', zh: '半凶', ko: '반흉' },
    weight: 4,
    reaction: 'solemn',
    overall: {
      ja: '運気は半ば曇り。大きな決断は先送りが賢明です。',
      en: 'Fortune is half-clouded. Postponing big decisions is wise.',
      zh: '运势半阴。重大决定宜暂缓。',
      ko: '운이 반쯤 흐린 상태. 큰 결정은 미루는 것이 현명합니다.',
    },
    categories: {
      money: {
        level: 2,
        text: {
          ja: '貸し借りは避けること。身の丈に合った出費を。',
          en: 'Avoid lending and borrowing. Spend within your means.',
          zh: '避免借贷。量入为出。',
          ko: '돈 거래는 피하세요. 분수에 맞는 지출을.',
        },
      },
      love: {
        level: 2,
        text: {
          ja: '相手の気持ちを決めつけないこと。対話が大切。',
          en: "Don't assume the other's feelings. Dialogue matters.",
          zh: '勿臆测对方心意。沟通为重。',
          ko: '상대의 마음을 단정하지 마세요. 대화가 중요합니다.',
        },
      },
      health: {
        level: 2,
        text: {
          ja: '冷えと暴飲暴食に注意。温かい飲み物を。',
          en: 'Beware of chills and overindulgence. Warm drinks help.',
          zh: '注意保暖与饮食节制。宜热饮。',
          ko: '추위와 폭음폭식에 주의. 따뜻한 음료를.',
        },
      },
      work: {
        level: 3,
        text: {
          ja: '守りの姿勢で乗り切れます。周囲への感謝を忘れずに。',
          en: 'A defensive stance will see you through. Remember gratitude.',
          zh: '守势可渡。勿忘感谢之心。',
          ko: '수비 자세로 버틸 수 있습니다. 주변에 대한 감사를 잊지 마세요.',
        },
      },
    },
    luckyItem: { ja: 'マフラー', en: 'A scarf', zh: '围巾', ko: '목도리' },
    luckyColor: { ja: '紫色', en: 'Purple', zh: '紫色', ko: '보라색' },
  },
  suekyo: {
    name: { ja: '末凶', en: 'Future Curse', zh: '末凶', ko: '말흉' },
    weight: 4,
    reaction: 'solemn',
    overall: {
      ja: '終わりに向けて運気が下がる暗示。早め早めの備えを。',
      en: 'Fortune declines toward the end. Prepare early and carefully.',
      zh: '运势向末渐弱。宜早作准备。',
      ko: '끝으로 갈수록 운이 내리막이라는 암시. 미리미리 대비하세요.',
    },
    categories: {
      money: {
        level: 1,
        text: {
          ja: '大きな買い物は控えて。保証や保険の確認を。',
          en: 'Hold off on big purchases. Review guarantees and insurance.',
          zh: '大额购物宜缓。检查保障与保险。',
          ko: '큰 쇼핑은 삼가세요. 보장과 보험 확인을.',
        },
      },
      love: {
        level: 2,
        text: {
          ja: '距離を置く時間も必要。追いかけすぎないこと。',
          en: "Some distance may help. Don't chase too hard.",
          zh: '适度距离亦有益。勿过度追逐。',
          ko: '거리를 두는 시간도 필요합니다. 너무 쫓지 마세요.',
        },
      },
      health: {
        level: 2,
        text: {
          ja: '定期検診の受け時。体を労わりましょう。',
          en: 'A good time for a checkup. Take care of your body.',
          zh: '宜做体检。爱护身体。',
          ko: '정기검진을 받을 때. 몸을 아끼세요.',
        },
      },
      work: {
        level: 2,
        text: {
          ja: '計画の見直し時。無理な日程は組み直して。',
          en: 'Time to revise plans. Rebuild unrealistic schedules.',
          zh: '宜修订计划。日程过紧则重排。',
          ko: '계획을 재검토할 때. 무리한 일정은 다시 짜세요.',
        },
      },
    },
    luckyItem: { ja: '傘', en: 'An umbrella', zh: '雨伞', ko: '우산' },
    luckyColor: { ja: '黒色', en: 'Black', zh: '黑色', ko: '검은색' },
  },
  daikyo: {
    name: { ja: '大凶', en: 'Great Curse', zh: '大凶', ko: '대흉' },
    weight: 4,
    reaction: 'daikyo',
    overall: {
      ja: '今は嵐の真っただ中。でも、悪い運はここで出し切ります。動かず、耐え、備えることが開運への道。',
      en: "You are in the eye of the storm — but all bad luck is spent here. Endure, prepare, and the way will open.",
      zh: '正处风暴之中，但厄运在此耗尽。忍耐与准备即是开运之道。',
      ko: '지금은 폭풍 한가운데. 하지만 나쁜 운은 여기서 다 쏟아집니다. 견디고 준비하는 것이 개운의 길.',
    },
    categories: {
      money: {
        level: 1,
        text: {
          ja: '出費は最小限に。誘惑の多い場所に近づかないこと。',
          en: 'Keep spending to a minimum. Avoid tempting places.',
          zh: '支出降至最低。远离诱惑之地。',
          ko: '지출은 최소한으로. 유혹 많은 곳에 가까이 가지 마세요.',
        },
      },
      love: {
        level: 1,
        text: {
          ja: '今は静観が吉。新しい縁は時期を待ちましょう。',
          en: 'Watch and wait. New connections should wait for a better season.',
          zh: '宜静观。新缘分待时机。',
          ko: '지금은 관망이 길. 새 인연은 때를 기다리세요.',
        },
      },
      health: {
        level: 2,
        text: {
          ja: '十分な休養を。体の声に正直に。',
          en: "Rest thoroughly. Be honest with your body's voice.",
          zh: '充分休养。诚实面对身体。',
          ko: '충분한 휴양을. 몸의 소리에 솔직해지세요.',
        },
      },
      work: {
        level: 1,
        text: {
          ja: '新規事業・転職は時期尚早。現状を守り抜くこと。',
          en: 'New ventures and job changes are premature. Hold your ground.',
          zh: '新事业与跳槽为时过早。守住现状。',
          ko: '신규 사업과 이직은 아직 이름. 현상을 지켜내세요.',
        },
      },
    },
    luckyItem: { ja: '清め塩', en: 'Purifying salt', zh: '净化盐', ko: '정화 소금' },
    luckyColor: { ja: '銀色', en: 'Silver', zh: '银色', ko: '은색' },
  },
};

/** 羊の反応セリフ（運勢の帯ごと）。 */
export const SHEEP_REACTION_LINES: Record<SheepReaction, Record<Locale, string>> = {
  rejoice: {
    ja: 'やったー！大吉だメェ！',
    en: 'Yay! Great Blessing, baa!',
    zh: '太好了！是大吉，咩！',
    ko: '야호! 대길이다 메에!',
  },
  happy: {
    ja: 'いい運勢だメェ！',
    en: 'What a good fortune, baa!',
    zh: '运气不错，咩！',
    ko: '좋은 운세다 메에!',
  },
  calm: {
    ja: 'これから良くなるメェ',
    en: 'It gets better from here, baa.',
    zh: '会越来越好的，咩。',
    ko: '앞으로 좋아질 거다 메에.',
  },
  solemn: {
    ja: '大丈夫、運はこれからだメェ',
    en: "It's alright — fortune is still ahead of you, baa.",
    zh: '没关系，好运还在后面，咩。',
    ko: '괜찮아, 운은 이제부터다 메에.',
  },
  daikyo: {
    ja: '今年の悪運使い果たした！',
    en: "You've used up all of this year's bad luck!",
    zh: '今年的厄运已经全部用光了！',
    ko: '올해의 나쁜 운은 다 써버렸어!',
  },
};

/** 全運勢の重みの合計（抽選の分母）。 */
export const OMIKUJI_TOTAL_WEIGHT = OMIKUJI_GRADES.reduce(
  (sum, grade) => sum + OMIKUJI_CONTENT[grade].weight,
  0,
);

/**
 * 重み付き抽選（純粋関数）。random は [0, 1) を返す関数（テストで差し替え可能）。
 * 境界は「累積重みを超えた時点で確定」で、random() = 0 なら最初の運勢、
 * 1 に近づくほど最後の運勢に寄る。
 */
export function drawOmikujiGrade(random: () => number = Math.random): OmikujiGrade {
  const target = random() * OMIKUJI_TOTAL_WEIGHT;
  let cumulative = 0;
  for (const grade of OMIKUJI_GRADES) {
    cumulative += OMIKUJI_CONTENT[grade].weight;
    if (target < cumulative) return grade;
  }
  return OMIKUJI_GRADES[OMIKUJI_GRADES.length - 1];
}

/** 運勢から羊の反応を引く。 */
export function reactionForGrade(grade: OmikujiGrade): SheepReaction {
  return OMIKUJI_CONTENT[grade].reaction;
}
