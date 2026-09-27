/** Tek bir model çağrısının ölçümü: değerlendirme, maliyet ve gecikme raporları için. */
export interface CallUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface CallMeta {
  model: string;
  ms: number;
  stopReason: string | null;
  usage: CallUsage;
}

export interface Detailed<T> {
  output: T;
  meta: CallMeta;
}

type SdkUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export function toUsage(u: SdkUsage): CallUsage {
  return {
    input: u.input_tokens,
    output: u.output_tokens,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  };
}
