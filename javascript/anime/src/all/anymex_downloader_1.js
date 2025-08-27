const mangayomiSources = [{
    "name": "Anymex Downloader #1",
    "lang": "multi",
    "baseUrl": "https://oc.autoembed.cc/",
    "apiUrl": "",
    "iconUrl": "https://raw.githubusercontent.com/RyanYuuki/AnymeX/main/assets/images/logo.png",
    "typeSource": "multi",
    "itemType": 1,
    "version": "0.0.7",
    "pkgPath": "anime/src/all/anymex_downloader_1.js"
}];

class DefaultExtension extends MProvider {

    constructor() {
        super();
        this.client = new Client();
    }

    async requestBody(url) {
        const resp = await this.client(url);
        var doc = new Document(resp.body);
        return doc;
    }

    async requestJson(url) {
        const resp = await this.client(url);
        return JSON.parse(resp.body);
    }

    mapToManga(dataArr, isMovie) {
        var type = isMovie ? "movie" : "tv";
        return dataArr.map((e) => {
            return {
                name: e.title ?? e.name,
                link: JSON.stringify({
                    id: e.id,
                    type,
                    url: `https://themoviedb.hexa.watch/api/tmdb/${type}/${e.id}`,
                }),
                imageUrl:
                    "https://image.tmdb.org/t/p/w500" +
                    (e.poster_path ?? e.backdrop_path),
                description: e.overview,
                author: JSON.stringify({
                    rating: e.vote_average.toString(),
                    year: e.first_air_date ?? e.release_date,
                    type
                })
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
        const { url: link } = JSON.parse(url);
        const resp = await this.client.get(link);
        const parsedData = JSON.parse(resp.body);
        const isMovie = url.includes("movie");

        const name = parsedData.name ?? parsedData.title;
        const chapters = [];

        const idMatch = url.match(/(?:movie|tv)\/(\d+)/);
        const tmdbId = idMatch ? idMatch[1] : null;

        if (!tmdbId) throw new Error("Invalid TMDB ID in URL");

        if (isMovie) {
            chapters.push({
                name: "Movie",
                url: JSON.stringify({
                    id: tmdbId
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
                            episode: ep
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
        const { id, season, episode, tmdbId } = JSON.parse(url);
        const type = !season && !episode ? "movie" : "tv";
        let newUrl = `https://oc.autoembed.cc/${type}/${id ?? tmdbId}`;
        if (season && episode) newUrl += `/${season}/${episode}`
        const [engResponse, hindiResponse] = await Promise.all([
            this.client.get(newUrl),
            this.client.get(`${newUrl}?lang=Hindi`),
        ]);

        const parseResponse = (response, langLabel) => {
            try {
                const data = JSON.parse(response.body);
                console.log(`Fetched ${langLabel} Data =>`, data);

                if (data?.streams) {
                    return data.streams.map((stream) => ({
                        url: stream.stream_url,
                        quality: stream.quality,
                        originalUrl: stream.stream_url,
                        subtitles: [],
                        headers: {
                            Referer: "https://moviebox.ng/",
                            Origin: "https://moviebox.ng",
                        },
                    }));
                }

                if (data?.data?.downloads) {
                    return data.data.downloads.map((stream) => ({
                        url: stream.url,
                        quality: `${langLabel} - ${stream.resolution}`,
                        originalUrl: stream.url,
                        subtitles: (data.data.captions || []).map((sub) => ({
                            file: sub.url,
                            label: sub.lanName,
                        })),
                        headers: {
                            Referer: "https://moviebox.ng/",
                            Origin: "https://moviebox.ng",
                        },
                    }));
                }

                return [];
            } catch (err) {
                console.warn(`Failed to parse ${langLabel} response:`, err);
                return [];
            }
        };

        const engResults = parseResponse(engResponse, "English");
        const hindiResults = parseResponse(hindiResponse, "Hindi");

        const areSame = JSON.stringify(engResults) === JSON.stringify(hindiResults);

        return areSame ? engResults : [...engResults, ...hindiResults];
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
