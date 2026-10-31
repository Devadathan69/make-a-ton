import { createHttpApi } from "./http";
import { createMockApi } from "./mock";

const configuredMode = process.env.NEXT_PUBLIC_DATA_MODE ?? "mock";
if (configuredMode !== "mock" && configuredMode !== "http") {
  throw new Error("NEXT_PUBLIC_DATA_MODE must be mock or http");
}
export const dataMode = configuredMode;
/** Feature UIs import only this facade and contracts.ts. No direct fixtures or database access. */
export const api = dataMode === "http" ? createHttpApi() : createMockApi();
export { ApiError } from "./http";
