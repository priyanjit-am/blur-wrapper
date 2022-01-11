import { SelfieSegmentation } from "@mediapipe/selfie_segmentation";

const store: any = {

};

const onSegmentationResult = (result) => {
    postMessage({
        msg: 'segmentationResult',
        result
    });
}

class BackgroundFilterWorker {
    selfieSegmentation: SelfieSegmentation
    constructor() {
        this.selfieSegmentation = new SelfieSegmentation({
            locateFile: (file) => {
                console.log('model file', file);
                return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
            },
        });
        this.selfieSegmentation.setOptions({
            modelSelection: 1,
        });
        this.selfieSegmentation.onResults(onSegmentationResult);
    }
};

const worker: Worker = self as any;

worker.onmessage = async (e) => {
    const {
        data
    } = e;

    if (data.msg === 'init') {
        console.log('worker :: init', data);
        store.instance = new BackgroundFilterWorker();
        postMessage({
            msg: 'initialized',
        });
    } else if (data.msg === 'segment') {
        console.log('worker :: segment', data)
        postMessage({
            msg: 'frame-received',
            data
        });
        // await store.selfieSegmentation.send({ image: data.image });
    }
}