declare module 'ping' {
  interface PingResponse {
    host: string;
    alive: boolean;
    output: string;
    time: number;
    times: number[];
    min: string;
    max: string;
    avg: string;
    stddev: string;
    packetLoss: string;
    numeric_host?: string;
  }

  interface PingConfig {
    timeout?: number;
    min_reply?: number;
    extra?: string[];
    log?: (message: string) => void;
  }

  namespace promise {
    function probe(
      addr: string,
      config?: PingConfig
    ): Promise<PingResponse>;
  }

  export { promise, PingResponse, PingConfig };
}
