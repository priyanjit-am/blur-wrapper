import { buildWebGL2Pipeline } from "./pipelines/webgl2/webgl2Pipeline";
import { v4 as uuid } from 'uuid';

declare function createTFLiteSIMDModule(): Promise<TFLite>
declare function createTFLiteModule(): Promise<TFLite>

export interface TFLite extends EmscriptenModule {
  _getModelBufferMemoryOffset(): number
  _getInputMemoryOffset(): number
  _getInputHeight(): number
  _getInputWidth(): number
  _getInputChannelCount(): number
  _getOutputMemoryOffset(): number
  _getOutputHeight(): number
  _getOutputWidth(): number
  _getOutputChannelCount(): number
  _loadModel(bufferSize: number): number
  _runInference(): number
}

export interface BackgroundFilterParams {
    id?: string;
    background?: string;
    blurRadius?: number;
    //@ts-ignore
    frameRate?: number,
    //@ts-ignore
    segmentationFrameRate?: number,
};

const DEFAULT_BG_CONFIG = {
    type: 'https://vectorly-demos.s3.us-west-1.amazonaws.com/virtual-backgrounds/2.jpg'
};
const DEFAULT_SEGMENTATION_CONFIG = {
    model: 'meet',
    backend: 'wasm',
    // inputResolution: '160x96',
    inputResolution: '256x144', // consider using this and the larger model when SIMD is available
    // inputResolution: '144x256',
    // inputResolution: '256x256',
    pipeline: 'webgl2'
};

class BackgroundFilter {
    id: string;
    isSIMDSupported: boolean;
    initializePromise: Promise<void>;
    initialized: boolean;
    tflite: TFLite;
    video: HTMLVideoElement;
    image: HTMLImageElement;
    processingCanvas: HTMLCanvasElement;
    inputMediaStream: MediaStream;
    inputConfig: BackgroundFilterParams;
    pipeline: any;
    renderRequestId: number;
    _imageCache: any;

    constructor(mediaStream: MediaStream, config: BackgroundFilterParams = {}) {
        this.id = config.id || uuid();
        this.inputMediaStream = mediaStream;
        this.inputConfig = config;
        this._loadModelsAndInitialize();
    }

    static isSupported () {
        return {
            offscreen: true,
            wasm: true
        };
    }

    async _loadModelsAndInitialize () {
        const bFilter = this;

        const loadTFliteSIMDModule = async () => {
            try {
                const model = await createTFLiteSIMDModule();
                bFilter.tflite = model;
                bFilter.isSIMDSupported = true;
                console.log('SIMD supported, using SIMD tflite module');
            } catch(err) {
                bFilter.isSIMDSupported = false;
                console.error('Error occured while creating SIMD tflite module');
            }
        };
        const loadTfliteModule = async () => {
            if (bFilter.tflite) return;
            try {
                const model = await createTFLiteModule();
                bFilter.tflite = model;
                console.log('Using tflite module');
            } catch(err) {
                console.error('Error occured while creating tflite module');
            }
        };

        const loadSegmentationModel = async () => {
            const { tflite } = bFilter;
            if (!tflite) {
                console.error('TFlite module not found. Returning...');
            }

            const response = await fetch(
                `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1/selfie_segmentation_landscape.tflite`
            );
            const model = await response.arrayBuffer();
            const modelBufferOffset = tflite._getModelBufferMemoryOffset()
            tflite.HEAPU8.set(new Uint8Array(model), modelBufferOffset)
            tflite._loadModel(model.byteLength);
        };


        const startInitialize = async () => {
            await loadTFliteSIMDModule();
            await loadTfliteModule();
            await loadSegmentationModel();
        };

        bFilter.initializePromise = startInitialize();
        bFilter.initializePromise.then(() => {
            bFilter.initialized = true;
        });
    }

    _createInputVideoElement () {
        if (document.getElementById(`filterVideo-${this.id}`)) return;

        const bFilter = this;
        const video = bFilter.video = document.createElement('video');

        video.setAttribute('id', `filterVideo-${bFilter.id}`);
        video.setAttribute('style', 'display:none; visibility:hidden;');
        video.setAttribute('autoplay', '');
        video.setAttribute('playsinline', '');
        video.setAttribute('muted', '');

        document.body.appendChild(video);
    }

    _createProcessingCanvasElement () {
        if (document.getElementById(`filterCanvas-${this.id}`)) return;

        const bFilter = this;
        const canvas = document.createElement('canvas');
        
        canvas.setAttribute('id', `filterCanvas-${this.id}`);
        canvas.setAttribute('style', 'display: none; visibility: hidden;');
        
        document.body.appendChild(canvas);
        // @ts-ignore
        bFilter.processingCanvas = canvas as HTMLCanvasElement;
        return bFilter.processingCanvas;
    }

