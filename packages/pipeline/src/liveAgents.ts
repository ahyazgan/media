import { classify, flash, relate, verify, write } from "@kaynak/agents";
import type { Agents } from "./pipeline.js";

/** Üretim ajanları: @kaynak/agents üzerinden gerçek model çağrıları. */
export const liveAgents: Agents = { classify, write, flash, relate, verify };
