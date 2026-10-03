const {
    Plugin,
    Platform,
    requestUrl,
    normalizePath,
    Notice
} = require("obsidian");


module.exports = class HermesVideoMobile extends Plugin {

    async onload() {
        const mobile =
            Platform.isMobile ||
            Platform.isIosApp ||
            Platform.isAndroidApp;

        // 电脑端什么都不做。
        // 保留现有 Media Extended + CSS。
        if (!mobile) {
            return;
        }

        this.maxCacheBytes =
            512 * 1024 * 1024;

        this.cacheRoot = normalizePath(
            `${this.app.vault.configDir}/plugins/` +
            `${this.manifest.id}/cache`
        );

        await this.ensureDir(
            this.cacheRoot
        );

        this.registerMarkdownPostProcessor(
            async (el) => {
                await this.processMedia(el);
            }
        );

        this.addCommand({
            id: "clear-video-cache",
            name: "清理手机视频缓存",
            callback: async () => {
                await this.clearCache();
            }
        });
    }


    isHermesVideo(url) {
        if (!url) {
            return false;
        }

        try {
            const parsed =
                new URL(url);

            return (
                parsed.protocol === "https:" &&
                parsed.host ===
                    "ai.lujie.work:15007" &&
                parsed.pathname
                    .toLowerCase()
                    .endsWith(".mp4")
            );
        } catch (_) {
            return false;
        }
    }


    hashUrl(value) {
        let hash = 2166136261;

        for (
            let i = 0;
            i < value.length;
            i++
        ) {
            hash ^= value.charCodeAt(i);

            hash =
                Math.imul(
                    hash,
                    16777619
                );
        }

        return (
            hash >>> 0
        ).toString(16);
    }


    cachePath(url) {
        return normalizePath(
            `${this.cacheRoot}/` +
            `${this.hashUrl(url)}.mp4`
        );
    }


    async ensureDir(path) {
        const adapter =
            this.app.vault.adapter;

        const parts =
            normalizePath(path)
                .split("/")
                .filter(Boolean);

        let current = "";

        for (const part of parts) {
            current = current
                ? `${current}/${part}`
                : part;

            if (
                !await adapter.exists(
                    current
                )
            ) {
                try {
                    await adapter.mkdir(
                        current
                    );
                } catch (_) {
                    // 目录可能被其他任务同时创建。
                }
            }
        }
    }


    getRemoteUrl(node) {
        if (
            node instanceof
            HTMLVideoElement
        ) {
            const direct =
                node.getAttribute("src");

            if (
                this.isHermesVideo(
                    direct
                )
            ) {
                return direct;
            }

            const source =
                node.querySelector(
                    "source[src]"
                );

            if (source) {
                const src =
                    source.getAttribute(
                        "src"
                    );

                if (
                    this.isHermesVideo(
                        src
                    )
                ) {
                    return src;
                }
            }
        }

        if (
            node instanceof
            HTMLImageElement
        ) {
            const src =
                node.getAttribute("src");

            if (
                this.isHermesVideo(
                    src
                )
            ) {
                return src;
            }
        }

        if (
            node instanceof
            HTMLSourceElement
        ) {
            const src =
                node.getAttribute("src");

            if (
                this.isHermesVideo(
                    src
                )
            ) {
                return src;
            }
        }

        return null;
    }


    async processMedia(root) {
        const nodes = Array.from(
            root.querySelectorAll(
                [
                    "video[src]",
                    "video source[src]",
                    "img[src]"
                ].join(",")
            )
        );

        const handled =
            new Set();

        for (const node of nodes) {
            const url =
                this.getRemoteUrl(node);

            if (!url) {
                continue;
            }

            let target = node;

            if (
                node instanceof
                HTMLSourceElement
            ) {
                target =
                    node.closest("video")
                    || node;
            }

            if (
                handled.has(target)
            ) {
                continue;
            }

            if (
                target.closest(
                    ".hermes-video-mobile"
                )
            ) {
                continue;
            }

            handled.add(target);

            await this.renderPlayer(
                target,
                url
            );
        }
    }


    stopEditorActivation(container) {
        const stop = (event) => {
            event.stopPropagation();
        };

        container.addEventListener(
            "pointerdown",
            stop
        );

        container.addEventListener(
            "mousedown",
            stop
        );

        container.addEventListener(
            "touchstart",
            stop,
            {
                passive: true
            }
        );
    }


    async renderPlayer(
        target,
        url
    ) {
        const container =
            document.createElement(
                "div"
            );

        container.className =
            "hermes-video-mobile";

        container.dataset.url =
            url;

        this.stopEditorActivation(
            container
        );

        target.replaceWith(
            container
        );

        const path =
            this.cachePath(url);

        const adapter =
            this.app.vault.adapter;

        if (
            await adapter.exists(path)
        ) {
            this.showVideo(
                container,
                path
            );

            return;
        }

        this.showLoadButton(
            container,
            url,
            path
        );
    }


    showLoadButton(
        container,
        url,
        path
    ) {
        container.innerHTML = "";

        const button =
            document.createElement(
                "button"
            );

        button.className =
            "hermes-video-mobile-load";

        button.type =
            "button";

        const title =
            document.createElement(
                "span"
            );

        title.className =
            "hermes-video-mobile-title";

        title.textContent =
            "▶ 播放本章节";

        const hint =
            document.createElement(
                "span"
            );

        hint.className =
            "hermes-video-mobile-hint";

        hint.textContent =
            "首次播放按需缓存到手机";

        button.appendChild(title);
        button.appendChild(hint);

        container.appendChild(
            button
        );

        button.addEventListener(
            "click",
            async (event) => {
                event.preventDefault();
                event.stopPropagation();

                button.disabled =
                    true;

                title.textContent =
                    "正在准备视频…";

                hint.textContent =
                    "只缓存当前章节";

                try {
                    await this.downloadVideo(
                        url,
                        path
                    );

                    await this.trimCache(
                        path
                    );

                    const video =
                        this.showVideo(
                            container,
                            path
                        );

                    try {
                        await video.play();
                    } catch (_) {
                        // iOS 有时要求缓存完成后
                        // 再点一次播放，这是正常行为。
                    }

                } catch (error) {
                    button.disabled =
                        false;

                    title.textContent =
                        "▶ 重试播放";

                    hint.textContent =
                        "视频缓存失败";

                    new Notice(
                        "Hermes 视频加载失败"
                    );
                }
            }
        );
    }


    async downloadVideo(
        url,
        path
    ) {
        const response =
            await requestUrl({
                url,
                method: "GET"
            });

        if (
            response.status < 200 ||
            response.status >= 300
        ) {
            throw new Error(
                `HTTP ${response.status}`
            );
        }

        if (
            !response.arrayBuffer ||
            response.arrayBuffer
                .byteLength < 1024
        ) {
            throw new Error(
                "视频内容为空"
            );
        }

        await this.ensureDir(
            this.cacheRoot
        );

        await this.app.vault
            .adapter
            .writeBinary(
                path,
                response.arrayBuffer
            );
    }


    showVideo(
        container,
        path
    ) {
        container.innerHTML = "";

        const adapter =
            this.app.vault.adapter;

        const localUrl =
            adapter.getResourcePath(
                path
            );

        const video =
            document.createElement(
                "video"
            );

        video.className =
            "hermes-video-mobile-player";

        video.controls =
            true;

        video.autoplay =
            false;

        video.preload =
            "metadata";

        video.playsInline =
            true;

        video.setAttribute(
            "playsinline",
            ""
        );

        video.setAttribute(
            "webkit-playsinline",
            ""
        );

        video.src =
            localUrl;

        video.addEventListener(
            "play",
            () => {
                this.pauseOtherVideos(
                    video
                );
            }
        );

        container.appendChild(
            video
        );

        return video;
    }


    pauseOtherVideos(
        current
    ) {
        const videos =
            document.querySelectorAll(
                ".hermes-video-mobile-player"
            );

        for (
            const video of videos
        ) {
            if (
                video !== current &&
                !video.paused
            ) {
                video.pause();
            }
        }
    }


    async trimCache(
        keepPath
    ) {
        const adapter =
            this.app.vault.adapter;

        let listing;

        try {
            listing =
                await adapter.list(
                    this.cacheRoot
                );
        } catch (_) {
            return;
        }

        const files = [];

        let total = 0;

        for (
            const path of
            listing.files
        ) {
            const stat =
                await adapter.stat(
                    path
                );

            if (!stat) {
                continue;
            }

            total +=
                stat.size || 0;

            files.push({
                path,
                size:
                    stat.size || 0,
                mtime:
                    stat.mtime || 0
            });
        }

        if (
            total <=
            this.maxCacheBytes
        ) {
            return;
        }

        files.sort(
            (a, b) =>
                a.mtime - b.mtime
        );

        for (
            const file of files
        ) {
            if (
                total <=
                this.maxCacheBytes
            ) {
                break;
            }

            if (
                file.path ===
                keepPath
            ) {
                continue;
            }

            try {
                await adapter.remove(
                    file.path
                );

                total -=
                    file.size;
            } catch (_) {
                // 忽略单文件清理失败
            }
        }
    }


    async clearCache() {
        const adapter =
            this.app.vault.adapter;

        try {
            if (
                await adapter.exists(
                    this.cacheRoot
                )
            ) {
                await adapter.rmdir(
                    this.cacheRoot,
                    true
                );
            }
        } catch (_) {
            // 继续重建目录
        }

        await this.ensureDir(
            this.cacheRoot
        );

        new Notice(
            "Hermes 视频缓存已清理"
        );
    }
};
