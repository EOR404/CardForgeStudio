import type { WorldBookEntry, WorldBookEntryCategory } from "../schema/types";

export const worldBookCategories: Array<{ id: WorldBookEntryCategory; label: string }> = [
  { id: "character_core", label: "角色核心" },
  { id: "world_background", label: "世界背景" },
  { id: "location", label: "地点" },
  { id: "organization", label: "组织" },
  { id: "item", label: "物品" },
  { id: "rule", label: "规则" },
  { id: "route", label: "路线" },
  { id: "variable", label: "变量相关" },
  { id: "initialization", label: "初始化相关" },
  { id: "frontend", label: "前端相关" },
  { id: "hidden_control", label: "隐藏控制" },
  { id: "other", label: "其他" }
];

const categoryKeywords: Array<{ category: WorldBookEntryCategory; keywords: string[] }> = [
  { category: "frontend", keywords: ["html", "css", "javascript", "iframe", "前端", "按钮", "界面", "状态栏"] },
  { category: "variable", keywords: ["_.set", "_.assign", "变量", "好感", "信任", "状态", "flag", "hp", "任务"] },
  { category: "initialization", keywords: ["初始化", "开局", "初始", "on_card_init", "init"] },
  { category: "hidden_control", keywords: ["隐藏", "控制", "规则提示", "system", "不要透露", "不可见"] },
  { category: "rule", keywords: ["规则", "必须", "禁止", "不能", "需要遵守", "限制", "原则"] },
  { category: "organization", keywords: ["组织", "教会", "协会", "公司", "军团", "议会", "公会", "部门"] },
  { category: "location", keywords: ["地点", "城市", "村", "街", "巷", "店", "塔", "森林", "雪国", "雾城"] },
  { category: "route", keywords: ["路线", "分支", "结局", "阶段", "流程", "任务线"] },
  { category: "item", keywords: ["物品", "道具", "药", "月草", "钥匙", "武器", "信物", "提灯"] },
  { category: "character_core", keywords: ["角色", "人格", "性格", "身份", "背景", "关系", "口癖"] },
  { category: "world_background", keywords: ["世界", "历史", "传说", "背景", "生态", "时代", "文化"] }
];

export function classifyWorldBookEntry(entry: Pick<WorldBookEntry, "name" | "comment" | "keys" | "content" | "constant">): WorldBookEntryCategory {
  if (entry.constant) return "rule";
  const text = [entry.name, entry.comment, entry.keys.join(" "), entry.content].filter(Boolean).join("\n").toLowerCase();
  const match = categoryKeywords.find((item) => item.keywords.some((keyword) => text.includes(keyword.toLowerCase())));
  return match?.category ?? "other";
}

export function normalizeWorldBookCategory(value: unknown): WorldBookEntryCategory {
  if (typeof value !== "string") return "other";
  return worldBookCategories.some((item) => item.id === value) ? (value as WorldBookEntryCategory) : "other";
}

export function categoryLabel(category: WorldBookEntryCategory | undefined): string {
  return worldBookCategories.find((item) => item.id === category)?.label ?? "未分类";
}