    _createImageElement () {
        if (document.getElementById(`filterImage-${this.id}`)) return;

        const bFilter = this;
        const image = bFilter.image = new Image();

        image.setAttribute('id', `filterImage-${this.id}`);
        image.setAttribute('crossorigin', 'anonymous');
        image.setAttribute('style', 'display: none; visibility: hidden;');

        document.body.appendChild(image);
        return image;
    }

    _updateVideoSource (ms: MediaStream) {
        const bFilter = this;
        return new Promise<void>(resolve => {
            const {
                processingCanvas: canvas,
                video
            } = bFilter;
            const loadeddataHandler = () => {
                const trackSettings = ms.getVideoTracks()[0].getSettings();

                canvas.height = trackSettings.height;
                canvas.width = trackSettings.width;

                video.removeEventListener('loadeddata', loadeddataHandler);
                resolve();
            };
            video.addEventListener('loadeddata', loadeddataHandler);
            bFilter.inputMediaStream = ms;
            video.srcObject = ms;
        });
    }

    _updateBackgroundSource (url: string) {
        const bFilter = this;
        return new Promise<void>(async (resolve) => {
            bFilter.inputConfig.background = url;
            if (url === 'blur') {
                return resolve();
            }

            const { image } = bFilter;

            const onImageload = () => {
                image.removeEventListener('load', onImageload);
                resolve();
            };
            image.addEventListener('load', onImageload);
            image.src = url;
        });
    }

    async _renderPipeline () {
        const bFilter = this;
        const { pipeline } = bFilter;
        if (!pipeline) {
            console.error('Attempt to render pipeline before initializing it');
            return;
        }

        try {
            pipeline.render();
            bFilter.renderRequestId = requestAnimationFrame(bFilter._renderPipeline.bind(bFilter));
        } catch(err) {
            console.error('Error occured while rendering pipeline', err);
            if (bFilter.renderRequestId) {
                cancelAnimationFrame(bFilter.renderRequestId);
            }
            bFilter.disable();
            throw new Error(err);
        }
    }

    _render () {
        const bFilter = this;
        if (bFilter.pipeline && bFilter.renderRequestId) {
            bFilter.disable();
        }

        const pipeline = bFilter.pipeline = buildWebGL2Pipeline(
            bFilter.video,
            bFilter.image,
            // @ts-ignore
            {
                ...DEFAULT_BG_CONFIG,
                type: bFilter.inputConfig.background
            },
            // @ts-ignore
            DEFAULT_SEGMENTATION_CONFIG,
            bFilter.processingCanvas,
            bFilter.tflite,
            () => {}
        );

        pipeline.updatePostProcessingConfig({
            smoothSegmentationMask: true,
            jointBilateralFilter: { sigmaSpace: 1, sigmaColor: 0.1 },
            coverage: [0.5, 0.75],
            lightWrapping: 0.3,
            blendMode: 'screen',
        });

        bFilter._renderPipeline();
    }

    async getOutput () {
        const bFilter = this;
        if (!bFilter.initialized) {
            console.log('waiting for initialization to complete in getOutput');
            await bFilter.initializePromise;
            console.log('initialization complete in getOutput');
        }


        if (!bFilter.processingCanvas) {
            bFilter._createProcessingCanvasElement();
        }
        if (!bFilter.image) {
            bFilter._createImageElement();
        }
        if (!bFilter.video) {
            bFilter._createInputVideoElement();
        }

        await bFilter._updateVideoSource(bFilter.inputMediaStream);
        await bFilter._updateBackgroundSource(bFilter.inputConfig.background);

        bFilter._render();

        // @ts-ignore
        return bFilter.processingCanvas.captureStream();
    }

    async enable () {
        this._render();
    }
    async changeInput (newMediaStream: MediaStream, stopPrevious: boolean = false) {
        const prevMs = this.inputMediaStream;
        await this._updateVideoSource(newMediaStream);
        if (stopPrevious) {
            prevMs.getVideoTracks()[0].stop();
        }

        this._render();
    }
    async changeBackground (url: string) {
        this._updateBackgroundSource(url);
        this._render();
    }
    changeBlurRadius () {}
    disable () {
        this.pipeline?.cleanUp();
        cancelAnimationFrame(this.renderRequestId);
    }
};

export default BackgroundFilter;
