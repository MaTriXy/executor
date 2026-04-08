# @executor/env

Vendored environment tooling based on [`rayhanadev/effect-env`](https://github.com/rayhanadev/effect-env), with runtime ergonomics inspired by [`t3-oss/t3-env`](https://github.com/t3-oss/t3-env).

## What this adds

- `Env` helper constructors for Effect `Config` values
- `makeEnv` for Effect Context/Layer integration
- `createEnv` for t3-style runtime env assembly with:
  - `server` / `client` / `shared` schema split
  - `clientPrefix` access controls
  - `runtimeEnv` or `runtimeEnvStrict`
  - `onValidationError` / `onInvalidAccess`
  - `skipValidation`
  - `emptyStringAsUndefined`
  - `extends`
  - `createFinalConfig` customization hook

## Example

```ts
import { createEnv, Env } from "@executor/env";

export const env = createEnv({
  server: {
    DATABASE_URL: Env.url("DATABASE_URL"),
    PORT: Env.numberOr("PORT", 3000),
  },
  clientPrefix: "PUBLIC_",
  client: {
    PUBLIC_API_URL: Env.url("PUBLIC_API_URL"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
```
