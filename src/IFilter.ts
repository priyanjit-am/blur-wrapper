export interface ISupported {
    status: boolean,
    details?: object
  }
  export interface IFilterAdapter {
    initialized: boolean;
    blurActive: boolean;
    virtualBgActive: boolean;
  
    getName: () => string;
  
    init: () => Promise<void>;
  
    isBlurActive: () => boolean;
    isVirtualBgActive: () => boolean;
  
    isSupported: () => ISupported;
  
    activateBlur: (mediaStream: MediaStream) => Promise<void>;
    activateVirtualBg: (mediaStream: MediaStream, pathToImage: string) => Promise<void>;
  
    deactivate: () => Promise<void>;
    cleanup: () => Promise<void>;
  };
  