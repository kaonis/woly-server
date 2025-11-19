declare module 'local-devices' {
  interface Device {
    name: string;
    ip: string;
    mac: string;
  }

  function localDevices(): Promise<Device[]>;
  
  export = localDevices;
}
