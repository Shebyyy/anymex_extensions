const mangayomiSources = [{
    "name": "Anymex Special #4",
    "lang": "multi",
    "baseUrl": "https://himer365ery.com/",
    "apiUrl": "",
    "iconUrl": "https://raw.githubusercontent.com/RyanYuuki/AnymeX/main/assets/images/logo.png",
    "typeSource": "multi",
    "itemType": 1,
    "version": "0.0.1",
    "pkgPath": "anime/src/all/anymex_special_4.js"
}];

class DefaultExtension extends MProvider {

    constructor() {
        super();
        this.client = new Client();
    }

    mapToManga(dataArr, isMovie) {
        var type = isMovie ? "movie" : "tv";
        return dataArr.map((e) => {
            return {
                name: e.title ?? e.name,
                link: `https://themoviedb.hexa.watch/api/tmdb/${type}/${e.id}`,
                imageUrl:
                    "https://image.tmdb.org/t/p/w500" +
                    (e.poster_path ?? e.backdrop_path),
                description: e.overview,
            };
        });
    }

    async requestSearch(query, isMovie) {
        const type = isMovie ? "movie" : "tv";
        const url = `https://themoviedb.hexa.watch/api/tmdb/search/${type}?language=en-US&query=${encodeURIComponent(
            query
        )}&page=1&include_adult=false`;

        const resp = await this.client.get(url);
        const data = JSON.parse(resp.body);
        return data;
    }

    getHeaders(url) {
        return {
            "Referer": "https://himer365ery.com/",
            "Origin": "https://himer365ery.com"
        }
    }
    async getPopular(page) {
        throw new Error("getPopular not implemented");
    }
    get supportsLatest() {
        throw new Error("supportsLatest not implemented");
    }
    async getLatestUpdates(page) {
        throw new Error("getLatestUpdates not implemented");
    }
    async search(query, page = 1, filters) {
        try {
            const cleanedQuery = query.replace(/\bseasons?\b/gi, "").trim();

            const [movieData, seriesData] = await Promise.all([
                this.requestSearch(cleanedQuery, true),
                this.requestSearch(cleanedQuery, false),
            ]);

            const movies = this.mapToManga(movieData.results || [], true);
            const series = this.mapToManga(seriesData.results || [], false);

            const maxLength = Math.max(movies.length, series.length);
            const mixedResults = [];

            for (let i = 0; i < maxLength; i++) {
                if (i < series.length) mixedResults.push(series[i]);
                if (i < movies.length) mixedResults.push(movies[i]);

            }

            return {
                list: mixedResults,
                hasNextPage: false,
            };
        } catch (error) {
            console.error("Search error:", error);
            throw error;
        }
    }

