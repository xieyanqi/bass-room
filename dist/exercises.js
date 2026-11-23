export const STEPS_PER_BEAT = 4;
export const STEPS_PER_BAR = 16;
export const strings = [
  {name: "G", midi: 43},
  {name: "D", midi: 38},
  {name: "A", midi: 33},
  {name: "E", midi: 28}
];

export const exercises = [
  {
    id: "steady-eighths", group: "基础节奏", icon: "♪", name: "八分音符稳拍",
    level: "入门", style: "基础节奏", focus: "均匀拨弦", bpm: 76,
    description: "用空弦和低把位，把每拍拆成两下。",
    tip: "嘴里数「1 & 2 & 3 & 4 &」，让数字和 & 听起来一样均匀。换弦时，记得把上一根弦消音。",
    bars: [
      [[0,2,3,0],[2,2,3,0],[4,2,3,3],[6,2,3,3],[8,2,2,0],[10,2,2,0],[12,2,2,2],[14,2,2,2]],
      [[0,2,2,3],[2,2,2,3],[4,2,2,2],[6,2,2,2],[8,2,2,0],[10,2,2,0],[12,2,3,3],[14,2,3,0]]
    ]
  },
  {
    id: "quarter-notes", group: "基础节奏", icon: "♩", name: "四分音符与换弦",
    level: "入门", style: "基础节奏", focus: "踩稳正拍", bpm: 66,
    description: "每拍拨一次，练习在 E、A、D 三根弦之间移动。",
    tip: "用脚打四分拍。每个音响满一拍，等下一拍亮起再换音。",
    bars: [
      [[0,4,3,0],[4,4,3,3],[8,4,2,0],[12,4,2,3]],
      [[0,4,1,0],[4,4,2,3],[8,4,2,0],[12,4,3,3]]
    ]
  },
  {
    id: "eighth-rests", group: "基础节奏", icon: "·", name: "八分音符与休止",
    level: "入门+", style: "基础节奏", focus: "主动消音", bpm: 68,
    description: "在八分音符之间留空，练习及时切断声音。",
    tip: "遇到 R 时继续数拍，用左手放松压力或用右手轻触弦。空弦也需要消音。",
    bars: [
      [[0,2,3,0],[2,2],[4,2,3,0],[6,2,3,3],[8,2],[10,2,2,0],[12,2,2,2],[14,2]],
      [[0,2,2,3],[2,2],[4,2],[6,2,2,2],[8,2,2,0],[10,2],[12,2,3,3],[14,2,3,0]]
    ]
  },
  {
    id: "verse", group: "日摇 / J-pop", icon: "≋", name: "日摇主歌 · 根音推进",
    level: "入门+", style: "日摇", focus: "根音与五度", bpm: 88,
    description: "用八分根音推动主歌，在小节末加一个五度音。",
    tip: "先把第 1 小节单独循环。第 4 拍从 A 弦跨到 D 弦，落指要跟点击声对齐。",
    bars: [
      [[0,2,2,3],[2,2,2,3],[4,2,2,3],[6,2,2,3],[8,2,2,3],[10,2,2,3],[12,2,1,5],[14,2,2,3]],
      [[0,2,3,3],[2,2,3,3],[4,2,3,3],[6,2,3,3],[8,2,3,3],[10,2,3,3],[12,2,2,5],[14,2,2,2]]
    ]
  },
  {
    id: "chorus", group: "日摇 / J-pop", icon: "◆", name: "J-pop 副歌 · 反拍进句",
    level: "进阶", style: "J-pop", focus: "反拍与切分", bpm: 82,
    description: "在第 2 拍后半拍落音，把音延续过第 3 拍。",
    tip: "脚一直踩正拍，手在「2 &」的 & 落音。第 3 拍亮起时保持原音，等「3 &」再拨一次。",
    bars: [
      [[0,4,2,3],[4,2],[6,4,2,3],[10,2,1,2],[12,2,1,5],[14,2,1,2]],
      [[0,4,3,3],[4,2],[6,4,3,3],[10,2,2,2],[12,2,2,5],[14,2,2,2]]
    ]
  },
  {
    id: "turnaround", group: "日摇 / J-pop", icon: "♫", name: "日摇过门 · 十六分填句",
    level: "进阶", style: "日摇", focus: "短句与交替拨弦", bpm: 72,
    description: "前面保留长音，在第 2 小节末用四个十六分音符回到开头。",
    tip: "先单练第 2 小节。最后一拍数「4 e & a」，食指和中指交替，四个音各占四分之一拍。",
    bars: [
      [[0,8,2,0],[8,4,2,2],[12,2,2,3],[14,2,2,2]],
      [[0,4,3,3],[4,4,3,0],[8,4,3,3],[12,1,3,3],[13,1,3,5],[14,1,2,2],[15,1,2,3]]
    ]
  }
];

