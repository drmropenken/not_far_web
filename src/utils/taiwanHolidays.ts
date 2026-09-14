/**
 * 台灣國定假日與連假資料表 (2025 ~ 2027)
 * 資料來源參考：行政院人事行政總處辦公日曆表及紀念日及節日實施條例修正案
 * 包含：元旦、春節、和平紀念日、清明兒童、勞動、端午、中秋、教師節、雙十國慶、臺灣光復節、行憲紀念日及週五/週一補假
 */

export type TaiwanHoliday = {
  name: string;        // 簡短顯示名稱 (如：元旦、中秋、臺灣、補假)
  fullName: string;    // 完整名稱 (如：臺灣光復節、中秋節)
  isHoliday: boolean;  // 是否為放假日
  isCompensatory?: boolean; // 是否為補假/彈性放假
};

export const TAIWAN_HOLIDAYS: Record<string, TaiwanHoliday> = {
  // ── 2025 年 ──
  '2025-01-01': { name: '元旦', fullName: '中華民國開國紀念日', isHoliday: true },
  '2025-01-25': { name: '春節', fullName: '春節連假首日', isHoliday: true },
  '2025-01-26': { name: '春節', fullName: '春節連假', isHoliday: true },
  '2025-01-27': { name: '小年夜', fullName: '農曆除夕前一日', isHoliday: true },
  '2025-01-28': { name: '除夕', fullName: '農曆除夕', isHoliday: true },
  '2025-01-29': { name: '春節', fullName: '春節（大年初一）', isHoliday: true },
  '2025-01-30': { name: '初二', fullName: '春節（大年初二）', isHoliday: true },
  '2025-01-31': { name: '初三', fullName: '春節（大年初三）', isHoliday: true },
  '2025-02-01': { name: '補假', fullName: '春節補假', isHoliday: true, isCompensatory: true },
  '2025-02-02': { name: '補假', fullName: '春節補假', isHoliday: true, isCompensatory: true },
  '2025-02-28': { name: '228', fullName: '和平紀念日', isHoliday: true },
  '2025-04-03': { name: '補假', fullName: '兒童節清明節補假', isHoliday: true, isCompensatory: true },
  '2025-04-04': { name: '兒童', fullName: '兒童節', isHoliday: true },
  '2025-04-05': { name: '清明', fullName: '民族掃墓節', isHoliday: true },
  '2025-05-01': { name: '勞動', fullName: '勞動節', isHoliday: true },
  '2025-05-30': { name: '端午', fullName: '端午節', isHoliday: true },
  '2025-09-28': { name: '教師', fullName: '孔子誕辰紀念日（教師節）', isHoliday: true },
  '2025-09-29': { name: '補假', fullName: '教師節補假', isHoliday: true, isCompensatory: true },
  '2025-10-06': { name: '中秋', fullName: '中秋節', isHoliday: true },
  '2025-10-10': { name: '國慶', fullName: '國慶日', isHoliday: true },
  '2025-10-24': { name: '補假', fullName: '臺灣光復節補假', isHoliday: true, isCompensatory: true },
  '2025-10-25': { name: '臺灣', fullName: '臺灣光復紀念日', isHoliday: true },
  '2025-12-25': { name: '行憲', fullName: '行憲紀念日', isHoliday: true },

  // ── 2026 年 (依行政院最新公布 9 個連假與補假) ──
  '2026-01-01': { name: '元旦', fullName: '開國紀念日', isHoliday: true },
  '2026-02-14': { name: '春節', fullName: '春節連假開始', isHoliday: true },
  '2026-02-15': { name: '小年夜', fullName: '農曆除夕前一日', isHoliday: true },
  '2026-02-16': { name: '除夕', fullName: '農曆除夕', isHoliday: true },
  '2026-02-17': { name: '春節', fullName: '春節初一', isHoliday: true },
  '2026-02-18': { name: '初二', fullName: '春節初二', isHoliday: true },
  '2026-02-19': { name: '初三', fullName: '春節初三', isHoliday: true },
  '2026-02-20': { name: '補假', fullName: '春節初四補假', isHoliday: true, isCompensatory: true },
  '2026-02-21': { name: '春節', fullName: '春節初五', isHoliday: true },
  '2026-02-22': { name: '春節', fullName: '春節初六', isHoliday: true },
  '2026-02-27': { name: '補假', fullName: '和平紀念日補假', isHoliday: true, isCompensatory: true },
  '2026-02-28': { name: '和平', fullName: '和平紀念日', isHoliday: true },
  '2026-04-03': { name: '補假', fullName: '兒童節補假', isHoliday: true, isCompensatory: true },
  '2026-04-04': { name: '兒童', fullName: '兒童節', isHoliday: true },
  '2026-04-05': { name: '清明', fullName: '民族掃墓節', isHoliday: true },
  '2026-04-06': { name: '補假', fullName: '清明節補假', isHoliday: true, isCompensatory: true },
  '2026-05-01': { name: '勞動', fullName: '勞動節', isHoliday: true },
  '2026-06-19': { name: '端午', fullName: '端午節', isHoliday: true },
  '2026-09-25': { name: '中秋', fullName: '中秋節', isHoliday: true },
  '2026-09-28': { name: '教師', fullName: '教師節', isHoliday: true },
  '2026-10-09': { name: '補假', fullName: '國慶日補假', isHoliday: true, isCompensatory: true },
  '2026-10-10': { name: '國慶', fullName: '國慶日', isHoliday: true },
  '2026-10-24': { name: '光復', fullName: '臺灣光復節連假', isHoliday: true },
  '2026-10-25': { name: '臺灣', fullName: '臺灣光復紀念日', isHoliday: true },
  '2026-10-26': { name: '補假', fullName: '臺灣光復節補假', isHoliday: true, isCompensatory: true },
  '2026-12-25': { name: '行憲', fullName: '行憲紀念日', isHoliday: true },

  // ── 2027 年 ──
  '2027-01-01': { name: '元旦', fullName: '開國紀念日', isHoliday: true },
  '2027-02-05': { name: '小年夜', fullName: '春節小年夜', isHoliday: true },
  '2027-02-06': { name: '除夕', fullName: '農曆除夕', isHoliday: true },
  '2027-02-07': { name: '春節', fullName: '春節初一', isHoliday: true },
  '2027-02-08': { name: '初二', fullName: '春節初二', isHoliday: true },
  '2027-02-09': { name: '初三', fullName: '春節初三', isHoliday: true },
  '2027-02-10': { name: '補假', fullName: '春節初四補假', isHoliday: true, isCompensatory: true },
  '2027-02-11': { name: '補假', fullName: '春節初五補假', isHoliday: true, isCompensatory: true },
  '2027-02-28': { name: '和平', fullName: '和平紀念日', isHoliday: true },
  '2027-03-01': { name: '補假', fullName: '和平紀念日補假', isHoliday: true, isCompensatory: true },
  '2027-04-02': { name: '補假', fullName: '兒童節補假', isHoliday: true, isCompensatory: true },
  '2027-04-04': { name: '兒童', fullName: '兒童節', isHoliday: true },
  '2027-04-05': { name: '清明', fullName: '民族掃墓節', isHoliday: true },
  '2027-04-06': { name: '補假', fullName: '清明節補假', isHoliday: true, isCompensatory: true },
  '2027-04-30': { name: '補假', fullName: '勞動節補假', isHoliday: true, isCompensatory: true },
  '2027-05-01': { name: '勞動', fullName: '勞動節', isHoliday: true },
  '2027-06-09': { name: '端午', fullName: '端午節', isHoliday: true },
  '2027-09-15': { name: '中秋', fullName: '中秋節', isHoliday: true },
  '2027-09-28': { name: '教師', fullName: '教師節', isHoliday: true },
  '2027-10-10': { name: '國慶', fullName: '國慶日', isHoliday: true },
  '2027-10-11': { name: '補假', fullName: '國慶日補假', isHoliday: true, isCompensatory: true },
  '2027-10-25': { name: '臺灣', fullName: '臺灣光復紀念日', isHoliday: true },
  '2027-12-24': { name: '補假', fullName: '行憲紀念日補假', isHoliday: true, isCompensatory: true },
  '2027-12-25': { name: '行憲', fullName: '行憲紀念日', isHoliday: true }
};

/**
 * 取得指定日期的台灣國定假日資訊
 * @param dateStr 格式 'YYYY-MM-DD'
 */
export const getTaiwanHoliday = (dateStr: string): TaiwanHoliday | null => {
  if (!dateStr) return null;
  return TAIWAN_HOLIDAYS[dateStr] || null;
};
