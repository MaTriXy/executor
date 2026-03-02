import { createControlPlaneAtomClient } from "@executor-v2/management-api/client";

const trim = (value: string | undefined): string | undefined => {
  const candidate = value?.trim();
  return candidate && candidate.length > 0 ? candidate : undefined;
};

const defaultControlPlaneBaseUrl = "/api/control-plane";

const controlPlaneBaseUrl =
  trim(process.env.NEXT_PUBLIC_CONTROL_PLANE_BASE_URL)
  ?? defaultControlPlaneBaseUrl;

export const controlPlaneClient = createControlPlaneAtomClient({
  baseUrl: controlPlaneBaseUrl,
});
