const mangayomiSources = [{
    "name": "AniHQ",
    "lang": "en",
    "id": 832952401,
    "baseUrl": "https://anihq.to",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=64&domain=anihq.to",
    "typeSource": "single",
    "itemType": 1,
    "version": "5.0.2",
    "pkgPath": "anime/src/en/anihq.js"
}];

class AniHqExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        // Assuming Cheerio is available in the environment for HTML parsing.
        this.cheerio = require('cheerio');
    }

    getPreferredUrl() {
        return this.baseUrl;
    }

    // Helper to fetch and parse HTML
    async fetchHtml(url) {
        try {
            const response = await this.client.get(url);
            return response.body;
        } catch (error) {
            console.error(`Failed to fetch HTML from ${url}:`, error);
            return null;
        }
    }

    // Helper to parse list items from search results, popular page, etc.
    parseSearchItems($) {
        const items = [];
        $('.film_list-wrap .flw-item').each((i, element) => {
            const item = $(element);
            const name = item.find('.film-detail .film-name a').text().trim();
            const link = this.baseUrl + item.find('.film-detail .film-name a').attr('href');
            const imageUrl = item.find('.film-poster img').attr('data-src');
            items.push({ name, link, imageUrl });
        });
        return items;
    }

    // The main search method, now handles filters and pagination
    async search(query, page = 1, filters) {
        let url = `${this.baseUrl}/search/?asp=1`;

        if (query) {
            url += `&s_keyword=${encodeURIComponent(query)}`;
        }

        if (page > 1) {
            url += `&page=${page}`;
        }

        if (filters) {
            // Sorting
            if (filters.s_orderby) {
                url += `&s_orderby=${filters.s_orderby}`;
            }
            if (filters.s_order) {
                url += `&s_order=${filters.s_order}`;
            }

            // Status (can be multiple)
            if (filters.s_status && Array.isArray(filters.s_status)) {
                filters.s_status.forEach(status => {
                    url += `&s_status[]=${status}`;
                });
            }

            // Genre (can be multiple)
            if (filters.s_genre && Array.isArray(filters.s_genre)) {
                filters.s_genre.forEach(genre => {
                    url += `&s_genre[]=${genre}`;
                });
            }
        }

        const html = await this.fetchHtml(url);
        if (!html) return { list: [], hasNextPage: false };

        const $ = this.cheerio.load(html);
        const items = this.parseSearchItems($);

        const hasNextPage = $('.pagination .next').length > 0;
        return { list: items, hasNextPage };
    }

    // Popular is just a search sorted by rating
    async getPopular(page) {
        return this.search("", page, { s_orderby: "rating", s_order: "desc" });
    }

    get supportsLatest() {
        return true;
    }

    // Latest is just a search sorted by last updated
    async getLatestUpdates(page) {
        return this.search("", page, { s_orderby: "updated", s_order: "desc" });
    }

    async getDetail(url) {
        const html = await this.fetchHtml(url);
        if (!html) return null;

        const $ = this.cheerio.load(html);
        const name = $('.heading-name').text().trim();
        const description = $('.description').text().trim();
        const imageUrl = $('.anime-poster .film-poster img').attr('src');

        // Get anime ID for fetching episodes
        const animeId = $('.block_area-seasons').attr('data-id');
        if (!animeId) {
            console.error("Could not find anime ID on page:", url);
            return { name, description, imageUrl, chapters: [] };
        }

        // Fetch episodes via AJAX
        const episodesUrl = `${this.baseUrl}/ajax/episode/list/${animeId}`;
        const episodesHtml = await this.fetchHtml(episodesUrl);
        if (!episodesHtml) return { name, description, imageUrl, chapters: [] };

        const ep$ = this.cheerio.load(episodesHtml);
        const chapters = [];
        ep$('.ssl-item.ep-item').each((i, element) => {
            const epItem = ep$(element);
            const epName = epItem.find('.e-title').text().trim();
            const epUrl = this.baseUrl + epItem.attr('href');
            chapters.push({ name: epName, url: epUrl });
        });

        return {
            name,
            description,
            imageUrl,
            chapters: chapters.reverse() // Show latest episodes first
        };
    }

    async getVideoList(url) {
        const html = await this.fetchHtml(url);
        if (!html) return [];

        const $ = this.cheerio.load(html);
        const episodeId = $('.block_area-players').attr('data-id');
        if (!episodeId) {
            console.error("Could not find episode ID on page:", url);
            return [];
        }

        const videoList = [];
        const servers = $('.anime_servers .server-item');

        for (let i = 0; i < servers.length; i++) {
            const server = $(servers[i]);
            const serverName = server.attr('title') || `Server ${i + 1}`;
            const linkId = server.attr('data-link-id');

            if (!linkId) continue;

            try {
                // Get the actual streaming link for the server
                const linkDataUrl = `${this.baseUrl}/ajax/get-link/${linkId}?id=${episodeId}`;
                const linkDataResponse = await this.client.get(linkDataUrl);
                const linkData = JSON.parse(linkDataResponse.body);

                if (!linkData || !linkData.link) continue;

                const streamingUrl = linkData.link.startsWith('//') ? 'https:' + linkData.link : linkData.link;
                const streamingPageHtml = await this.fetchHtml(streamingUrl);
                
                if (!streamingPageHtml) continue;

                // Regex to find the video sources JSON within the script tag
                const sourcesRegex = /sources:\s*(\[[\s\S]*?\])/;
                const match = streamingPageHtml.match(sourcesRegex);
                
                if (match && match[1]) {
                    let sourcesJson = match[1].replace(/'/g, '"'); // Replace single quotes with double quotes for valid JSON
                    const sources = JSON.parse(sourcesJson);
                    
                    sources.forEach(source => {
                        videoList.push({
                            url: source.file,
                            quality: `${serverName} - ${source.label}`,
                            originalUrl: source.file,
                            headers: { Referer: this.baseUrl }
                        });
                    });
                }
            } catch (error) {
                console.error(`Failed to process server ${serverName}:`, error);
            }
        }

        return videoList;
    }

    // Helper to dynamically get the list of genres
    async getGenreList() {
        const url = `${this.baseUrl}/genre/`;
        const html = await this.fetchHtml(url);
        if (!html) return [];

        const $ = this.cheerio.load(html);
        const genres = [];
        $('.sb-genre-list li a').each((i, element) => {
            const genre = $(element);
            const name = genre.text().trim();
            const value = genre.attr('href').split('/').pop(); // e.g., "action" from "/genre/action/"
            if (name && value) {
                genres.push({ name, value });
            }
        });
        return genres;
    }

    // Defines the filters available in the UI
    async getFilterList() {
        const genres = await this.getGenreList();

        return [
            {
                type: "Sort",
                name: "s_orderby",
                options: [
                    { name: "Default", value: "" },
                    { name: "Recently Updated", value: "updated" },
                    { name: "Recently Added", value: "created" },
                    { name: "Name", value: "name" },
                    { name: "Score", value: "rating" },
                    { name: "Most Viewed", value: "views" }
                ],
            },
            {
                type: "Sort",
                name: "s_order",
                options: [
                    { name: "Descending", value: "desc" },
                    { name: "Ascending", value: "asc" }
                ],
            },
            {
                type: "CheckBox",
                name: "s_status",
                options: [
                    { name: "Airing", value: "airing" },
                    { name: "Completed", value: "completed" },
                    { name: "Upcoming", value: "upcoming" }
                ]
            },
            {
                type: "CheckBox",
                name: "s_genre",
                options: genres
            }
        ];
    }

    // Methods for manga/novels are not applicable for this anime source
    async getHtmlContent(url) {
        throw new Error("Not implemented for anime source");
    }

    async cleanHtmlContent(html) {
        throw new Error("Not implemented for anime source");
    }

    async getPageList(url) {
        throw new Error("Not implemented for anime source");
    }

    getSourcePreferences() {
        return [];
    }
}
