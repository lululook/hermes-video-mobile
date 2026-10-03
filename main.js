const {
    Plugin,
    Platform
} = require("obsidian");


function isMobile() {
    return !!(
        Platform.isMobile ||
        Platform.isMobileApp ||
        Platform.isIosApp ||
        Platform.isAndroidApp
    );
}


function isHermesMp4(url) {
    if (!url) return false;

    try {
        const u = new URL(url);

        return (
            u.protocol === "https:" &&
            u.host === "ai.lujie.work:15007" &&
            u.pathname.startsWith("/video/") &&
            u.pathname.toLowerCase().endsWith(".mp4")
        );
    } catch (_) {
        return false;
    }
}


function mp4ToHls(url) {
    const u = new URL(url);

    u.hash = "";
    u.search = "";

    u.pathname = u.pathname.replace(
        /\/([^/]+)\.mp4$/i,
        "/$1/index.m3u8"
    );

    return u.toString();
}


function mp4ToPoster(url) {
    const u = new URL(url);

    u.hash = "";
    u.search = "";

    u.pathname = u.pathname.replace(
        /\.mp4$/i,
        ".jpg"
    );

    return u.toString();
}


function pauseOthers(current) {
    document
        .querySelectorAll(
            "video.hermes-mobile-hls"
        )
        .forEach((video) => {
            if (
                video !== current &&
                !video.paused
            ) {
                video.pause();
            }
        });
}


function createPlayer(mp4Url) {
    const wrapper =
        document.createElement("div");

    wrapper.className =
        "hermes-mobile-video";

    wrapper.dataset.hermesUrl =
        mp4Url;

    const video =
        document.createElement("video");

    video.className =
        "hermes-mobile-hls";

    video.controls = true;
    video.autoplay = false;
    video.muted = false;
    video.defaultMuted = false;
    video.playsInline = true;
    video.preload = "metadata";

    video.setAttribute(
        "controls",
        ""
    );

    video.setAttribute(
        "playsinline",
        ""
    );

    video.setAttribute(
        "webkit-playsinline",
        ""
    );

    video.src =
        mp4ToHls(mp4Url);

    video.poster =
        mp4ToPoster(mp4Url);

    video.setAttribute(
        "poster",
        mp4ToPoster(mp4Url)
    );

    video.addEventListener(
        "play",
        () => {
            pauseOthers(video);
        }
    );

    /*
     * 阻止点击播放器时把焦点交回编辑器。
     */
    [
        "pointerdown",
        "mousedown",
        "touchstart",
        "click"
    ].forEach((name) => {
        wrapper.addEventListener(
            name,
            (event) => {
                event.stopPropagation();
            },
            {
                passive:
                    name === "touchstart"
            }
        );
    });

    wrapper.appendChild(video);

    return wrapper;
}


function getHermesUrl(node) {
    if (!node) return null;

    if (
        node.matches &&
        node.matches("img[src]")
    ) {
        const src =
            node.getAttribute("src");

        if (isHermesMp4(src)) {
            return src;
        }
    }

    if (
        node.matches &&
        node.matches("video[src]")
    ) {
        const src =
            node.getAttribute("src");

        if (isHermesMp4(src)) {
            return src;
        }
    }

    if (
        node.matches &&
        node.matches("a[href]")
    ) {
        const href =
            node.getAttribute("href");

        if (isHermesMp4(href)) {
            return href;
        }
    }

    return null;
}


function replaceNode(node) {
    if (!node || !node.isConnected) {
        return;
    }

    if (
        node.closest &&
        node.closest(
            ".hermes-mobile-video"
        )
    ) {
        return;
    }

    const url =
        getHermesUrl(node);

    if (!url) {
        return;
    }

    node.replaceWith(
        createPlayer(url)
    );
}


function scan(root) {
    if (!root) return;

    if (
        root.nodeType === 1
    ) {
        replaceNode(root);
    }

    if (
        !root.querySelectorAll
    ) {
        return;
    }

    const nodes =
        root.querySelectorAll(
            [
                'img[src*="ai.lujie.work:15007"][src*=".mp4"]',
                'video[src*="ai.lujie.work:15007"][src*=".mp4"]',
                'a[href*="ai.lujie.work:15007"][href*=".mp4"]'
            ].join(",")
        );

    for (
        const node of nodes
    ) {
        replaceNode(node);
    }
}


module.exports =
class HermesVideoMobile
extends Plugin {

    async onload() {

        /*
         * 桌面端完全不接管。
         */
        if (!isMobile()) {
            return;
        }

        /*
         * Reading View。
         */
        this.registerMarkdownPostProcessor(
            (el) => {
                scan(el);
            }
        );

        /*
         * Live Preview：
         * 观察 Obsidian 渲染出来的 DOM，
         * 找到远程 MP4 后直接换成 HLS。
         */
        const observer =
            new MutationObserver(
                (mutations) => {

                    for (
                        const mutation
                        of mutations
                    ) {
                        for (
                            const node
                            of mutation.addedNodes
                        ) {
                            scan(node);
                        }
                    }
                }
            );

        observer.observe(
            document.body,
            {
                childList: true,
                subtree: true
            }
        );

        this.register(() => {
            observer.disconnect();
        });

        /*
         * 插件启动时处理已经存在的页面。
         */
        setTimeout(
            () => {
                scan(document.body);
            },
            300
        );

        setTimeout(
            () => {
                scan(document.body);
            },
            1200
        );
    }
};
