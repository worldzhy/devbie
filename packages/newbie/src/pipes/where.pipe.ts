import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import { parseObjectLiteral } from "../utilities/parse-object-literal.util";
import { WHERE_PIPE_FORMAT } from "../exceptions/errors.constants";

const OPERATORS = [
  "lt",
  "lte",
  "gt",
  "gte",
  "equals",
  "not",
  "contains",
  "startsWith",
  "endsWith",
  "every",
  "some",
  "none",
];

// Only relation operators expect a nested `field:value` operand; scalar
// operators keep the raw string, so a legitimate colon in the value
// (e.g. "contains foo:bar") is not rewritten into an object.
const RELATION_OPERATORS = new Set(["every", "some", "none"]);

/** Convert a string like "id: 12, b: 'Anand'" to { id: 12, name: "Anand" } */
@Injectable()
export class WherePipe implements PipeTransform {
  transform(value: string): Record<string, any> | undefined {
    if (value == null) return undefined;
    try {
      const rules = parseObjectLiteral(value);
      const items: Record<string, any> = {};
      rules.forEach((rule) => {
        const ruleKey = rule[0];
        const rawValue: string = rule[1] ?? "";
        let ruleValue: string | number | boolean = rawValue;

        if (rawValue.endsWith(")")) {
          const inner = /\(([^)]+)\)/.exec(rawValue)?.[1];
          if (inner !== undefined) {
            if (rawValue.startsWith("int(")) ruleValue = parseInt(inner, 10);
            else if (rawValue.startsWith("date(") || rawValue.startsWith("datetime("))
              ruleValue = new Date(inner).toISOString();
            else if (rawValue.startsWith("float(")) ruleValue = parseFloat(inner);
            else if (rawValue.startsWith("string(")) ruleValue = inner;
            else if (rawValue.startsWith("boolean(") || rawValue.startsWith("bool(")) ruleValue = inner === "true";
          }
        }

        for (const val of OPERATORS) {
          if (!rawValue.startsWith(`${val} `)) continue;
          const operand = rawValue.slice(val.length + 1).trim();
          let value: unknown = operand;
          if (RELATION_OPERATORS.has(val)) {
            const [nestedKey, nestedValue, ...rest] = operand.split(":");
            if (nestedKey && nestedValue && rest.length === 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(nestedKey)) {
              value = { [nestedKey]: nestedValue };
            }
          }
          items[ruleKey] = { [val]: value };
          break;
        }

        if (ruleValue != null && ruleValue !== "") items[ruleKey] = items[ruleKey] || ruleValue;
      });
      return items;
    } catch {
      throw new BadRequestException(WHERE_PIPE_FORMAT);
    }
  }
}
