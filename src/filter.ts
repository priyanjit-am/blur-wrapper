// @ts-ignore
import BackgroundFilter from './MediaProcessor';
// import BackgroundFilter from './BackgroundFilter';
import { IFilterAdapter } from './IFilter';

const DEFAULT_VECTORLY_CONFIG = {
    blurRadius: 3,
    //@ts-ignore
    frameRate: 30,
    //@ts-ignore
    segmentationFrameRate: 15,
};


class VectorlyFilter implements IFilterAdapter {
  filter: any;
  initialized: boolean;
  supported: boolean;
  blurActive: boolean = false;
  virtualBgActive: boolean = false;
  filteredStream: MediaStream = null;

  getName () {
    return 'vectorly';
  }

  async init () {
    this.initialized = true;
  }

  isBlurActive () {
    return this.blurActive;
  }

  isVirtualBgActive () {
    return this.virtualBgActive;
  }

  isSupported () {
    const supportObj: any = BackgroundFilter.isSupported();
    let status: boolean = true;

    if (!supportObj || !supportObj.offscreen || !supportObj.wasm) {
      status = false;
    }
    return {
      status,
      details: supportObj
    }
  }

  _activate (mediaStream: MediaStream, bgArg: string): Promise<any> {
    const vectorly = this;
    return new Promise<any>(async (resolve, reject) => {
      try {
        if (!vectorly.filter) {
          vectorly.filter = new BackgroundFilter(mediaStream, {
            background: bgArg,
            ...DEFAULT_VECTORLY_CONFIG
          });
          vectorly.filteredStream = await vectorly.filter.getOutput();
        } else {
          if (!vectorly.blurActive && !vectorly.virtualBgActive) {
            await vectorly.filter.enable();
            await vectorly.filter.changeInput(mediaStream, true);
            vectorly.filteredStream = await vectorly.filter.getOutput();
          }
          await vectorly.filter.changeBackground(bgArg);
        }

        if (vectorly.filter.processor) {
          // @todo remove once this is fixed from vectorly
          vectorly.filter.processor.canvas.style.display = 'none';
        }
        resolve(vectorly.filteredStream);
      } catch(err) {
        return reject({
          errMsg: `Some error occured while activating vectorly, ${err}`
        });
      }
    });
  }

  _deactivate (): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.filter) {
        return reject({
          errMsg: `No filter found which can be deactivated`
        });
      }

      try {
        this.filter.disable();
        // Bug in vectorly, tracks need to be stopped explicitly. @todo: remove once fixed from vectorly
        this.filter?.input?.getVideoTracks?.()?.[0]?.stop();
        this.filter?.inputClone?.getVideoTracks?.()?.[0]?.stop();
        if (this.filteredStream) {
          this.filteredStream.getVideoTracks()[0].stop();
        }
        resolve();
      } catch (err) {
        return reject({
          errMsg: `Some error occured while deactivating vectorly, ${err}`
        });
      }
    });
  }

  activateBlur (mediaStream: MediaStream): Promise<any> {
    return new Promise<any>(async (resolve, reject) => {
      try {
        const stream = await this._activate(mediaStream, `blur`);
        this.blurActive = true;
        this.virtualBgActive = false;
        resolve(stream);
      } catch(err) {
        reject(err);
      }
    });
  }

  activateVirtualBg (mediaStream: MediaStream, pathToImage: string): Promise<any> {
    return new Promise<any>(async (resolve, reject) => {
      try {
        const stream = await this._activate(mediaStream, pathToImage);
        this.blurActive = false;
        this.virtualBgActive = true;
        resolve(stream);
      } catch(err) {
        reject(err);
      }
    });
  }

  deactivate (): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      try {
        await this._deactivate();
        this.blurActive = false;
        this.virtualBgActive = false;
        resolve();
      } catch(err) {
        reject(err);
      }
    });
  }

  async cleanup () {}
};

export default VectorlyFilter;