exercises.push({
  id: "verse-to-chorus", group: "日摇 / J-pop", icon: "♬", name: "站台灯亮了 · 主歌接副歌",
  level: "进阶", style: "原创日摇 / J-pop", focus: "六小节段落衔接", bpm: 72,
  sections: ["主歌", "主歌", "过门", "副歌", "副歌", "副歌"],
  description: "六小节原创段落。先弹稳主歌的根音，再经过半拍休止和十六分过门进入副歌。",
  tip: "先选第 3 小节最后一拍到第 4 小节第 2 拍。进入副歌后，反拍拨出的音要跨过下一整拍的起点。",
  bars: [
    [[0,2,3,0],[2,2,3,0],[4,2,3,0],[6,2,3,0],[8,2,2,2],[10,2,3,0],[12,2,2,2],[14,2,3,0]],
    [[0,2,2,3],[2,2,2,3],[4,2,2,3],[6,2,2,3],[8,2,1,5],[10,2,2,3],[12,2,2,3],[14,2]],
    [[0,4,3,3],[4,4,3,3],[8,4,2,2],[12,1,2,2],[13,1,2,3],[14,1,2,5],[15,1,2,6]],
    [[0,4,3,0],[4,2],[6,4,2,2],[10,2,3,0],[12,2,1,2],[14,2,2,2]],
    [[0,4,2,3],[4,2],[6,4,1,5],[10,2,2,3],[12,2,0,5],[14,2,1,5]],
    [[0,4,3,3],[4,4,2,5],[8,4,3,2],[12,2,3,2],[14,2]]
  ]
});

export const rhythms = [
  {id: "written", name: "谱例原节奏"},
  {id: "quarter", name: "四分音符", pattern: [[4],[4],[4],[4]]},
  {id: "eighth", name: "八分音符", pattern: [[2],[2],[2],[2],[2],[2],[2],[2]]},
  {id: "rest", name: "八分含休止", pattern: [[2],[2,true],[2],[2],[2,true],[2],[2],[2,true]]},
  {id: "offbeat", name: "反拍切分", pattern: [[4],[2,true],[4],[2],[2],[2]]},
  {id: "sixteenth", name: "十六分填句", pattern: [[4],[4],[2],[2],[1],[1],[1],[1]]}
];

export function makeBars(exercise, rhythmId) {
  const rhythm = rhythms.find(item => item.id === rhythmId);
  if (!rhythm?.pattern) return exercise.bars;

  // Follow each bar's melodic order at the chosen rhythm, stretching or thinning the notes as needed.
  return exercise.bars.map(bar => {
    const notes = bar.filter(event => event.length === 4);
    if (!notes.length) return bar;
    const noteCount = rhythm.pattern.filter(([, rest]) => !rest).length;
    let step = 0;
    let played = 0;
    return rhythm.pattern.map(([length, rest]) => {
      const event = [step, length];
      step += length;
      if (!rest) {
        const index = noteCount > 1 ? Math.round(played * (notes.length - 1) / (noteCount - 1)) : 0;
        event.push(...notes[index].slice(2));
        played++;
      }
      return event;
    });
  });
}

export const durationNames = {1: "十六分音符", 2: "八分音符", 4: "四分音符", 8: "二分音符", 16: "全音符"};
