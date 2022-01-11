import VectorlyFilter from "./filter";

const run = async () => {
    // @ts-ignore
    const vFilter = window.vFilter = new VectorlyFilter();
    await vFilter.init();

    const getVideo = () => new Promise<MediaStream>(async (resolve) => {
        const videoEl: HTMLVideoElement = document.getElementById('input') as HTMLVideoElement;
        const width = 640;
        const height = 480;
        const constraints = {
            video: {
                width, height,
                frameRate: { ideal: 30, max: 30 }
            }
        };

        // @ts-ignore
        const ms = window.ms = await navigator.mediaDevices.getUserMedia(constraints);
        videoEl.srcObject = ms;
        resolve(ms);
    });

    const mediaStream = await getVideo();
    
    const filteredStream = await vFilter.activateBlur(mediaStream);
    // const filteredStream = await vFilter.activateVirtualBg(mediaStream, 'https://vectorly-demos.s3.us-west-1.amazonaws.com/virtual-backgrounds/2.jpg?t=12345');
    console.log(filteredStream);

    const outputVideoEl: HTMLVideoElement = document.getElementById('output') as HTMLVideoElement;
    // @ts-ignore
    outputVideoEl.height = 480;
    // @ts-ignore
    outputVideoEl.width = 640;

    outputVideoEl.srcObject = filteredStream;
};

window.onload = () => {
    run();
};