import { classify, write } from "@kaynak/agents";
import type { Agents } from "./pipeline.js";

/** Üretim ajanları: @kaynak/agents üzerinden gerçek model çağrıları. */
export const liveAgents: Agents = { classify, write };
