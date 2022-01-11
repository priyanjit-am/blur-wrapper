import { SelfieSegmentation } from "@mediapipe/selfie_segmentation";
import { v4 as uuid } from 'uuid';
import { BackgroundFilterParams } from "./BackgroundFilter";

const IMAGE_ID_PREFIX = 'filterImage';
const BLUR = 'blur';

const isBlur = (str: string = '') => str === BLUR;

class BackgroundFilter {
    id: string;
    selfieSegmentation: SelfieSegmentation;
    inputMediaStream: MediaStream;
    inputConfig: BackgroundFilterParams;

    image: HTMLImageElement;
    
    trackProcessor: any;
    trackGenerator: any;
    
    timestamp: number;
    running: boolean;

    videoFrame: any;
    processingVideoTrack: MediaStreamTrack;
    processingCanvas: any;
    processingCanvasContext: CanvasRenderingContext2D;

    globalController: TransformStreamDefaultController;
    frameTransformer: TransformStream;
    inputVideoTrackSettings: MediaTrackSettings = {
        width: 600,
        height: 400
    };

    static isSupported () {
        return {
            offscreen: true,
            wasm: true
        };
    }

    constructor (mediaStream: MediaStream, config: BackgroundFilterParams = {}) {
        this.id = config.id || uuid();
        this.inputMediaStream = mediaStream;
        this.inputConfig = config;

        this.selfieSegmentation = new SelfieSegmentation({
            locateFile: (file) => {
                console.log('model file', file);
                return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
            },
        });
        this.selfieSegmentation.setOptions({
            modelSelection: 1,
        });
        this.selfieSegmentation.onResults(this._onResults.bind(this));
    }

    _shouldChangeInput (newMs: MediaStream) {
        const newVTrack = newMs.getVideoTracks()[0];
        const oldVTrack = this.inputMediaStream.getVideoTracks()[0];
        if (
            (newMs.id === this.inputMediaStream.id) ||
            (newVTrack.id === oldVTrack.id)
        ) {
            return false;
        }
        return true;
    }

    _createImageElement () {
        const bFilter = this;
        if (bFilter.image) return bFilter.image;

        const image = bFilter.image = new Image();

        image.setAttribute('id', `${IMAGE_ID_PREFIX}-${this.id}`);
        image.setAttribute('crossorigin', 'anonymous');
        image.setAttribute('style', 'display: none; visibility: hidden;');

        document.body.appendChild(image);
        return image;
    }

    _createFrameTransformer () {
        const bFilter = this;

        bFilter.frameTransformer = new TransformStream({
            async transform(videoFrame, controller) {
                const { width, height } = bFilter.inputVideoTrackSettings;
                bFilter.globalController = controller;
                bFilter.videoFrame = videoFrame;
                bFilter.timestamp = videoFrame.timestamp;
                videoFrame.width = width;
                videoFrame.height = height;
                try {
                    await bFilter.selfieSegmentation.send({ image: videoFrame });
                    console.log("segment returned");
                } catch(err) {
                    console.error('Error while segmentation', err);
                }
            
                videoFrame.close();
            },
        });
        return bFilter.frameTransformer;
    }

    _createProcessingCanvas(width: number, height: number) {
        if (!this.processingCanvas) {
            // @ts-ignore
            this.processingCanvas = new OffscreenCanvas(width, height);
            this.processingCanvasContext = this.processingCanvas.getContext('2d');
        }
        this.processingCanvas.width = width;
        this.processingCanvas.height = height;

        return this.processingCanvas;
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

    async _transformGetUserMediaStream () {
        const stream = this.inputMediaStream;
        const videoTrack = this.processingVideoTrack = stream.getVideoTracks()[0].clone();
        // @ts-ignore
        const trackProcessor = this.trackProcessor = new MediaStreamTrackProcessor({ track: videoTrack });
        // @ts-ignore
        const trackGenerator = this.trackGenerator = new MediaStreamTrackGenerator({ kind: "video" });
        const { width, height } = this.inputVideoTrackSettings = videoTrack.getSettings();

        this._createProcessingCanvas(width, height);
        this._createFrameTransformer();

        this.running = true;

        trackProcessor.readable
            .pipeThrough(this.frameTransformer)
            .pipeTo(trackGenerator.writable);
      
        const transformedStream = new MediaStream([trackGenerator]);
        return transformedStream;
    }

    _onResults (results) {
        const {
            processingCanvasContext,
            processingCanvas,
            inputConfig: {
                background
            }
        } = this;
        const { width, height } = processingCanvas;

        const isBlurApplied = isBlur(background);

        processingCanvasContext.save();
        processingCanvasContext.clearRect(0, 0, width, height);
        processingCanvasContext.drawImage(
            results.segmentationMask,
            0,
            0,
            width,
            height
        );

        if (isBlurApplied) {
            processingCanvasContext.filter = 'blur(8px)';
        }
        processingCanvasContext.globalCompositeOperation = "source-out";
        processingCanvasContext.drawImage(
            isBlurApplied ? results.image : this.image,
            0,
            0,
            width,
            height
        );

        if (isBlurApplied) {
            processingCanvasContext.filter = 'blur(0px)';
        }
        // Only overwrite missing pixels.
        processingCanvasContext.globalCompositeOperation = "destination-over";
        processingCanvasContext.drawImage(
            results.image,
            0,
            0,
            width,
            height
        );

        processingCanvasContext.restore();
        this.globalController.enqueue(
            // @ts-ignore
            new VideoFrame(processingCanvas, { timestamp: this.timestamp, alpha: "discard" })
        );
    }

    async getOutput () {
        console.log('getOutput called');
        this._createImageElement();
        await this._updateBackgroundSource(this.inputConfig.background);
        const transformedStream = await this._transformGetUserMediaStream();

        return transformedStream;
    }

    async enable () {
        
    }

    async changeInput (newMediaStream: MediaStream, stopPrevious: boolean = false) {
        if (!this._shouldChangeInput(newMediaStream)) return;

        const prevMs = this.inputMediaStream;
        this.inputMediaStream = newMediaStream;
        if (stopPrevious) {
            prevMs.getVideoTracks()[0].stop();
        }
    }

    async changeBackground (url: string) {
        await this._updateBackgroundSource(url);
    }

    changeBlurRadius () {}

    disable () {
        this.processingVideoTrack.stop();
        this.running = false;
    }
};

export default BackgroundFilter;
