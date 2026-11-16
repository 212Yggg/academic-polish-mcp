export interface ProtectedTokens {
  citations: string[];
  numbers: string[];
  formulas: string[];
  urls: string[];
  dois: string[];
  terms: string[];
}

function matches(text: string, regex: RegExp): string[] {
  return text.match(regex) ?? [];
}

function occurrences(text: string, token: string): number {
  return token ? text.split(token).length - 1 : 0;
}

export function collectProtectedTokens(text: string, terms: string[]): ProtectedTokens {
  return {
    citations: [
      ...matches(text, /\[[^\]\n]{1,120}\]|［[^］\n]{1,120}］/g),
      ...matches(text, /[（(][^()（）\n]{0,80}(?:19|20)\d{2}[a-z]?[^()（）\n]{0,80}[）)]/gi),
    ],
    // Do not use Unicode letter boundaries: Chinese prose commonly has no
    // spaces around a value, e.g. "使用100份问卷" or "提高2.5%".
    numbers: matches(text, /[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?(?:%|％)?/g),
    formulas: matches(text, /\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\]|\\\([^\n]*?\\\)/g),
    urls: matches(text, /https?:\/\/[^\s<>"'\]，。；！？）]+/gi).map((s) => s.replace(/[.,;!?)]+$/, '')),
    dois: matches(text, /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi).map((s) => s.replace(/[.,;]+$/, '')),
    terms: [...new Set(terms)].flatMap((term) => Array(occurrences(text, term)).fill(term) as string[]),
  };
}

function counts(tokens: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const token of tokens) result.set(token, (result.get(token) ?? 0) + 1);
  return result;
}

export function findPreservationRisks(before: ProtectedTokens, afterText: string): string[] {
  const after = collectProtectedTokens(afterText, [...new Set(before.terms)]);
  const risks: string[] = [];
  const labels: Array<[keyof ProtectedTokens, string]> = [
    ['citations', '引文标记'], ['numbers', '数字'], ['formulas', '公式'],
    ['urls', 'URL'], ['dois', 'DOI'], ['terms', '受保护术语'],
  ];
  for (const [category, label] of labels) {
    const original = counts(before[category]);
    const revised = counts(after[category]);
    for (const token of new Set([...original.keys(), ...revised.keys()])) {
      const from = original.get(token) ?? 0;
      const to = revised.get(token) ?? 0;
      if (from !== to) risks.push(`${label}出现次数改变：${token}（${from} → ${to}）`);
    }
  }
  return risks;
}
