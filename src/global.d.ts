declare global {
    interface Window {
        __uv: any;
        $scramjet: any;
    }

    // Scramjet global functions
    function $scramjetLoadController(): any;
    function $scramjetLoadClient(): any;
    function $scramjetLoadWorker(): any;

    // UV config
    const __uv$config: any;

    // ScramjetController type (will be available after calling $scramjetLoadController)
    type ScramjetController = any;
}
export {};
