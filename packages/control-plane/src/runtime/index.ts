import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";

import {
  ControlPlaneActorResolver,
  type ControlPlaneActorResolverShape,
  ControlPlaneService,
  type ControlPlaneServiceShape,
} from "#api";
import {
  SqlControlPlanePersistenceLive,
  SqlControlPlanePersistenceService,
  SqlControlPlaneRowsLive,
  SqlPersistenceBootstrapError,
  type CreateSqlRuntimeOptions,
  type SqlControlPlanePersistence,
} from "#persistence";

import type { LocalInstallation } from "#schema";
import {
  ControlPlaneAuthHeaders,
  RuntimeActorResolverLive,
  createHeaderActorResolver,
} from "./actor-resolver";
import {
  type ResolveExecutionEnvironment,
} from "./execution-state";
import {
  LiveExecutionManagerLive,
} from "./live-execution";
import {
  getOrProvisionLocalInstallation,
} from "./local-installation";
import {
  RuntimeSourceAuthServiceLive,
  type ResolveSecretMaterial,
} from "./source-auth-service";
import {
  RuntimeControlPlaneServiceLive,
  createRuntimeControlPlaneService,
} from "./services";
import {
  RuntimeExecutionResolverLive,
} from "./workspace-execution-environment";

export {
  ControlPlaneAuthHeaders,
  createHeaderActorResolver,
  createRuntimeControlPlaneService,
};

export * from "./execution-state";
export * from "./live-execution";
export * from "./local-installation";
export * from "./source-auth-service";
export * from "./workspace-execution-environment";

export type RuntimeControlPlaneOptions = {
  actorResolver?: ControlPlaneActorResolverShape;
  executionResolver?: ResolveExecutionEnvironment;
  resolveSecretMaterial?: ResolveSecretMaterial;
  getLocalServerBaseUrl?: () => string | undefined;
};

export type RuntimeControlPlaneInput = RuntimeControlPlaneOptions & {
  persistence: SqlControlPlanePersistence;
};

const detailsFromCause = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const toLocalInstallationBootstrapError = (
  cause: unknown,
): SqlPersistenceBootstrapError => {
  const details = detailsFromCause(cause);
  return new SqlPersistenceBootstrapError({
    message: `Failed provisioning local installation: ${details}`,
    details,
  });
};

const closeScope = (scope: Scope.CloseableScope) =>
  Scope.close(scope, Exit.void).pipe(Effect.orDie);

export const createRuntimeControlPlaneLayer = (
  options: RuntimeControlPlaneOptions = {},
) => {
  const liveExecutionManagerLayer = LiveExecutionManagerLive;
  const sourceAuthLayer = RuntimeSourceAuthServiceLive({
    getLocalServerBaseUrl: options.getLocalServerBaseUrl,
  }).pipe(
    Layer.provide(liveExecutionManagerLayer),
  );
  const executionResolverLayer = RuntimeExecutionResolverLive({
    executionResolver: options.executionResolver,
    resolveSecretMaterial: options.resolveSecretMaterial,
  }).pipe(
    Layer.provide(sourceAuthLayer),
  );
  const runtimeDependenciesLayer = Layer.mergeAll(
    liveExecutionManagerLayer,
    sourceAuthLayer,
    executionResolverLayer,
  );

  return Layer.mergeAll(
    RuntimeControlPlaneServiceLive.pipe(
      Layer.provide(runtimeDependenciesLayer),
    ),
    RuntimeActorResolverLive(options.actorResolver),
    runtimeDependenciesLayer,
  );
};

export const createRuntimeControlPlane = (
  input: RuntimeControlPlaneInput,
): Effect.Effect<{
  service: ControlPlaneServiceShape;
  actorResolver: ControlPlaneActorResolverShape;
}> =>
  Effect.gen(function* () {
    const service = yield* ControlPlaneService;
    const actorResolver = yield* ControlPlaneActorResolver;

    return {
      service,
      actorResolver,
    };
  }).pipe(
    Effect.provide(
      createRuntimeControlPlaneLayer(input).pipe(
        Layer.provide(SqlControlPlaneRowsLive),
        Layer.provide(
          Layer.succeed(SqlControlPlanePersistenceService, input.persistence),
        ),
      ),
    ),
  );

export type SqlControlPlaneRuntime = {
  persistence: SqlControlPlanePersistence;
  localInstallation: LocalInstallation;
  service: ControlPlaneServiceShape;
  actorResolver: ControlPlaneActorResolverShape;
  close: () => Promise<void>;
};

export type CreateSqlControlPlaneRuntimeOptions = CreateSqlRuntimeOptions
  & RuntimeControlPlaneOptions;

export const createSqlControlPlaneRuntime = (
  options: CreateSqlControlPlaneRuntimeOptions,
): Effect.Effect<SqlControlPlaneRuntime, SqlPersistenceBootstrapError> =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const persistenceAndRowsLayer = SqlControlPlaneRowsLive.pipe(
      Layer.provideMerge(SqlControlPlanePersistenceLive(options)),
    );
    const runtimeLayer = createRuntimeControlPlaneLayer(options).pipe(
      Layer.provideMerge(persistenceAndRowsLayer),
    );

    const context = yield* Layer.buildWithScope(runtimeLayer, scope).pipe(
      Effect.catchAll((error) =>
        closeScope(scope).pipe(
          Effect.zipRight(Effect.fail(error)),
        )),
    );

    const persistence = Context.get(context, SqlControlPlanePersistenceService);
    const service = Context.get(context, ControlPlaneService);
    const actorResolver = Context.get(context, ControlPlaneActorResolver);

    const localInstallation = yield* getOrProvisionLocalInstallation(
      persistence.rows,
    ).pipe(
      Effect.mapError(toLocalInstallationBootstrapError),
      Effect.catchAll((error) =>
        closeScope(scope).pipe(
          Effect.zipRight(Effect.fail(error)),
        )),
    );

    return {
      persistence,
      localInstallation,
      service,
      actorResolver,
      close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
    };
  });
