import cloud from "wx-server-sdk";
import { handleGateway } from "./gateway.js";

cloud.init();

export async function main(event: unknown) {
  // Identity comes only from the SDK's verified invocation context.
  return handleGateway(event, cloud.getWXContext(), process.env);
}
