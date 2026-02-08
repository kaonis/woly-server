declare module 'wake_on_lan' {
  interface WakeOptions {
    address?: string;
    port?: number;
    interval?: number;
    repeat?: number;
  }

  function wake(
    macAddress: string,
    callback?: (error: Error | null) => void
  ): void;

  function wake(
    macAddress: string,
    options: WakeOptions,
    callback?: (error: Error | null) => void
  ): void;

  export { wake, WakeOptions };
}
