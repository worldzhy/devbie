import { Injectable, OnModuleInit, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import type { NextFunction, Request, Response } from "express";
import { ALLOW_ANY_ORIGIN_KEY } from "./allow-any-origin.decorator";

/**
 * Token headers carried by the any-origin report endpoints: the built-in
 * SDKs (heartbeat, health, backend-monitor) and the module-hub reporter each
 * authenticate with one of these headers. All are live contracts.
 */
const ALLOW_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Heartbeat-Token",
  "X-Health-Token",
  "X-Backend-Monitor-Token",
  "X-Module-Hub-Token",
].join(", ");

const REQUEST_METHOD_NAMES: Record<number, string> = {
  [RequestMethod.GET]: "GET",
  [RequestMethod.POST]: "POST",
  [RequestMethod.PUT]: "PUT",
  [RequestMethod.DELETE]: "DELETE",
  [RequestMethod.PATCH]: "PATCH",
  [RequestMethod.OPTIONS]: "OPTIONS",
  [RequestMethod.HEAD]: "HEAD",
};

/**
 * Registry of the routes decorated with @AllowAnyOrigin(), built once at
 * module init from controller metadata. The static surface lets the
 * Express-level middleware registered by NewbieFactory consult it without
 * touching the Nest container (that middleware is registered before the app
 * finishes initializing).
 *
 * Access-Control-Allow-Origin: * is safe on these routes only because they
 * authenticate via a secret token, never via cookies/JWT (ADR-009 D1,
 * carried over from ADR-016).
 *
 * FrameworkModule provides this class, so every host that imports
 * FrameworkModule.forRoot() gets the scan.
 */
@Injectable()
// eslint-disable-next-line @darraghor/nestjs-typed/injectable-should-be-provided -- registered by FrameworkModule.forRoot()'s dynamic module metadata, which the rule does not traverse
export class AllowAnyOriginRegistry implements OnModuleInit {
  /** normalized path -> declared HTTP methods (uppercase). */
  private static readonly routes = new Map<string, Set<string>>();

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit(): void {
    for (const wrapper of this.discovery.getControllers()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      const controllerPath = this.reflector.get<string | undefined>(PATH_METADATA, metatype) ?? "";
      const prototype = Object.getPrototypeOf(instance) as object;
      const methodNames = Array.from(this.metadataScanner.getAllMethodNames(prototype)).filter(
        (name): name is string => typeof name === "string",
      );
      for (const name of methodNames) {
        const handler = prototype[name as keyof typeof prototype] as (...args: unknown[]) => unknown;
        const isAllowAnyOrigin = this.reflector.getAllAndOverride<boolean>(ALLOW_ANY_ORIGIN_KEY, [handler, metatype]);
        if (!isAllowAnyOrigin) continue;
        const methodMetadata = this.reflector.get<RequestMethod | undefined>(METHOD_METADATA, handler);
        if (methodMetadata === undefined) continue;
        const methodPath = this.reflector.get<string | undefined>(PATH_METADATA, handler) ?? "";
        const path = AllowAnyOriginRegistry.normalizePath(`${controllerPath}/${methodPath}`);
        const method = REQUEST_METHOD_NAMES[methodMetadata];
        if (!method) continue;
        const methods = AllowAnyOriginRegistry.routes.get(path) ?? new Set<string>();
        methods.add(method);
        AllowAnyOriginRegistry.routes.set(path, methods);
      }
    }
  }

  /**
   * Exact (case-insensitive) match against the @AllowAnyOrigin registry.
   * OPTIONS/HEAD match any registered path so preflight is answered.
   */
  static matches(method: string, path: string): boolean {
    const methods = AllowAnyOriginRegistry.routes.get(AllowAnyOriginRegistry.normalizePath(path));
    if (!methods) return false;
    if (method === "OPTIONS" || method === "HEAD") return true;
    return methods.has(method.toUpperCase());
  }

  /**
   * Express-level CORS handler for @AllowAnyOrigin routes, wired by
   * NewbieFactory before the global CORS middleware. Sets ACAO:* and answers
   * OPTIONS preflight; non-matching requests pass through untouched.
   */
  static handleRequest(req: Request, res: Response, next: NextFunction): void {
    if (!AllowAnyOriginRegistry.matches(req.method, req.path)) {
      next();
      return;
    }
    const methods = AllowAnyOriginRegistry.routes.get(AllowAnyOriginRegistry.normalizePath(req.path));
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", [...(methods ?? []), "OPTIONS"].join(", "));
    res.setHeader("Access-Control-Allow-Headers", ALLOW_HEADERS);
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  }

  private static normalizePath(path: string): string {
    const normalized = `/${path}`.replace(/\/+/g, "/").replace(/\/+$/, "").toLowerCase();
    return normalized === "" ? "/" : normalized;
  }
}
