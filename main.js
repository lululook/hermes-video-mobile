const {
    Plugin,
    Platform
} = require("obsidian");

const {
    Decoration,
    ViewPlugin,
    WidgetType
} = require("@codemirror/view");

const {
    RangeSetBuilder
} = require("@codemirror/state");


const MP4_PATTERN =
    /!\[\]\((https:\/\/ai\.lujie\.work:15007\/video\/[^)\s]+\.mp4)\)/g;


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


function toHls(url) {
    const u = new URL(url);

    u.hash = "";
    u.search = "";

    u.pathname = u.pathname.replace(
        /\/([^/]+)\.mp4$/i,
        "/$1/index.m3u8"
    );

    return u.toString();
}


function pauseOtherPlayers(current) {
    document
        .querySelectorAll("video.hermes-hls-player")
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
        "hermes-hls-wrapper";

    const video =
        document.createElement("video");

    video.className =
        "hermes-hls-player";

    video.controls = true;
    video.autoplay = false;
    video.defaultMuted = false;
    video.muted = false;
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
        toHls(mp4Url);

    video.addEventListener(
        "play",
        () => {
            pauseOtherPlayers(
                video
            );
        }
    );

    /*
     * 关键：
     * 防止点击播放器时，
     * CodeMirror 把焦点落回 Markdown 源码。
     */
    [
        "pointerdown",
        "mousedown",
        "touchstart",
        "click"
    ].forEach((eventName) => {
        wrapper.addEventListener(
            eventName,
            (event) => {
                event.stopPropagation();
            },
            {
                passive:
                    eventName ===
                    "touchstart"
            }
        );
    });

    wrapper.appendChild(
        video
    );

    return wrapper;
}


class HermesVideoWidget
    extends WidgetType {

    constructor(url) {
        super();
        this.url = url;
    }

    eq(other) {
        return (
            other.url ===
            this.url
        );
    }

    toDOM() {
        return createPlayer(
            this.url
        );
    }

    ignoreEvent() {
        /*
         * 让视频控件自己处理点击，
         * 不让编辑器抢事件。
         */
        return true;
    }
}


function buildDecorations(view) {
    const builder =
        new RangeSetBuilder();

    const doc =
        view.state.doc;

    for (
        let lineNo = 1;
        lineNo <= doc.lines;
        lineNo++
    ) {
        const line =
            doc.line(lineNo);

        const text =
            line.text;

        MP4_PATTERN.lastIndex =
            0;

        let match;

        while (
            (
                match =
                    MP4_PATTERN.exec(
                        text
                    )
            ) !== null
        ) {
            const url =
                match[1];

            const from =
                line.from +
                match.index;

            const to =
                from +
                match[0].length;

            builder.add(
                from,
                to,
                Decoration.replace({
                    widget:
                        new HermesVideoWidget(
                            url
                        )
                })
            );
        }
    }

    return builder.finish();
}


const mobileEditorExtension =
    ViewPlugin.fromClass(
        class {

            constructor(view) {
                this.decorations =
                    buildDecorations(
                        view
                    );
            }

            update(update) {
                if (
                    update.docChanged ||
                    update.viewportChanged
                ) {
                    this.decorations =
                        buildDecorations(
                            update.view
                        );
                }
            }
        },
        {
            decorations:
                value =>
                    value.decorations
        }
    );


module.exports =
class HermesVideoMobile
extends Plugin {

    async onload() {

        /*
         * Mac/Windows/Linux：
         * 完全不做任何事情。
         */
        if (!isMobile()) {
            return;
        }

        /*
         * Live Preview：
         * 直接把 ![](xxx.mp4)
         * 替换成 HLS 播放器。
         */
        this.registerEditorExtension(
            mobileEditorExtension
        );

        /*
         * Reading View：
         * 如果 Obsidian 已经把 MP4
         * 当 img/video 渲染，
         * 再替换成 HLS 播放器。
         */
        this.registerMarkdownPostProcessor(
            (el) => {

                const targets =
                    Array.from(
                        el.querySelectorAll(
                            "img[src], video[src]"
                        )
                    );

                for (
                    const target
                    of targets
                ) {
                    const src =
                        target.getAttribute(
                            "src"
                        );

                    if (
                        !isHermesMp4(
                            src
                        )
                    ) {
                        continue;
                    }

                    if (
                        target.closest(
                            ".hermes-hls-wrapper"
                        )
                    ) {
                        continue;
                    }

                    target.replaceWith(
                        createPlayer(
                            src
                        )
                    );
                }
            }
        );
    }
};
