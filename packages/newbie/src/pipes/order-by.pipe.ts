import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import { ORDER_BY_FORMAT } from "../exceptions/errors.constants";

/** Convert a string like "name:asc, address:desc" to { name: "asc", address: "desc" } */
@Injectable()
export class OrderByPipe implements PipeTransform {
  transform(value: string, _metadata: ArgumentMetadata): Record<string, "asc" | "desc"> | undefined {
    if (value == null) return undefined;

    const orderBy: Record<string, "asc" | "desc"> = {};
    const rules = value.split(",").map((val) => val.trim());
    for (const rule of rules) {
      const [key, order] = rule.split(":");
      if (!key || !order || !["asc", "desc"].includes(order.toLocaleLowerCase())) {
        throw new BadRequestException(ORDER_BY_FORMAT);
      }
      orderBy[key] = order.toLocaleLowerCase() as "asc" | "desc";
    }
    return orderBy;
  }
}
