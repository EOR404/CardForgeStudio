import type { RegexRule } from "../schema/types";

export type RegexTestResult = {
  ruleId: string;
  ruleName: string;
  error?: string;
  matched: string[];
  before: string;
  after: string;
};

export function runRegexRule(rule: RegexRule, input: string): RegexTestResult {
  try {
    if (!rule.pattern.trim()) throw new Error("pattern 为空");
    const replaceRegex = new RegExp(rule.pattern, rule.flags);
    const matchRegex = new RegExp(rule.pattern, rule.flags.includes("g") ? rule.flags : `${rule.flags}g`);
    const matched = [...input.matchAll(matchRegex)].map((match) => match[0]);
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      matched,
      before: input,
      after: input.replace(replaceRegex, rule.replacement)
    };
  } catch (error) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      error: error instanceof Error ? error.message : String(error),
      matched: [],
      before: input,
      after: input
    };
  }
}

export function runRegexPipeline(rules: RegexRule[], input: string): RegexTestResult[] {
  const results: RegexTestResult[] = [];
  let current = input;
  for (const rule of rules.filter((item) => item.enabled).sort((a, b) => a.order - b.order)) {
    const result = runRegexRule(rule, current);
    results.push(result);
    current = result.after;
  }
  return results;
}