    async getDetail(url) {
        const resp = await this.client.get(url);
        const parsedData = JSON.parse(resp.body);
        const isMovie = url.includes("movie");

        const name = parsedData.name ?? parsedData.title;
        const chapters = [];

        const idMatch = url.match(/(?:movie|tv)\/(\d+)/);
        const tmdbId = idMatch ? idMatch[1] : null;
        let imdbId = parsedData.imdb_id;

        if (!imdbId) {
            try {
                const type = !isMovie ? "tv" : "movie";
                const resp = await this.client.get(
                    `https://db.cineby.app/3/${type}/${tmdbId}?append_to_response=external_ids&language=en&api_key=ad301b7cc82ffe19273e55e4d4206885`,
                );
                const d = JSON.parse(resp.body);
                imdbId = d.external_ids.imdb_id;
            } catch (error) {
                console.error("Error getting IMDB ID:", error);
                throw error;
            }
        }

        if (!tmdbId) throw new Error("Invalid TMDB ID in URL");

        if (isMovie) {
            chapters.push({
                name: "Movie",
                url: JSON.stringify({
                    id: tmdbId,
                    type: "movie",
                    imdbId
                }),
            });
        } else {
            const seasons = parsedData.seasons || [];

            for (const season of seasons) {
                if (season.season_number === 0) continue;

                const episodeCount = season.episode_count;

                for (let ep = 1; ep <= episodeCount; ep++) {
                    chapters.push({
                        name: `S${season.season_number} · E${ep}`,
                        url: JSON.stringify({
                            id: tmdbId,
                            season: season.season_number,
                            episode: ep,
                            type: "tv",
                            imdbId
                        }),
                    });
                }
            }
        }

        return {
            name,
            chapters: chapters.reverse(),
        };
    }
    // For novel html content
    async getHtmlContent(url) {
        throw new Error("getHtmlContent not implemented");
    }
    // Clean html up for reader
    async cleanHtmlContent(html) {
        throw new Error("cleanHtmlContent not implemented");
    }
    async getVideoList(url) {
        try {
            const { season, episode, imdbId } = JSON.parse(url);
            const isMovie = !season && !episode;

            const playUrl = `https://himer365ery.com/play/${imdbId}`;

            const resp = await this.client.get(playUrl, this.getHeaders());
            const htmlContent = resp.body;

            const fileUrlMatch = htmlContent.match(/"file":"([^"]+)"/);
            if (!fileUrlMatch) {
                console.warn("Failed to extract file URL from HTML content");
                return [];
            }

            const fileUrl = fileUrlMatch[1].replace(/\\\//g, "/");
            const decodedFileUrl = decodeURIComponent(fileUrl);

            const keyMatch = htmlContent.match(/"key":"([^"]+)"/);
            if (!keyMatch) {
                console.warn("Failed to extract key from HTML content");
                return [];
            }

            const key = keyMatch[1];

            const finalUrl = decodedFileUrl.includes("https")
                ? decodedFileUrl
                : `https://jarvi366dow.com${decodedFileUrl}`;

            const headers = {
                ...this.getHeaders(),
                "X-CSRF-TOKEN": key
            };

            const playerResp = await this.client.get(finalUrl, headers);
            const playerData = JSON.parse(playerResp.body);

            const videoList = [];

            if (isMovie) {
                for (const source of playerData) {
                    if (source.file && source.title) {
                        const playlistUrl = `https://jarvi366dow.com/playlist/${source.file.replaceAll("~", "")}.txt`;

                        try {
                            const streamResp = await this.client.get(playlistUrl, headers);

                            videoList.push({
                                url: streamResp.body,
                                quality: source.title,
                                originalUrl: streamResp.body,
                                subtitles: [],
                                headers: {
                                    Referer: "https://himer365ery.com/",
                                    Origin: "https://himer365ery.com"
                                }
                            });
                        } catch (error) {
                            console.error(`Error fetching stream from ${playlistUrl}:`, error);
                        }
                    }
                }
            } else {
                // Process TV show streams
                if (!season || !episode) {
                    throw new Error("Season and episode are required for TV shows");
                }

                const seasonBlock = playerData.find((s) => s.id == season);
                if (!seasonBlock || !Array.isArray(seasonBlock.folder)) {
                    throw new Error(`Invalid season block for season ${season}`);
                }

                const episodeBlock = seasonBlock.folder.find((e) => e.episode == episode);
                if (!episodeBlock || !Array.isArray(episodeBlock.folder)) {
                    throw new Error(`Invalid episode block for episode ${episode}`);
                }

                for (const source of episodeBlock.folder) {
                    if (source.file && source.title) {
                        const strippedUri = decodeURIComponent(source.file.replaceAll("~", ""));
                        const playlistUrl = strippedUri.includes("playlist")
                            ? `https://jarvi366dow.com/${strippedUri}`
                            : `https://jarvi366dow.com/playlist/${strippedUri}.txt`;

                        try {
                            const streamResp = await this.client.get(playlistUrl, headers);

                            videoList.push({
                                url: streamResp.body,
                                quality: source.title,
                                originalUrl: streamResp.body,
                                subtitles: [],
                                headers: {
                                    Referer: "https://himer365ery.com/",
                                    Origin: "https://himer365ery.com"
                                }
                            });
                        } catch (error) {
                            console.error(`Error fetching stream from ${playlistUrl}:`, error);
                        }
                    }
                }
            }

            return videoList;

        } catch (error) {
            console.error("Error in getVideoList: " + error);
            return [];
        }
    }
    // For manga chapter pages
    async getPageList(url) {
        throw new Error("getPageList not implemented");
    }
    getFilterList() {
        throw new Error("getFilterList not implemented");
    }
    getSourcePreferences() {
        throw new Error("getSourcePreferences not implemented");
    }
}
