export type SqlCompletionScope = "tables" | "columns" | "both";

const COLUMN_CLAUSE = /\b(WHERE|AND|OR|HAVING|ON|SET)\s*$/i;
const ORDER_GROUP_BY = /\b(ORDER|GROUP)\s+BY\s*$/i;
const TABLE_CLAUSE = /\b(FROM|JOIN|INTO|UPDATE|TABLE)\s*$/i;

/**
 * Heuristic: infer whether the user is likely typing a relation name vs an expression
 * (e.g. after WHERE → columns), using text before the cursor only. No full SQL parse.
 */
export function inferCompletionScope(textBeforeCursor: string): SqlCompletionScope {
  let s = textBeforeCursor.trimEnd();

  for (let i = 0; i < 6; i++) {
    if (COLUMN_CLAUSE.test(s) || ORDER_GROUP_BY.test(s)) {
      return "columns";
    }
    if (TABLE_CLAUSE.test(s)) {
      return "tables";
    }
    const next = s.replace(/\s*[\w".]+$/, "").trimEnd();
    if (next === s) {
      break;
    }
    s = next;
  }

  return "both";
}
