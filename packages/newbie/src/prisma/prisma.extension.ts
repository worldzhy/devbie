import { BadRequestException } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Constructor type of a project-generated PrismaClient.
 * The framework never instantiates a generated client itself: each project
 * generates its own client (prisma-client generator, e.g. `@generated/prisma/client`)
 * and passes its constructor in via PrismaModule.forRoot / FrameworkModule.forRoot.
 *
 * Kept as a rest-args `any` signature on purpose: each Prisma version generates
 * a constructor with its own option types (PrismaClientOptions, adapter config),
 * and a narrower parameter type (e.g. `Record<string, unknown>`) is structurally
 * incompatible with the generated one under strict-function-types checks.
 */
export type PrismaClientConstructor = new (...args: any[]) => any;

export interface CreateExtendedPrismaClientOptions {
  /** Project-generated PrismaClient constructor. */
  PrismaClient: PrismaClientConstructor;
  /** Postgres connection string. Defaults to process.env.PRISMA_DATABASE_URL. */
  connectionString?: string;
}

/**
 * Default pagination values applied when the caller omits page or pageSize.
 */
const DEFAULT_PAGE = 0;
const DEFAULT_PAGE_SIZE = 20;
/** Hard ceiling so a list endpoint can never be turned into a full-table scan. */
const MAX_PAGE_SIZE = 1000;

/**
 * Helper function to calculate pagination parameters.
 * page and pageSize are optional; omitted values fall back to DEFAULT_PAGE /
 * DEFAULT_PAGE_SIZE so callers (and DTOs) can treat them as optional.
 * pageSize is clamped to MAX_PAGE_SIZE.
 */
function getSkipAndTake(params: { page?: number; pageSize?: number }) {
  const page = params.page ?? DEFAULT_PAGE;
  const pageSize = Math.min(params.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  if (page >= 0 && pageSize > 0) {
    return {
      skip: pageSize * page,
      take: pageSize,
    };
  } else {
    throw new BadRequestException("The minimum page is 0 and the pageSize must be larger than 0.");
  }
}

/**
 * Factory function to create an extended Prisma Client.
 * Model names are passed as plain strings because the framework has no
 * knowledge of a project's generated models.
 */
export const createExtendedPrismaClient = (options: CreateExtendedPrismaClientOptions) => {
  const { PrismaClient, connectionString } = options;

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: (connectionString ?? process.env.PRISMA_DATABASE_URL) as string,
    }),
  });

  const extendedClient = prisma.$extends({
    client: {
      async findManyInOnePage(params: { model: string; findManyArgs?: any }) {
        const { findManyArgs } = params;
        const model = params.model as string;
        const modelLowercaseFirstLetter = model.charAt(0).toLowerCase() + model.slice(1);

        const currentClient = this as any;
        const records = await currentClient[modelLowercaseFirstLetter].findMany({
          ...findManyArgs,
        });

        return {
          records,
          pagination: {
            page: 0,
            pageSize: records.length,
            countOfCurrentPage: records.length,
            countOfTotal: records.length,
          },
        };
      },

      async findManyInManyPages(params: {
        model: string;
        pagination: { page?: number; pageSize?: number };
        findManyArgs?: any;
      }) {
        const { pagination, findManyArgs } = params;
        const model = params.model as string;
        const modelLowercaseFirstLetter = model.charAt(0).toLowerCase() + model.slice(1);
        const page = pagination.page ?? DEFAULT_PAGE;
        const pageSize = pagination.pageSize ?? DEFAULT_PAGE_SIZE;
        const { skip, take } = getSkipAndTake({ page, pageSize });

        const currentClient = this as any;

        const [records, total] = await currentClient.$transaction([
          currentClient[modelLowercaseFirstLetter].findMany({
            ...findManyArgs,
            take,
            skip,
          }),
          currentClient[modelLowercaseFirstLetter].count({
            where: findManyArgs ? findManyArgs.where : undefined,
          }),
        ]);

        return {
          records,
          pagination: {
            page,
            pageSize,
            countOfCurrentPage: records.length,
            countOfTotal: total,
          },
        };
      },
    },
  });

  return extendedClient;
};

/**
 * Minimal structural type of the extended client as seen by the framework.
 * Declared as an interface (not a type alias) so that projects can augment it
 * via declaration merging with their own generated client type, restoring full
 * model intellisense at injection sites:
 *
 *   // src/types/prisma.d.ts (project side)
 *   import type {PrismaClient} from '@generated/prisma/client';
 *   declare module '@devbie/newbie/prisma/prisma.extension' {
 *     interface ExtendedPrismaClient extends PrismaClient {}
 *   }
 */
export interface ExtendedPrismaClient {
  // Only the framework's own extension methods are declared here. Native
  // PrismaClient members ($connect/$transaction/...) are intentionally NOT
  // redeclared: a narrower redeclaration would shadow the generated client's
  // generic overloads when a project augments this interface.
  findManyInOnePage: (params: { model: string; findManyArgs?: any }) => Promise<any>;
  findManyInManyPages: (params: {
    model: string;
    pagination: { page?: number; pageSize?: number };
    findManyArgs?: any;
  }) => Promise<any>;
  /**
   * Rebinds the underlying client through $extends. Feature modules call this
   * in their service constructors to register model extensions; the rebind is
   * visible to all injection sites because the service proxies to the current
   * client.
   */
  registerExtension: (extension: any) => void;
  // Model delegates and native client members are unknown to the framework;
  // the index signature keeps them accessible (as any) until the project
  // augments this interface.
  [key: string]: any;
}
